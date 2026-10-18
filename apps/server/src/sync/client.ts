import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import type {
  HubAlertInfo,
  InboxNotice,
  KeyRequest,
  Presence,
  ShareLevel,
  SharePreview,
  TeamActivity,
  TeamMember,
  TeamStatus,
} from "@godeye/core";
import type { Bus } from "../bus";
import {
  type DeviceKey,
  decodeInvite,
  decrypt,
  encrypt,
  generateDeviceKey,
  generateTeamKey,
  importTeamKey,
  keyCheck,
  projectKey,
  type TeamKey,
  unwrapTeamKey,
  wrapTeamKey,
} from "./crypto";
import { scrubDeep } from "./scrub";

interface SyncConfig {
  hub: string;
  token: string;
  /** Older configs: the single (epoch 0) team key. */
  teamKey?: string;
  /** Team keys by epoch, base64url. */
  keys?: Record<string, string>;
  epoch?: number;
  /** This device's own key pair: the team key arrives wrapped for it. */
  device?: DeviceKey;
  user: { id: string; username: string; displayName: string; role: "admin" | "member" | "viewer" };
}

const RECOVERY_PREFIX = "godeye-recovery:";

/** Every team key in one string, so an admin can restore access (and history) on a new computer. */
function encodeRecovery(keys: Record<string, string>): string {
  return RECOVERY_PREFIX + Buffer.from(JSON.stringify(keys)).toString("base64url");
}

function decodeRecovery(text: string): Record<string, string> {
  const t = text.trim();
  // An older recovery key was just the epoch-0 key.
  if (!t.startsWith(RECOVERY_PREFIX)) return { "0": t };
  return JSON.parse(Buffer.from(t.slice(RECOVERY_PREFIX.length), "base64url").toString("utf8")) as Record<
    string,
    string
  >;
}

interface WireEvent {
  seq: number;
  epoch?: number;
  project: string;
  kind: string;
  author: string;
  device: string;
  id: string;
  at: number;
  nonce: string;
  data: string;
  n?: number | null;
  prev?: string | null;
}

const SHARE_LEVELS: ShareLevel[] = ["off", "summary", "full"];
const PRESENCE_TTL = 60_000;

/** Each device links its events per project: n counts up, prev is the hash of the one before (plan.md 4.1). */
function chainHash(prev: string, n: number, nonce: string, data: string): string {
  return createHash("sha256").update(`${prev}|${n}|${nonce}|${data}`).digest("hex").slice(0, 32);
}

