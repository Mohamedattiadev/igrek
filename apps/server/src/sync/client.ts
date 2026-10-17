import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import type { Presence, ShareLevel, SharePreview, TeamMember, TeamStatus } from "@godeye/core";
import type { Bus } from "../bus";
import {
  decodeInvite,
  decrypt,
  encrypt,
  generateTeamKey,
  importTeamKey,
  keyCheck,
  projectKey,
  type TeamKey,
} from "./crypto";
import { scrubDeep } from "./scrub";

interface SyncConfig {
  hub: string;
  token: string;
  teamKey: string;
  user: { id: string; username: string; displayName: string; role: "admin" | "member" | "viewer" };
}

interface WireEvent {
  seq: number;
  project: string;
  kind: string;
  author: string;
  device: string;
  id: string;
  at: number;
  nonce: string;
  data: string;
}

const SHARE_LEVELS: ShareLevel[] = ["off", "summary", "full"];
const PRESENCE_TTL = 60_000;

function deviceOf(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function wsUrl(hub: string, token: string): string {
  return `${hub.replace(/^http/, "ws").replace(/\/+$/, "")}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Team sync (plan.md Faz 4). Local-first: everything is written to the local
 * database first; this only ships encrypted copies of shared projects to the
 * hub and folds teammates' events back in. Rows from teammates carry their
 * author and are never sent back out, so nothing echoes or conflicts.
 */
export class Sync {
  private config?: SyncConfig;
  private key?: TeamKey;
  private socket?: WebSocket;
  private connected = false;
  private keyMismatch = false;
  private signedOut = false;
  private retry?: ReturnType<typeof setTimeout>;
  private loops: ReturnType<typeof setInterval>[] = [];
  private keyToProject = new Map<string, string>();
  private indexKey?: string;
  private members = new Map<string, TeamMember>();
  private online = new Set<string>();
  private presence = new Map<string, Presence & { expires: number }>();
  private flushing = false;

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly file: string,
    private readonly myName: () => string = () => hostname(),
  ) {}

  // ---- setup ---------------------------------------------------------------------

  private save(): void {
    if (!this.config) return;
    writeFileSync(this.file, JSON.stringify(this.config), { mode: 0o600 });
    chmodSync(this.file, 0o600);
  }

  async start(): Promise<void> {
    if (!existsSync(this.file)) return;
    try {
      this.config = JSON.parse(readFileSync(this.file, "utf8")) as SyncConfig;
      this.key = await importTeamKey(this.config.teamKey);
      this.indexKey = await projectKey(this.key, "__team-index__");
      this.open();
    } catch {
      this.config = undefined;
    }
  }

  private async hubRequest<T>(path: string, init: RequestInit = {}, config = this.config): Promise<T> {
    if (!config) throw new Error("Not connected to a team");
    const res = await fetch(`${config.hub.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.token}`, ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(body.error ?? `Hub answered ${res.status}`);
    return body;
  }

  /**
   * Signs in to a hub. The first admin creates the team key here (shown once as
   * the recovery key); everyone else brings it in their invite.
   */
  async connect(input: {
    hub?: string;
    username?: string;
    password?: string;
    invite?: string;
    newPassword?: string;
  }): Promise<{ status: TeamStatus; recoveryKey?: string }> {
    const invite = input.invite ? decodeInvite(input.invite) : undefined;
    const hub = (invite?.hub ?? input.hub ?? "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/.test(hub)) throw new Error("Hub address must start with https://");
    const res = await fetch(`${hub}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: invite?.username ?? input.username,
        password: input.password || invite?.password,
        device: `God Eye · ${this.myName()}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: SyncConfig["user"] & { mustChangePassword?: boolean };
      keyCheck?: string | null;
      error?: string;
    };
    if (!res.ok || !body.token || !body.user) throw new Error(body.error ?? "Could not sign in");

    let teamKey = invite?.key;
    let recoveryKey: string | undefined;
    if (!teamKey && !body.keyCheck && body.user.role === "admin") {
      teamKey = generateTeamKey();
      recoveryKey = teamKey;
    }
    if (!teamKey) throw new Error("Use the invite code you received; it contains the team key");
    const key = await importTeamKey(teamKey);
    const check = await keyCheck(key);
    const config: SyncConfig = { hub, token: body.token, teamKey, user: body.user };
    if (body.keyCheck && body.keyCheck !== check) throw new Error("This team key doesn't match the team on this hub");
    if (!body.keyCheck)
      await this.hubRequest("/api/key-check", { method: "POST", body: JSON.stringify({ value: check }) }, config);
    if (body.user.mustChangePassword) {
      if (!input.newPassword) throw new Error("Choose a new password to finish joining");
      await this.hubRequest(
        "/api/password",
        { method: "POST", body: JSON.stringify({ password: input.newPassword }) },
        config,
      );
    }

    this.config = config;
    this.key = key;
    this.signedOut = false;
    this.indexKey = await projectKey(key, "__team-index__");
    this.save();
    this.open();
    return { status: this.status(), recoveryKey };
  }

  disconnect(): void {
    this.close();
    this.config = undefined;
    this.key = undefined;
    if (existsSync(this.file)) rmSync(this.file);
    this.bus.publish({ type: "team-changed" });
  }

  status(): TeamStatus {
    return {
      connected: this.connected,
      configured: !!this.config,
      hub: this.config?.hub,
      user: this.config?.user,
      keyMismatch: this.keyMismatch,
      signedOut: this.signedOut,
      pending: this.pendingCount(),
      lastSyncAt: this.lastSyncAt,
      members: [...this.members.values()].map((m) => ({ ...m, online: this.online.has(m.id) })),
    };
  }

  private lastSyncAt?: number;

  /** How many things are waiting to go out (shown as "offline, 12 waiting"). */
  pendingCount(): number {
    let n = 0;
    for (const project of this.sharedProjects()) {
      n += (
        this.db
          .query(
            "SELECT COUNT(*) AS n FROM sessions WHERE project_id = ? AND author_id IS NULL AND private = 0 AND MAX(COALESCE(updated_at, 0), COALESCE(summary_at, 0)) > ?",
          )
          .get(project.id, this.cursor("sessions", project.id)) as { n: number }
      ).n;
      n += (
        this.db.query("SELECT COUNT(*) AS n FROM memory_items WHERE project_id = ? AND dirty = 1").get(project.id) as {
          n: number;
        }
      ).n;
    }
    return n;
  }

  /**
   * "What is being shared?" (plan.md 4.2): what the next sync would send for a
   * project, after secrets are removed — before it's encrypted.
   */
  preview(projectId: string): SharePreview {
    const project = this.db.query("SELECT id, share FROM projects WHERE id = ?").get(projectId) as
      | { id: string; share: ShareLevel }
      | undefined;
    if (!project || project.share === "off")
      return { share: project?.share ?? "off", sessions: [], messages: 0, memory: [], privateSessions: 0 };
    const sessions = this.db
      .query(
        "SELECT id, title, summary, first_prompt, files_touched, updated_at FROM sessions WHERE project_id = ? AND author_id IS NULL AND private = 0 ORDER BY updated_at DESC LIMIT 5",
      )
      .all(projectId) as {
      id: string;
      title: string | null;
      summary: string | null;
      first_prompt: string | null;
      files_touched: string;
      updated_at: number;
    }[];
    const full = project.share === "full";
    return {
      share: project.share,
      sessions: sessions.map((s) => {
        const summary = s.summary
          ? (JSON.parse(s.summary) as { title?: string; texts?: Record<string, { did?: string[] }> })
          : undefined;
        return scrubDeep({
          id: s.id,
          title: s.title ?? "",
          summary: summary
            ? (summary.texts?.en?.did ?? Object.values(summary.texts ?? {})[0]?.did ?? []).slice(0, 3)
            : [],
          firstPrompt: full ? (s.first_prompt ?? "").slice(0, 300) : undefined,
          files: full ? (JSON.parse(s.files_touched) as string[]).slice(-5) : [],
          updatedAt: s.updated_at,
        });
      }),
      messages: full
        ? (
            this.db
              .query(
                "SELECT COUNT(*) AS n FROM messages m JOIN sessions s ON s.id = m.session_id WHERE s.project_id = ? AND s.author_id IS NULL AND s.private = 0",
              )
              .get(projectId) as { n: number }
          ).n
        : 0,
      memory: (
        this.db
          .query(
            "SELECT section, text FROM memory_items WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 5",
          )
          .all(projectId) as {
          section: string;
          text: string;
        }[]
      ).map((m) => scrubDeep(m)),
      privateSessions: (
        this.db.query("SELECT COUNT(*) AS n FROM sessions WHERE project_id = ? AND private = 1").get(projectId) as {
          n: number;
        }
      ).n,
    };
  }

  /** Admin pass-through to the hub (users, devices, audit). */
  admin<T>(path: string, init?: RequestInit): Promise<T> {
    return this.hubRequest<T>(`/api/admin${path}`, init);
  }

  me<T>(path: string, init?: RequestInit): Promise<T> {
    return this.hubRequest<T>(`/api${path}`, init);
  }

  teamKey(): string | undefined {
    return this.config?.teamKey;
  }

  // ---- sharing ---------------------------------------------------------------------

  setShare(projectId: string, level: ShareLevel): void {
    if (!SHARE_LEVELS.includes(level)) throw new Error("Unknown share level");
    this.db.query("UPDATE projects SET share = ? WHERE id = ?").run(level, projectId);
    if (level !== "off") void this.subscribeAll();
    this.bus.publish({ type: "team-changed" });
  }

  /** Teammates active right now, with the files you both have open flagged. */
  presenceList(projectId?: string): Presence[] {
    const now = Date.now();
    return [...this.presence.values()]
      .filter((p) => p.expires > now && (!projectId || p.projectId === projectId))
      .map(({ expires: _e, ...p }) => {
        const mine = this.db
          .query(
            "SELECT files_touched FROM sessions WHERE project_id = ? AND author_id IS NULL AND updated_at > ? ORDER BY updated_at DESC LIMIT 3",
          )
          .all(p.projectId, now - 60 * 60_000) as { files_touched: string }[];
        const own = new Set(mine.flatMap((s) => JSON.parse(s.files_touched) as string[]));
        const overlap = p.files.filter((f) => own.has(f));
        return overlap.length ? { ...p, overlap } : p;
      });
  }

  // ---- connection ------------------------------------------------------------------

  private open(): void {
    if (!this.config) return;
    this.close();
    const socket = new WebSocket(wsUrl(this.config.hub, this.config.token));
    this.socket = socket;
    socket.onopen = () => {
      this.connected = true;
      void this.verifyKey();
      void this.loadMembers();
      void this.subscribeAll();
      this.bus.publish({ type: "team-changed" });
    };
    socket.onmessage = (message) => void this.receive(String(message.data));
    socket.onclose = (event) => {
      this.connected = false;
      this.bus.publish({ type: "team-changed" });
      if (event.code === 4001) {
        // Signed out by an admin (password reset, disabled, removed).
        this.signedOut = true;
        this.bus.publish({ type: "team-changed" });
        return;
      }
      if (this.config) this.retry = setTimeout(() => void this.reopen(), 5000);
    };
    this.loops.push(setInterval(() => void this.flush(), 3000));
    this.loops.push(setInterval(() => void this.sendPresence(), 15_000));
    this.loops.push(setInterval(() => void this.loadMembers(), 5 * 60_000));
  }

  /** Reconnect, unless the hub no longer accepts our token. */
  private async reopen(): Promise<void> {
    try {
      await this.hubRequest("/api/me");
    } catch (err) {
      if ((err as Error).message === "Not signed in") {
        this.signedOut = true;
        this.bus.publish({ type: "team-changed" });
        return;
      }
    }
    this.open();
  }

  private close(): void {
    clearTimeout(this.retry);
    for (const loop of this.loops) clearInterval(loop);
    this.loops = [];
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = undefined;
    this.connected = false;
  }

  private send(message: unknown): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  /** If the team key was changed on the hub, our copies can't be read: say so instead of syncing garbage. */
  private async verifyKey(): Promise<void> {
    if (!this.key) return;
    try {
      const me = await this.hubRequest<{ keyCheck: string | null }>("/api/me");
      this.keyMismatch = !!me.keyCheck && me.keyCheck !== (await keyCheck(this.key));
      if (this.keyMismatch) this.close();
      this.bus.publish({ type: "team-changed" });
    } catch {
      // Offline: try again next connect.
    }
  }

  private async loadMembers(): Promise<void> {
    try {
      const list = await this.hubRequest<TeamMember[]>("/api/members");
      this.members = new Map(list.map((m) => [m.id, m]));
      this.bus.publish({ type: "team-changed" });
    } catch {
      // Offline: keep the last known list.
    }
  }

  private cursor(scope: string, key: string): number {
    return (
      (
        this.db.query("SELECT value FROM sync_cursors WHERE scope = ? AND key = ?").get(scope, key) as
          | { value: number }
          | undefined
      )?.value ?? 0
    );
  }

  private setCursor(scope: string, key: string, value: number): void {
    this.db
      .query(
        "INSERT INTO sync_cursors (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value",
      )
      .run(scope, key, value);
  }

  private sharedProjects(): { id: string; name: string; identity: string | null; path: string; share: ShareLevel }[] {
    return this.db.query("SELECT id, name, identity, path, share FROM projects WHERE share != 'off'").all() as {
      id: string;
      name: string;
      identity: string | null;
      path: string;
      share: ShareLevel;
    }[];
  }

  private async subscribeAll(): Promise<void> {
    if (!this.key || !this.indexKey) return;
    const keys = [this.indexKey];
    for (const project of this.sharedProjects()) {
      const key = await projectKey(this.key, project.identity ?? `path:${project.path}`);
      this.keyToProject.set(key, project.id);
      keys.push(key);
    }
    const since = Object.fromEntries(keys.map((k) => [k, this.cursor("seq", k)]));
    this.send({ op: "sub", projects: keys, since });
  }

  // ---- outgoing ----------------------------------------------------------------------

  private async publish(project: string, kind: string, id: string, value: unknown): Promise<boolean> {
    if (!this.key) return false;
    const sealed = await encrypt(this.key, `${project}:${kind}`, scrubDeep(value));
    return this.send({ op: "pub", project, kind, id, ...sealed });
  }

  /** Ships whatever changed locally in shared projects since the last run. */
  async flush(): Promise<void> {
    if (this.flushing || !this.connected || !this.key || !this.indexKey) return;
    if (this.config?.user.role === "viewer") return;
    this.flushing = true;
    try {
      for (const project of this.sharedProjects()) {
        const identity = project.identity ?? `path:${project.path}`;
        const key = await projectKey(this.key, identity);
        this.keyToProject.set(key, project.id);

        if (!this.cursor("announce", project.id)) {
          await this.publish(this.indexKey, "project", `announce-${key.slice(0, 16)}-${Date.now()}`, {
            identity,
            name: project.name,
            key,
          });
          this.setCursor("announce", project.id, Date.now());
          this.send({ op: "sub", projects: [key], since: { [key]: this.cursor("seq", key) } });
        }

        // Own sessions (teammates' rows have an author and are never re-sent).
        const sessionCursor = this.cursor("sessions", project.id);
        const sessions = this.db
          .query(
            `SELECT * FROM sessions WHERE project_id = ? AND author_id IS NULL AND private = 0
               AND MAX(COALESCE(updated_at, 0), COALESCE(summary_at, 0)) > ?
             ORDER BY updated_at LIMIT 50`,
          )
          .all(project.id, sessionCursor) as Record<string, unknown>[];
        let maxSession = sessionCursor;
        for (const s of sessions) {
          const payload = {
            id: s.id,
            tool: s.tool,
            gitBranch: s.git_branch,
            title: s.title,
            firstPrompt: project.share === "full" ? s.first_prompt : null,
            startedAt: s.started_at,
            updatedAt: s.updated_at,
            userMessages: s.user_messages,
            assistantMessages: s.assistant_messages,
            toolCalls: s.tool_calls,
            toolErrors: s.tool_errors,
            compactions: s.compactions,
            contextTokens: s.context_tokens,
            models: s.models,
            filesTouched: project.share === "full" ? s.files_touched : "[]",
            summary: s.summary,
            summaryAt: s.summary_at,
          };
          await this.publish(key, "session", `s-${s.id}-${s.updated_at}-${s.summary_at ?? 0}`, payload);
          maxSession = Math.max(maxSession, Number(s.updated_at ?? 0), Number(s.summary_at ?? 0));
        }
        if (maxSession > sessionCursor) this.setCursor("sessions", project.id, maxSession);

        // Full sharing: the conversation itself, in batches.
        if (project.share === "full") {
          const messageCursor = this.cursor("messages", project.id);
          const rows = this.db
            .query(
              `SELECT m.rowid AS rid, m.id, m.session_id, m.ts, m.role, m.kind, m.tool_name, m.text FROM messages m
               JOIN sessions s ON s.id = m.session_id
               WHERE s.project_id = ? AND s.author_id IS NULL AND s.private = 0 AND m.rowid > ? ORDER BY m.rowid LIMIT 300`,
            )
            .all(project.id, messageCursor) as {
            rid: number;
            id: string;
            session_id: string;
            ts: number;
            role: string;
            kind: string;
            tool_name: string | null;
            text: string;
          }[];
          if (rows.length) {
            const last = rows.at(-1)?.rid ?? messageCursor;
            const ok = await this.publish(key, "messages", `m-${project.id}-${last}`, {
              messages: rows.map(({ rid: _r, ...m }) => m),
            });
            if (ok) this.setCursor("messages", project.id, last);
          }
        }

        // Memory: any change made here (including edits to a teammate's item).
        const memory = this.db
          .query("SELECT * FROM memory_items WHERE project_id = ? AND dirty = 1 LIMIT 100")
          .all(project.id) as Record<string, unknown>[];
        for (const item of memory) {
          const ok = await this.publish(key, "memory", `mem-${item.id}-${item.updated_at ?? item.created_at}`, {
            id: item.id,
            section: item.section,
            text: item.text,
            sourceSession: item.source_session,
            createdAt: item.created_at,
            updatedAt: item.updated_at ?? item.created_at,
            status: item.status,
            conflictWith: item.conflict_with,
            conflictReason: item.conflict_reason,
          });
          if (ok) this.db.query("UPDATE memory_items SET dirty = 0 WHERE id = ?").run(String(item.id));
        }
      }
      this.lastSyncAt = Date.now();
    } finally {
      this.flushing = false;
    }
  }

  /** A session made private after it was shared: ask teammates to drop their copy. */
  async forgetSession(projectId: string, sessionId: string): Promise<void> {
    if (!this.connected || !this.key) return;
    const project = this.sharedProjects().find((p) => p.id === projectId);
    if (!project) return;
    const key = await projectKey(this.key, project.identity ?? `path:${project.path}`);
    await this.publish(key, "forget", `forget-${sessionId}-${Date.now()}`, { id: sessionId });
  }

  /** A setting was added/changed/removed: teammates see the name, who and when — never the value. */
  async envChanged(projectId: string, change: { file: string; key: string; action: string }): Promise<void> {
    if (!this.connected || !this.key || this.config?.user.role === "viewer") return;
    const project = this.sharedProjects().find((p) => p.id === projectId);
    if (!project) return;
    const key = await projectKey(this.key, project.identity ?? `path:${project.path}`);
    // A server file is shown by its path on the server, not by the server's address.
    const file = change.file.startsWith("ssh:") ? change.file.replace(/^ssh:[^:]+:/, "server:") : change.file;
    await this.publish(key, "env", `env-${projectId}-${Date.now()}`, {
      file,
      key: change.key,
      action: change.action,
      at: Date.now(),
    });
  }

  /** "Mohamed is working on …": active own sessions in shared projects. */
  private async sendPresence(): Promise<void> {
    if (!this.connected || !this.key || !this.config) return;
    for (const project of this.sharedProjects()) {
      const key = await projectKey(this.key, project.identity ?? `path:${project.path}`);
      const session = this.db
        .query(
          "SELECT title, tool, files_touched, updated_at FROM sessions WHERE project_id = ? AND author_id IS NULL AND private = 0 ORDER BY updated_at DESC LIMIT 1",
        )
        .get(project.id) as
        | { title: string | null; tool: string; files_touched: string; updated_at: number }
        | undefined;
      if (!session || Date.now() - session.updated_at > 15 * 60_000) continue;
      const files = (JSON.parse(session.files_touched) as string[]).slice(-8);
      const sealed = await encrypt(
        this.key,
        `${key}:presence`,
        scrubDeep({ title: session.title, tool: session.tool, files, at: session.updated_at }),
      );
      this.send({ op: "presence", project: key, ...sealed });
    }
  }

  // ---- incoming ----------------------------------------------------------------------

  private authorName(id: string): string {
    return this.members.get(id)?.displayName ?? "teammate";
  }

  private async receive(raw: string): Promise<void> {
    let msg: { op: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.op === "online") {
      this.online = new Set(msg.users as string[]);
      this.bus.publish({ type: "team-changed" });
    } else if (msg.op === "events") {
      await this.applyEvents(String(msg.project), msg.events as WireEvent[]);
    } else if (msg.op === "presence") {
      await this.applyPresence(
        msg as unknown as { project: string; author: string; nonce: string; data: string; at: number },
      );
    }
  }

  private async applyPresence(p: {
    project: string;
    author: string;
    nonce: string;
    data: string;
    at: number;
  }): Promise<void> {
    if (!this.key || p.author === this.config?.user.id) return;
    const projectId = this.keyToProject.get(p.project);
    if (!projectId) return;
    try {
      const value = await decrypt<{ title?: string; tool?: string; files?: string[]; at?: number }>(
        this.key,
        `${p.project}:presence`,
        p.nonce,
        p.data,
      );
      this.presence.set(`${p.author}:${projectId}`, {
        userId: p.author,
        name: this.authorName(p.author),
        projectId,
        title: value.title ?? undefined,
        tool: value.tool,
        files: value.files ?? [],
        at: value.at ?? p.at,
        expires: Date.now() + PRESENCE_TTL,
      });
      this.bus.publish({ type: "presence" });
    } catch {
      // Not decryptable with our key: ignore.
    }
  }

  async applyEvents(projectKeyHex: string, events: WireEvent[]): Promise<void> {
    if (!this.key || !this.config) return;
    const mine = deviceOf(this.config.token);
    const changed = new Set<string>();
    for (const event of events) {
      try {
        if (event.device === mine) continue; // our own, echoed back on reconnect
        if (projectKeyHex === this.indexKey) {
          if (event.kind === "project") {
            const value = await decrypt<{ identity: string; name: string; key: string }>(
              this.key,
              `${projectKeyHex}:project`,
              event.nonce,
              event.data,
            );
            await this.adoptProject(value.identity, value.name);
          }
          continue;
        }
        const projectId = this.keyToProject.get(projectKeyHex);
        if (!projectId) continue;
        const value = await decrypt<Record<string, unknown>>(
          this.key,
          `${projectKeyHex}:${event.kind}`,
          event.nonce,
          event.data,
        );
        const author = { id: event.author, name: this.authorName(event.author) };
        if (event.kind === "session") this.applySession(projectId, value, author);
        else if (event.kind === "messages") this.applyMessages(value);
        else if (event.kind === "memory") this.applyMemory(projectId, value, author);
        else if (event.kind === "forget")
          // Only the session's own author can take it back.
          this.db
            .query("DELETE FROM sessions WHERE id = ? AND author_id = ?")
            .run(String(value.id ?? ""), event.author);
        else if (event.kind === "env")
          this.db
            .query(
              "INSERT INTO env_changes (project_id, file, key, action, author_id, author_name, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              projectId,
              String(value.file ?? ""),
              String(value.key ?? ""),
              String(value.action ?? "changed"),
              author.id,
              author.name,
              Number(value.at ?? event.at),
            );
        changed.add(projectId);
      } catch {
        // A tampered or foreign event fails authentication and is skipped.
      } finally {
        this.setCursor("seq", projectKeyHex, Math.max(this.cursor("seq", projectKeyHex), event.seq));
      }
    }
    if (changed.size) this.bus.publish({ type: "sessions-changed", projectIds: [...changed], sessionIds: [] });
  }

  /** A teammate shared a project: link it to the local copy of the same repo, or add it as a team project. */
  private async adoptProject(identity: string, name: string): Promise<void> {
    if (!this.key) return;
    const local = this.db
      .query("SELECT id, share FROM projects WHERE identity = ? OR path = ?")
      .get(identity, identity.replace(/^path:/, "")) as { id: string; share: ShareLevel } | undefined;
    let id = local?.id;
    if (!id) {
      id = createHash("sha1").update(identity).digest("hex").slice(0, 12);
      this.db
        .query(
          `INSERT OR IGNORE INTO projects (id, name, path, identity, workspace, created_at, share) VALUES (?, ?, ?, ?, 'team', ?, 'full')`,
        )
        .run(id, name, `team:${identity}`, identity, Date.now());
    } else if (local?.share === "off") {
      // Same repo exists here but isn't shared yet: receive the team's work for it, send nothing until the user decides.
      this.db.query("UPDATE projects SET share = 'summary' WHERE id = ? AND share = 'off'").run(id);
    }
    const key = await projectKey(this.key, identity);
    if (!this.keyToProject.has(key)) {
      this.keyToProject.set(key, id);
      this.send({ op: "sub", projects: [key], since: { [key]: this.cursor("seq", key) } });
    }
    this.bus.publish({ type: "sessions-changed", projectIds: [id], sessionIds: [] });
  }

  private applySession(projectId: string, s: Record<string, unknown>, author: { id: string; name: string }): void {
    const own = this.db.query("SELECT author_id FROM sessions WHERE id = ?").get(String(s.id)) as
      | { author_id: string | null }
      | undefined;
    if (own && own.author_id === null) return; // never overwrite our own session
    this.db
      .query(
        `INSERT INTO sessions (id, project_id, tool, git_branch, title, first_prompt, started_at, updated_at, user_messages,
           assistant_messages, tool_calls, tool_errors, compactions, context_tokens, models, files_touched, summary, summary_at,
           author_id, author_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET git_branch = excluded.git_branch, title = excluded.title,
           first_prompt = excluded.first_prompt, updated_at = excluded.updated_at, user_messages = excluded.user_messages,
           assistant_messages = excluded.assistant_messages, tool_calls = excluded.tool_calls, tool_errors = excluded.tool_errors,
           compactions = excluded.compactions, context_tokens = excluded.context_tokens, models = excluded.models,
           files_touched = excluded.files_touched, summary = COALESCE(excluded.summary, sessions.summary),
           summary_at = COALESCE(excluded.summary_at, sessions.summary_at), author_name = excluded.author_name`,
      )
      .run(
        String(s.id),
        projectId,
        String(s.tool ?? "claude"),
        (s.gitBranch as string | null) ?? null,
        (s.title as string | null) ?? null,
        (s.firstPrompt as string | null) ?? null,
        Number(s.startedAt ?? 0),
        Number(s.updatedAt ?? 0),
        Number(s.userMessages ?? 0),
        Number(s.assistantMessages ?? 0),
        Number(s.toolCalls ?? 0),
        Number(s.toolErrors ?? 0),
        Number(s.compactions ?? 0),
        Number(s.contextTokens ?? 0),
        String(s.models ?? "{}"),
        String(s.filesTouched ?? "[]"),
        (s.summary as string | null) ?? null,
        (s.summaryAt as number | null) ?? null,
        author.id,
        author.name,
      );
    this.db
      .query("UPDATE projects SET last_activity = MAX(last_activity, ?) WHERE id = ?")
      .run(Number(s.updatedAt ?? 0), projectId);
  }

  private applyMessages(value: Record<string, unknown>): void {
    const insert = this.db.query(
      "INSERT OR IGNORE INTO messages (id, session_id, ts, role, kind, tool_name, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.transaction(() => {
      for (const m of (value.messages ?? []) as Record<string, unknown>[]) {
        // Only into sessions we know came from a teammate.
        const session = this.db.query("SELECT author_id FROM sessions WHERE id = ?").get(String(m.session_id)) as
          | { author_id: string | null }
          | undefined;
        if (!session?.author_id) continue;
        insert.run(
          String(m.id),
          String(m.session_id),
          Number(m.ts ?? 0),
          String(m.role),
          String(m.kind),
          (m.tool_name as string | null) ?? null,
          String(m.text ?? ""),
        );
      }
    })();
  }

  private applyMemory(projectId: string, item: Record<string, unknown>, author: { id: string; name: string }): void {
    const existing = this.db
      .query("SELECT updated_at, created_at, author_id FROM memory_items WHERE id = ?")
      .get(String(item.id)) as { updated_at: number | null; created_at: number; author_id: string | null } | undefined;
    const incoming = Number(item.updatedAt ?? item.createdAt ?? 0);
    if (existing && (existing.updated_at ?? existing.created_at) >= incoming) return; // last writer wins
    this.db
      .query(
        `INSERT INTO memory_items (id, project_id, section, text, source_session, created_at, updated_at, status, conflict_with,
           conflict_reason, author_id, author_name, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET section = excluded.section, text = excluded.text, updated_at = excluded.updated_at,
           status = excluded.status, conflict_with = excluded.conflict_with, conflict_reason = excluded.conflict_reason, dirty = 0`,
      )
      .run(
        String(item.id),
        projectId,
        String(item.section),
        String(item.text),
        (item.sourceSession as string | null) ?? null,
        Number(item.createdAt ?? incoming),
        incoming,
        String(item.status ?? "active"),
        (item.conflictWith as string | null) ?? null,
        (item.conflictReason as string | null) ?? null,
        existing ? existing.author_id : author.id,
        existing ? null : author.name,
      );
  }
}