/** The chain position is sealed into the encryption, so the hub can't renumber or relink events. */
function aadFor(project: string, kind: string, n?: number | null, prev?: string | null): string {
  return n ? `${project}:${kind}:${n}:${prev ?? ""}` : `${project}:${kind}`;
}

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
  /** Epoch-0 key: project ids are derived from it, so they never change when the key is replaced. */
  private idKey?: TeamKey;
  /** Every team key this device has (old ones read old history). */
  private keys = new Map<number, TeamKey>();
  private epoch = 0;
  private waitingForKey = false;
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
      if (this.config.teamKey && !this.config.keys) this.config.keys = { "0": this.config.teamKey };
      await this.loadKeys();
      this.open();
    } catch {
      this.config = undefined;
    }
  }

  // ---- keys ----------------------------------------------------------------------------

  private needsKeys = false;
  /** Security alerts the hub pushed to this admin (failed logins, new places). */
  alerts: HubAlertInfo[] = [];

  private async loadKeys(): Promise<void> {
    this.keys.clear();
    for (const [epoch, key] of Object.entries(this.config?.keys ?? {}))
      this.keys.set(Number(epoch), await importTeamKey(key));
    this.idKey = this.keys.get(0);
    this.epoch = Math.max(0, ...this.keys.keys());
    this.indexKey = this.idKey ? await projectKey(this.idKey, "__team-index__") : undefined;
    this.waitingForKey = !this.idKey;
  }

  private currentKey(): TeamKey {
    const key = this.keys.get(this.epoch);
    if (!key) throw new Error("No team key yet");
    return key;
  }

  /** Makes this device's key pair once and tells the hub its public half. */
  private async registerDevice(): Promise<void> {
    if (!this.config) return;
    if (!this.config.device) {
      this.config.device = await generateDeviceKey();
      this.save();
    }
    await this.hubRequest("/api/device-key", {
      method: "POST",
      body: JSON.stringify({ publicKey: this.config.device.publicKey }),
    });
  }

  /** Picks up team keys an admin wrapped for this device (after approving it, or after a key change). */
  async refreshKeys(): Promise<boolean> {
    if (!this.config?.device) return false;
    const { wraps } = await this.hubRequest<{
      keyEpoch: number;
      wraps: { epoch: number; fromPublic: string; nonce: string; wrapped: string }[];
    }>("/api/key-wraps");
    const me = await this.hubRequest<{ keyCheck: string | null; currentKeyCheck: string | null; keyEpoch: number }>(
      "/api/me",
    );
    let added = false;
    for (const w of wraps) {
      if (this.config.keys?.[String(w.epoch)]) continue;
      try {
        const raw = await unwrapTeamKey(this.config.device.privateJwk, w.fromPublic, w.epoch, w.nonce, w.wrapped);
        // Only accept a key the hub's check value agrees with (a wrong or forged wrap is dropped).
        const expected = w.epoch === 0 ? me.keyCheck : w.epoch === me.keyEpoch ? me.currentKeyCheck : undefined;
        if (expected && expected !== (await keyCheck(await importTeamKey(raw)))) continue;
        this.config.keys = { ...(this.config.keys ?? {}), [String(w.epoch)]: raw };
        added = true;
      } catch {
        // not for this device's key pair
      }
    }
    if (added) {
      this.save();
      const hadKey = !!this.idKey;
      await this.loadKeys();
      if (!hadKey || this.needsKeys) {
        this.needsKeys = false;
        await this.subscribeAll();
      }
      this.bus.publish({ type: "team-changed" });
    }
    return added;
  }

  /** Admin: devices waiting for the team key. */
  keyRequests(): Promise<{ keyEpoch: number; requests: KeyRequest[] }> {
    return this.admin("/key-requests");
  }

  /** Admin: give a device every key this computer has (so it can read the whole history). */
  async approveDevice(deviceId: string): Promise<number> {
    if (!this.config?.device) throw new Error("This computer has no device key yet");
    const { requests } = await this.keyRequests();
    const request = requests.find((r) => r.deviceId === deviceId);
    if (!request) throw new Error("That device isn't waiting any more");
    const wraps = [];
    for (const epoch of request.missing) {
      const key = this.config.keys?.[String(epoch)];
      if (!key) continue;
      wraps.push({
        deviceId,
        epoch,
        fromPublic: this.config.device.publicKey,
        ...(await wrapTeamKey(this.config.device.privateJwk, request.publicKey, epoch, key)),
      });
    }
    if (!wraps.length) throw new Error("This computer doesn't have the keys that device needs");
    await this.admin("/key-wraps", { method: "POST", body: JSON.stringify({ wraps }) });
    return wraps.length;
  }

  /**
   * Admin: replace the team key (after someone leaves). New updates use the new
   * key, which only the remaining devices receive. Returns the new recovery key.
   */
  async rotateKey(): Promise<string> {
    if (!this.config?.device || !this.idKey) throw new Error("Connect first");
    const epoch = (await this.hubRequest<{ keyEpoch: number }>("/api/me")).keyEpoch + 1;
    const raw = generateTeamKey();
    await this.admin("/key-rotate", {
      method: "POST",
      body: JSON.stringify({ epoch, keyCheck: await keyCheck(await importTeamKey(raw)) }),
    });
    const devices = await this.admin<{ deviceId: string; publicKey: string }[]>("/device-keys");
    const wraps = [];
    for (const d of devices)
      wraps.push({
        deviceId: d.deviceId,
        epoch,
        fromPublic: this.config.device.publicKey,
        ...(await wrapTeamKey(this.config.device.privateJwk, d.publicKey, epoch, raw)),
      });
    await this.admin("/key-wraps", { method: "POST", body: JSON.stringify({ wraps }) });
    this.config.keys = { ...(this.config.keys ?? {}), [String(epoch)]: raw };
    this.save();
    await this.loadKeys();
    this.bus.publish({ type: "team-changed" });
    return encodeRecovery(this.config.keys);
  }

  /**
   * "Kerim changed auth.ts, which you're working on" (plan.md 4.4, 4.6): a
   * teammate's live or recent (2 h) work touching files you touched lately.
   */
  overlapNotices(now = Date.now()): InboxNotice[] {
    const since = now - 2 * 3600_000;
    const out: InboxNotice[] = [];
    const mine = new Map<string, Set<string>>();
    for (const r of this.db
      .query(
        "SELECT project_id, files_touched FROM sessions WHERE author_id IS NULL AND updated_at > ? AND project_id IS NOT NULL",
      )
      .all(since) as {
      project_id: string;
      files_touched: string;
    }[]) {
      const set = mine.get(r.project_id) ?? new Set<string>();
      for (const f of JSON.parse(r.files_touched) as string[]) set.add(f.split("/").slice(-3).join("/"));
      mine.set(r.project_id, set);
    }
    const name = (id: string) =>
      (this.db.query("SELECT name FROM projects WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? id;
    const tail = (f: string) => f.split("/").slice(-3).join("/");
    for (const p of this.presenceList())
      if (p.overlap?.length)
        out.push({
          id: `overlap-live-${p.userId}-${p.projectId}-${p.overlap.join()}`,
          kind: "overlap",
          projectId: p.projectId,
          projectName: name(p.projectId),
          detail: `${p.name} · ${p.overlap.slice(0, 3).map(tail).join(", ")}`,
          at: p.at,
          link: `/p/${p.projectId}`,
        });
    for (const r of this.db
      .query(
        "SELECT id, project_id, author_name, files_touched, updated_at FROM sessions WHERE author_id IS NOT NULL AND updated_at > ? ORDER BY updated_at DESC LIMIT 50",
      )
      .all(since) as {
      id: string;
      project_id: string;
      author_name: string | null;
      files_touched: string;
      updated_at: number;
    }[]) {
      const own = mine.get(r.project_id);
      if (!own) continue;
      const shared = (JSON.parse(r.files_touched) as string[]).map(tail).filter((f) => own.has(f));
      if (shared.length)
        out.push({
          id: `overlap-${r.id}-${shared.join()}`,
          kind: "overlap",
          projectId: r.project_id,
          projectName: name(r.project_id),
          detail: `${r.author_name ?? "?"} · ${shared.slice(0, 3).join(", ")}`,
          at: r.updated_at,
          link: `/p/${r.project_id}/s/${r.id}`,
        });
    }
    return out;
  }

  /** @mentions of me, and new comments on my sessions, that I haven't opened yet. */
  mentionNotices(): InboxNotice[] {
    const me = this.config?.user.id;
    if (!me) return [];
    const rows = this.db
      .query(
        `SELECT c.id, c.project_id, p.name AS project, c.target_kind, c.target_id, c.author_name, c.text, c.mentions, c.at,
                (SELECT 1 FROM sessions s WHERE s.id = c.target_id AND s.author_id IS NULL) AS on_mine
         FROM comments c LEFT JOIN projects p ON p.id = c.project_id
         WHERE c.author_id IS NOT NULL AND c.read = 0 ORDER BY c.at DESC LIMIT 30`,
      )
      .all() as {
      id: string;
      project_id: string;
      project: string | null;
      target_kind: string;
      target_id: string;
      author_name: string | null;
      text: string;
      mentions: string;
      at: number;
      on_mine: number | null;
    }[];
    return rows
      .filter((r) => (JSON.parse(r.mentions) as string[]).includes(me) || (r.target_kind === "session" && r.on_mine))
      .map((r) => ({
        id: `comment-${r.id}`,
        kind: "mention" as const,
        projectId: r.project_id,
        projectName: r.project ?? "",
        detail: `${r.author_name ?? "?"}: ${r.text.slice(0, 80)}`,
        at: r.at,
        link:
          r.target_kind === "session"
            ? `/p/${r.project_id}/s/${r.target_id}`
            : r.target_kind === "section"
              ? `/p/${r.project_id}?tab=sections&cat=${r.target_id}`
              : r.target_kind === "channel"
                ? `/team?channel=${encodeURIComponent(r.target_id)}`
                : `/p/${r.project_id}?tab=memory`,
      }));
  }

  /** Teammates' work since a time, per person (plan.md 4.4 "today in the team", 4.6 person page). */
  activity(since: number, language: string, userId?: string): TeamActivity[] {
    const rows = this.db
      .query(
        `SELECT s.id, s.project_id, p.name AS project, s.title, s.summary, s.updated_at, s.author_id, s.author_name, s.files_touched
         FROM sessions s LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.author_id IS NOT NULL AND s.updated_at > ? ${userId ? "AND s.author_id = ?" : ""}
         ORDER BY s.updated_at DESC LIMIT 300`,
      )
      .all(...(userId ? [since, userId] : [since])) as {
      id: string;
      project_id: string;
      project: string | null;
      title: string | null;
      summary: string | null;
      updated_at: number;
      author_id: string;
      author_name: string | null;
      files_touched: string;
    }[];
    const people = new Map<string, TeamActivity>();
    for (const r of rows) {
      let person = people.get(r.author_id);
      if (!person) {
        person = {
          userId: r.author_id,
          name: r.author_name ?? this.authorName(r.author_id),
          sessions: [],
          decisions: [],
        };
        people.set(r.author_id, person);
      }
      const summary = r.summary
        ? (JSON.parse(r.summary) as { title?: string; texts?: Record<string, { did?: string[] }> })
        : undefined;
      const text = summary?.texts?.[language] ?? summary?.texts?.en ?? Object.values(summary?.texts ?? {})[0];
      person.sessions.push({
        id: r.id,
        projectId: r.project_id,
        projectName: r.project ?? "",
        title: summary?.title || r.title || "",
        did: text?.did?.slice(0, 3) ?? [],
        files: (JSON.parse(r.files_touched) as string[]).slice(-5).map((f) => f.split("/").slice(-2).join("/")),
        updatedAt: r.updated_at,
      });
    }
    const memory = this.db
      .query(
        `SELECT author_id, section, text, created_at, project_id FROM memory_items WHERE author_id IS NOT NULL AND created_at > ? ${userId ? "AND author_id = ?" : ""} AND status = 'active' ORDER BY created_at DESC LIMIT 100`,
      )
      .all(...(userId ? [since, userId] : [since])) as {
      author_id: string;
      section: string;
      text: string;
      created_at: number;
      project_id: string;
    }[];
    for (const m of memory) {
      const person = people.get(m.author_id) ?? {
        userId: m.author_id,
        name: this.authorName(m.author_id),
        sessions: [],
        decisions: [],
      };
      person.decisions.push({ section: m.section, text: m.text, projectId: m.project_id, at: m.created_at });
      people.set(m.author_id, person);
    }
    return [...people.values()];
  }

  // ---- comments and messages (plan.md 4.4) ---------------------------------------------------

  /** "@kerim" in a comment becomes a mention of that member. */
  /** Teammate ids named with @username. Someone who joined a minute ago is found too: unknown names reload the list. */
  async mentionsIn(text: string): Promise<string[]> {
    const names = new Set([...text.matchAll(/@([\w.-]{2,32})/g)].map((m) => (m[1] ?? "").toLowerCase()));
    const known = () => [...this.members.values()].filter((m) => names.has(m.username.toLowerCase()));
    if (known().length < names.size) await this.loadMembers();
    return known().map((m) => m.id);
  }

  identity(): { id?: string; name?: string } {
    return { id: this.config?.user.id, name: this.config?.user.displayName };
  }

  /** Projects shared with the team, for messages that go to everyone (the end-of-day note). */
  sharedProjectIds(): string[] {
    return this.connected ? this.sharedProjects().map((p) => p.id) : [];
  }

  memberList(): TeamMember[] {
    return [...this.members.values()];
  }

  /** Shared projects with their opaque hub ids (only this computer can tell which is which). */
  async projectKeys(): Promise<{ projectId: string; name: string; key: string }[]> {
    if (!this.idKey) return [];
    const out = [];
    for (const p of this.linkedProjects())
      out.push({ projectId: p.id, name: p.name, key: await projectKey(this.idKey, p.identity ?? `path:${p.path}`) });
    return out;
  }

  recoveryKey(): string | undefined {
    return this.config?.keys ? encodeRecovery(this.config.keys) : undefined;
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
    code?: string;
    recovery?: string;
  }): Promise<{ status: TeamStatus; recoveryKey?: string; needs2fa?: boolean }> {
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
        code: input.code,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: SyncConfig["user"] & { mustChangePassword?: boolean };
      keyCheck?: string | null;
      needs2fa?: boolean;
      error?: string;
    };
    if (body.needs2fa) return { status: this.status(), needs2fa: true };
    if (!res.ok || !body.token || !body.user) throw new Error(body.error ?? "Could not sign in");

    // Keys: from a recovery key, an older invite, or (first admin) made right here.
    // Otherwise this device waits until an admin approves it.
    let keys: Record<string, string> | undefined = input.recovery
      ? decodeRecovery(input.recovery)
      : invite?.key
        ? { "0": invite.key }
        : undefined;
    let recoveryKey: string | undefined;
    if (!keys && !body.keyCheck && body.user.role === "admin") {
      keys = { "0": generateTeamKey() };
      recoveryKey = encodeRecovery(keys);
    }
    const config: SyncConfig = { hub, token: body.token, keys, user: body.user };
    if (keys?.["0"]) {
      const check = await keyCheck(await importTeamKey(keys["0"]));
      if (body.keyCheck && body.keyCheck !== check) throw new Error("This team key doesn't match the team on this hub");
      if (!body.keyCheck)
        await this.hubRequest("/api/key-check", { method: "POST", body: JSON.stringify({ value: check }) }, config);
    }
    if (body.user.mustChangePassword) {
      if (!input.newPassword) throw new Error("Choose a new password to finish joining");
      await this.hubRequest(
        "/api/password",
        { method: "POST", body: JSON.stringify({ password: input.newPassword }) },
        config,
      );
    }

    this.config = config;
    this.signedOut = false;
    this.save();
    await this.loadKeys();
    await this.registerDevice();
    await this.refreshKeys().catch(() => false);
    this.open();
    return { status: this.status(), recoveryKey };
  }

  disconnect(): void {
    this.close();
    this.config = undefined;
    this.keys.clear();
    this.idKey = undefined;
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
      waitingForKey: this.waitingForKey,
      keyEpoch: this.epoch,
      pending: this.pendingCount(),
      lastSyncAt: this.lastSyncAt,
      integrity: this.config ? this.integrity() : undefined,
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
    return this.config?.keys?.["0"];
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
      // A device still waiting for its key checks again on every reconnect.
      if (this.waitingForKey || this.needsKeys) void this.refreshKeys().catch(() => false);
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
    this.loops.push(setInterval(() => void this.repair(), 10 * 60_000));
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
    if (!this.idKey) return;
    try {
      const me = await this.hubRequest<{ keyCheck: string | null }>("/api/me");
      this.keyMismatch = !!me.keyCheck && me.keyCheck !== (await keyCheck(this.idKey));
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

  /** Shared projects, plus local ones a teammate shares that we only receive. */
  private linkedProjects(): { id: string; name: string; identity: string | null; path: string; share: ShareLevel }[] {
    return this.db
      .query("SELECT id, name, identity, path, share FROM projects WHERE share != 'off' OR team_linked = 1")
      .all() as { id: string; name: string; identity: string | null; path: string; share: ShareLevel }[];
  }

  private async subscribeAll(): Promise<void> {
    if (!this.idKey || !this.indexKey) return;
    const keys = [this.indexKey];
    for (const project of this.linkedProjects()) {
      const key = await projectKey(this.idKey as TeamKey, project.identity ?? `path:${project.path}`);
      this.keyToProject.set(key, project.id);
      keys.push(key);
    }
    const since = Object.fromEntries(keys.map((k) => [k, this.cursor("seq", k)]));
    this.send({ op: "sub", projects: keys, since });
  }

  // ---- outgoing ----------------------------------------------------------------------

  private publishing: Promise<unknown> = Promise.resolve();

  /** One at a time, so every event gets the next number in this device's chain. */
  private publish(project: string, kind: string, id: string, value: unknown): Promise<boolean> {
    const run = this.publishing.then(() => this.publishNow(project, kind, id, value));
    this.publishing = run.catch(() => false);
    return run;
  }

  private async publishNow(project: string, kind: string, id: string, value: unknown): Promise<boolean> {
    if (!this.idKey || !this.config) return false;
    const mine = deviceOf(this.config.token);
    const head = this.chainHead(project, mine);
    const n = (head?.n ?? 0) + 1;
    const prev = head?.hash ?? "";
    const sealed = await encrypt(this.currentKey(), aadFor(project, kind, n, prev), scrubDeep(value));
    const hash = chainHash(prev, n, sealed.nonce, sealed.data);
    // The hash makes the id unique, so a resend is never mistaken for an old copy.
    const ok = this.send({
      op: "pub",
      project,
      kind,
      id: `${id.slice(0, 40)}.${hash.slice(0, 16)}`,
      epoch: this.epoch,
      n,
      prev,
      ...sealed,
    });
    if (ok) this.setChainHead(project, mine, n, hash);
    return ok;
  }

  // ---- integrity: spot missing or broken events and repair them (plan.md 4.1) ----------------

  private chainHead(project: string, device: string): { n: number; hash: string } | undefined {
    return (
      (this.db.query("SELECT n, hash FROM sync_chain WHERE project = ? AND device = ?").get(project, device) as {
        n: number;
        hash: string;
      } | null) ?? undefined
    );
  }

  private setChainHead(project: string, device: string, n: number, hash: string): void {
    this.db
      .query(
        "INSERT INTO sync_chain (project, device, n, hash) VALUES (?, ?, ?, ?) ON CONFLICT(project, device) DO UPDATE SET n = excluded.n, hash = excluded.hash",
      )
      .run(project, device, n, hash);
  }

  /**
   * Where an incoming event sits in its device's chain: "next" (in order), "fill" (closes a hole),
   * or "seen" (a copy we already have). A jump forward records the hole for repair; a wrong link is counted as broken.
   */
  private track(project: string, event: WireEvent): "next" | "fill" | "seen" {
    if (!event.n) return "next"; // from a version without chains
    const hash = chainHash(event.prev ?? "", event.n, event.nonce, event.data);
    const head = this.chainHead(project, event.device);
    if (!head) {
      // First event seen from this device (older ones may have been pruned by the hub's retention).
      this.setChainHead(project, event.device, event.n, hash);
      return "next";
    }
    if (event.n > head.n) {
      if (event.n === head.n + 1 && (event.prev ?? "") !== head.hash) this.countBroken();
      if (event.n > head.n + 1)
        this.db
          .query("INSERT OR IGNORE INTO sync_gaps (project, device, from_n, to_n, found_at) VALUES (?, ?, ?, ?, ?)")
          .run(project, event.device, head.n + 1, event.n - 1, Date.now());
      this.setChainHead(project, event.device, event.n, hash);
      return "next";
    }
    const gap = this.db
      .query("SELECT from_n, to_n FROM sync_gaps WHERE project = ? AND device = ? AND ? BETWEEN from_n AND to_n")
      .get(project, event.device, event.n) as { from_n: number; to_n: number } | null;
    if (!gap) return "seen";
    // Split the hole around the event that just arrived.
    this.db
      .query("DELETE FROM sync_gaps WHERE project = ? AND device = ? AND from_n = ?")
      .run(project, event.device, gap.from_n);
    const add = this.db.query(
      "INSERT OR IGNORE INTO sync_gaps (project, device, from_n, to_n, found_at) VALUES (?, ?, ?, ?, ?)",
    );
    if (gap.from_n < event.n) add.run(project, event.device, gap.from_n, event.n - 1, Date.now());
    if (event.n < gap.to_n) add.run(project, event.device, event.n + 1, gap.to_n, Date.now());
    return "fill";
  }

  private countBroken(): void {
    this.setCursor("integrity", "broken", this.cursor("integrity", "broken") + 1);
  }

  private repairing = false;

  /**
   * Fills holes from the hub; what the hub doesn't have (lost, or pruned) is asked from the device that sent it,
   * which sends its current state again. Asks at most once an hour per hole.
   */
  async repair(): Promise<{ filled: number; asked: number }> {
    if (this.repairing || !this.config) return { filled: 0, asked: 0 };
    this.repairing = true;
    let filled = 0;
    let asked = 0;
    try {
      const gaps = this.db.query("SELECT * FROM sync_gaps ORDER BY found_at LIMIT 50").all() as {
        project: string;
        device: string;
        from_n: number;
        to_n: number;
        asked_at: number | null;
      }[];
      for (const gap of gaps) {
        const events = await this.hubRequest<WireEvent[]>(
          `/api/chain/${gap.project}?device=${gap.device}&from=${gap.from_n}&to=${gap.to_n}`,
        ).catch(() => [] as WireEvent[]);
        if (events.length) {
          const before = this.openGaps();
          await this.applyEvents(gap.project, events, { repair: true });
          filled += Math.max(0, before - this.openGaps());
        }
        const left = this.db
          .query(
            "SELECT from_n, to_n, asked_at FROM sync_gaps WHERE project = ? AND device = ? AND from_n >= ? AND to_n <= ?",
          )
          .all(gap.project, gap.device, gap.from_n, gap.to_n) as {
          from_n: number;
          to_n: number;
          asked_at: number | null;
        }[];
        for (const hole of left) {
          if (hole.asked_at && Date.now() - hole.asked_at < 3_600_000) continue;
          await this.publish(gap.project, "resend", `resend-${gap.device}-${hole.from_n}`, {
            device: gap.device,
            from: hole.from_n,
            to: hole.to_n,
          });
          this.db
            .query("UPDATE sync_gaps SET asked_at = ? WHERE project = ? AND device = ? AND from_n = ?")
            .run(Date.now(), gap.project, gap.device, hole.from_n);
          asked++;
        }
      }
    } finally {
      this.repairing = false;
    }
    if (filled || asked) this.bus.publish({ type: "team-changed" });
    return { filled, asked };
  }

  private openGaps(): number {
    return (this.db.query("SELECT COALESCE(SUM(to_n - from_n + 1), 0) AS n FROM sync_gaps").get() as { n: number }).n;
  }

  /** A teammate is missing some of our events: send this project's current state again, then say so. */
  private async resendProject(projectKeyHex: string): Promise<void> {
    const projectId = this.keyToProject.get(projectKeyHex);
    if (!projectId) return;
    this.setCursor("sessions", projectId, 0);
    this.setCursor("messages", projectId, 0);
    this.db.query("UPDATE comments SET sent = 0 WHERE project_id = ? AND author_id IS NULL").run(projectId);
    this.db.query("UPDATE memory_items SET dirty = 1 WHERE project_id = ? AND author_id IS NULL").run(projectId);
    // Drain everything (flush sends in batches), then mark the old holes as replaced.
    for (let i = 0; i < 20; i++) {
      while (this.flushing) await Bun.sleep(50);
      const before = this.chainHead(projectKeyHex, deviceOf(this.config?.token ?? ""))?.n ?? 0;
      await this.flush();
      if ((this.chainHead(projectKeyHex, deviceOf(this.config?.token ?? ""))?.n ?? 0) === before) break;
    }
    const upTo = this.chainHead(projectKeyHex, deviceOf(this.config?.token ?? ""))?.n ?? 0;
    await this.publish(projectKeyHex, "resent", `resent-${upTo}`, { upTo: upTo + 1 });
  }

  /** What the integrity check found, for the status line. */
  integrity(): { missing: number; broken: number } {
    return { missing: this.openGaps(), broken: this.cursor("integrity", "broken") };
  }

  /** Ships whatever changed locally in shared projects since the last run. */
  async flush(): Promise<void> {
    if (this.flushing || !this.connected || !this.idKey || !this.indexKey) return;
    if (this.config?.user.role === "viewer") return;
    this.flushing = true;
    try {
      for (const project of this.linkedProjects()) {
        const identity = project.identity ?? `path:${project.path}`;
        const key = await projectKey(this.idKey as TeamKey, identity);
        this.keyToProject.set(key, project.id);
        // Receive-only: just what you send on purpose (comments, suggestions) and edits to teammates' items.
        const sharing = project.share !== "off";

        if (sharing && !this.cursor("announce", project.id)) {
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
        const sessions = sharing
          ? (this.db
              .query(
                `SELECT * FROM sessions WHERE project_id = ? AND author_id IS NULL AND private = 0
                   AND MAX(COALESCE(updated_at, 0), COALESCE(summary_at, 0)) > ?
                 ORDER BY updated_at LIMIT 50`,
              )
              .all(project.id, sessionCursor) as Record<string, unknown>[])
          : [];
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
        if (sharing && project.share === "full") {
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

        // Comments written here, and messages to one teammate.
        for (const cm of this.db
          .query("SELECT * FROM comments WHERE project_id = ? AND author_id IS NULL AND sent = 0 LIMIT 50")
          .all(project.id) as Record<string, unknown>[]) {
          const ok = await this.publish(key, "comment", `c-${cm.id}`, {
            id: cm.id,
            targetKind: cm.target_kind,
            targetId: cm.target_id,
            text: cm.text,
            mentions: JSON.parse(String(cm.mentions)),
            at: cm.at,
          });
          if (ok) this.db.query("UPDATE comments SET sent = 1 WHERE id = ?").run(String(cm.id));
        }
        for (const msg of this.db
          .query("SELECT * FROM team_messages WHERE project_id = ? AND outgoing = 1 AND sent = 0 LIMIT 20")
          .all(project.id) as Record<string, unknown>[]) {
          const ok = await this.publish(key, "message", `msg-${msg.id}`, {
            id: msg.id,
            kind: msg.kind,
            to: msg.to_id,
            sessionId: msg.session_id,
            title: msg.title,
            text: msg.text,
            at: msg.at,
          });
          if (ok) this.db.query("UPDATE team_messages SET sent = 1 WHERE id = ?").run(String(msg.id));
        }

        // Memory: any change made here (including edits to a teammate's item).
        const memory = this.db
          .query(
            `SELECT * FROM memory_items WHERE project_id = ? AND dirty = 1 ${sharing ? "" : "AND author_id IS NOT NULL"} LIMIT 100`,
          )
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

        // Wiki pages and whiteboards: shared like memory, only for shared projects.
        if (sharing && this.docs) {
          for (const page of this.docs.dirtyPages(project.id)) {
            const ok = await this.publish(key, "wiki", `wiki-${page.id}-${page.updated_at}`, {
              id: page.id,
              title: page.title,
              body: page.body,
              updatedAt: page.updated_at,
              deleted: !!page.deleted,
            });
            if (ok) this.docs.markSent("wiki_pages", page.id, page.updated_at);
          }
          for (const board of this.docs.dirtyBoards(project.id)) {
            const ok = await this.publish(key, "board", `board-${board.id}-${board.updated_at}`, {
              id: board.id,
              title: board.title,
              category: board.category,
              scene: board.scene,
              updatedAt: board.updated_at,
              deleted: !!board.deleted,
            });
            if (ok) this.docs.markSent("boards", board.id, board.updated_at);
          }
        }
        // The shared task board (plan.md 4.4): cards, who they are for and who took them.
        if (this.board) {
          for (const task of this.board.unsent(project.id, !sharing)) {
            const ok = await this.publish(key, "task", `task-${task.id}-${task.updatedAt}`, { ...task });
            if (ok) this.board.markSent(task.id, task.updatedAt);
          }
        }
      }
      this.lastSyncAt = Date.now();
    } finally {
      this.flushing = false;
    }
  }

  /** A session made private after it was shared: ask teammates to drop their copy. */
  async forgetSession(projectId: string, sessionId: string): Promise<void> {
    if (!this.connected || !this.idKey) return;
    const project = this.sharedProjects().find((p) => p.id === projectId);
    if (!project) return;
    const key = await projectKey(this.idKey as TeamKey, project.identity ?? `path:${project.path}`);
    await this.publish(key, "forget", `forget-${sessionId}-${Date.now()}`, { id: sessionId });
  }

  /** A setting was added/changed/removed: teammates see the name, who and when — never the value. */
  async envChanged(projectId: string, change: { file: string; key: string; action: string }): Promise<void> {
    if (!this.connected || !this.idKey || this.config?.user.role === "viewer") return;
    const project = this.sharedProjects().find((p) => p.id === projectId);
    if (!project) return;
    const key = await projectKey(this.idKey as TeamKey, project.identity ?? `path:${project.path}`);
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
    if (!this.connected || !this.idKey || !this.config) return;
    for (const project of this.sharedProjects()) {
      const key = await projectKey(this.idKey as TeamKey, project.identity ?? `path:${project.path}`);
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
        this.currentKey(),
        `${key}:presence`,
        scrubDeep({ title: session.title, tool: session.tool, files, at: session.updated_at }),
      );
      this.send({ op: "presence", project: key, epoch: this.epoch, ...sealed });
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
    } else if (msg.op === "key-wraps") {
      await this.refreshKeys().catch(() => false);
    } else if (msg.op === "key-request" || msg.op === "alert") {
      if (msg.op === "alert") this.alerts = [msg.alert as HubAlertInfo, ...this.alerts].slice(0, 20);
      this.bus.publish({ type: "team-changed" });
    } else if (msg.op === "events") {
      await this.applyEvents(String(msg.project), msg.events as WireEvent[]);
    } else if (msg.op === "presence") {
      await this.applyPresence(
        msg as unknown as { project: string; author: string; nonce: string; data: string; at: number; epoch?: number },
      );
    }
  }

  private async applyPresence(p: {
    project: string;
    author: string;
    nonce: string;
    data: string;
    at: number;
    epoch?: number;
  }): Promise<void> {
    const key = this.keys.get(p.epoch ?? 0);
    if (!this.idKey || !key || p.author === this.config?.user.id) return;
    const projectId = this.keyToProject.get(p.project);
    if (!projectId) return;
    try {
      const value = await decrypt<{ title?: string; tool?: string; files?: string[]; at?: number }>(
        key,
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

  async applyEvents(projectKeyHex: string, events: WireEvent[], options: { repair?: boolean } = {}): Promise<void> {
    if (!this.idKey || !this.config) return;
    const mine = deviceOf(this.config.token);
    const changed = new Set<string>();
    for (const event of events) {
      // Without the key it was made with, keep it for later (don't move the cursor past it).
      const key = this.keys.get(event.epoch ?? 0);
      if (!key) {
        this.needsKeys = true;
        break;
      }
      try {
        if (event.device === mine) continue; // our own, echoed back on reconnect
        if (projectKeyHex === this.indexKey) {
          if (event.kind === "project") {
            const value = await decrypt<{ identity: string; name: string; key: string }>(
              key,
              aadFor(projectKeyHex, "project", event.n, event.prev),
              event.nonce,
              event.data,
            );
            if (this.track(projectKeyHex, event) !== "seen") await this.adoptProject(value.identity, value.name);
          }
          continue;
        }
        const projectId = this.keyToProject.get(projectKeyHex);
        if (!projectId) continue;
        const value = await decrypt<Record<string, unknown>>(
          key,
          aadFor(projectKeyHex, event.kind, event.n, event.prev),
          event.nonce,
          event.data,
        );
        if (this.track(projectKeyHex, event) === "seen") continue;
        const author = { id: event.author, name: this.authorName(event.author) };
        if (event.kind === "resend") {
          if (value.device === mine) await this.resendProject(projectKeyHex);
          continue;
        }
        if (event.kind === "resent") {
          // The sender sent its current state again: the holes before this point are covered.
          this.db
            .query("DELETE FROM sync_gaps WHERE project = ? AND device = ? AND to_n < ?")
            .run(projectKeyHex, event.device, Number(value.upTo ?? 0));
          continue;
        }
        if (event.kind === "session") this.applySession(projectId, value, author);
        else if (event.kind === "messages") this.applyMessages(value);
        else if (event.kind === "memory") this.applyMemory(projectId, value, author);
        else if (event.kind === "wiki" || event.kind === "board")
          this.docs?.apply(event.kind, projectId, value, author.name);
        else if (event.kind === "task") this.board?.applyRemote(projectId, value, author.name);
        else if (event.kind === "forget")
          // Only the session's own author can take it back.
          this.db
            .query("DELETE FROM sessions WHERE id = ? AND author_id = ?")
            .run(String(value.id ?? ""), event.author);
        else if (event.kind === "comment")
          this.db
            .query(
              "INSERT OR IGNORE INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            )
            .run(
              String(value.id),
              projectId,
              String(value.targetKind),
              String(value.targetId),
              author.id,
              author.name,
              String(value.text ?? "").slice(0, 4000),
              JSON.stringify(value.mentions ?? []),
              Number(value.at ?? event.at),
            );
        else if (event.kind === "message") {
          // Only the person it's addressed to keeps it.
          if (value.to === this.config?.user.id)
            this.db
              .query(
                "INSERT OR IGNORE INTO team_messages (id, kind, project_id, from_id, from_name, to_id, session_id, title, text, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .run(
                String(value.id),
                String(value.kind),
                projectId,
                author.id,
                author.name,
                String(value.to),
                (value.sessionId as string | null) ?? null,
                (value.title as string | null) ?? null,
                String(value.text ?? "").slice(0, 20_000),
                Number(value.at ?? event.at),
              );
        } else if (event.kind === "env")
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
        if (!options.repair)
          this.setCursor("seq", projectKeyHex, Math.max(this.cursor("seq", projectKeyHex), event.seq));
      }
    }
    if (changed.size) this.bus.publish({ type: "sessions-changed", projectIds: [...changed], sessionIds: [] });
    if (!options.repair && this.openGaps() > 0) void this.repair();
  }

  /** A teammate shared a project: link it to the local copy of the same repo, or add it as a team project. */
  private async adoptProject(identity: string, name: string): Promise<void> {
    if (!this.idKey) return;
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
      this.db.query("UPDATE projects SET team_linked = 1 WHERE id = ?").run(id);
    }
    const key = await projectKey(this.idKey as TeamKey, identity);
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
           summary_at = COALESCE(excluded.summary_at, sessions.summary_at), author_name = excluded.author_name
         WHERE COALESCE(excluded.updated_at, 0) >= COALESCE(sessions.updated_at, 0)`,
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

  /** A teammate's new decision or convention arrived (checked against ours for contradictions). */
  onTeammateDecision?: (projectId: string, itemId: string) => void;
  /** Wiki pages and boards (plan.md 12), set by the server at startup. */
  docs?: import("../docs").Docs;
  /** The task board (plan.md 4.4), set by the server at startup. */
  board?: import("../board").Board;

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
    if (
      !existing &&
      ["decision", "convention"].includes(String(item.section)) &&
      (item.status ?? "active") === "active"
    )
      this.onTeammateDecision?.(projectId, String(item.id));
  }
}
