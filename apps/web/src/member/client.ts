import {
  aadFor,
  decrypt,
  encrypt,
  generateDeviceKey,
  importTeamKey,
  keyCheck,
  projectKey,
  type TeamKey,
  unwrapTeamKey,
} from "@igrek/core";

/**
 * The web member's sync client (plan.md 4.3): signs in to the hub, keeps a device key whose private
 * half cannot be copied out of the browser, receives the team key wrapped for that device once an
 * admin approves it, and decrypts the team's events in the page. The hub never sees a key or a
 * plain value, exactly as with Igrek on a computer. The team key itself is never stored: it is
 * unwrapped again from the hub's copy each time the page opens.
 */

/** Where the browser keeps its sign-in and its device key (IndexedDB in the page, memory in tests). */
export interface MemberStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface MemberUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "member" | "viewer";
  mustChange?: boolean;
}

interface MemberSession {
  id: string;
  tool: string;
  title?: string;
  firstPrompt?: string | null;
  updatedAt: number;
  startedAt?: number;
  userMessages?: number;
  summary?: { title?: string; summary?: string; done?: string[]; open?: string[] } | null;
  author: string;
}

interface MemberMessage {
  id: string;
  session_id: string;
  ts: number;
  role: string;
  kind: string;
  tool_name?: string | null;
  text: string;
}

interface MemberMemory {
  id: string;
  section: string;
  text: string;
  status?: string;
  updatedAt: number;
  author: string;
}

interface MemberComment {
  id: string;
  targetKind: string;
  targetId: string;
  text: string;
  at: number;
  author: string;
}

export interface MemberTask {
  id: string;
  title: string;
  description: string;
  status: "todo" | "doing" | "review" | "done";
  order: number;
  createdAt: number;
  updatedAt: number;
  assignee?: { kind: "person" | "persona"; id: string; name: string };
  claimedBy?: { id: string; name: string };
  deleted?: boolean;
  author: string;
}

export interface MemberProject {
  key: string;
  name: string;
  sessions: Map<string, MemberSession>;
  messages: Map<string, MemberMessage[]>;
  memory: Map<string, MemberMemory>;
  comments: Map<string, MemberComment>;
  tasks: Map<string, MemberTask>;
}

export type MemberState =
  | { phase: "signedOut"; error?: string; needs2fa?: boolean }
  | { phase: "changePassword"; user: MemberUser }
  | { phase: "waitingForKey"; user: MemberUser; fingerprint: string }
  | { phase: "ready"; user: MemberUser; connected: boolean };

interface WireEvent {
  seq: number;
  kind: string;
  author: string;
  device: string;
  at: number;
  nonce: string;
  data: string;
  epoch?: number;
  n?: number | null;
  prev?: string | null;
}

const TOKEN = "token";
const DEVICE = "device";
const MAX_MESSAGES = 2000;

type Fold = (p: MemberProject, v: Record<string, unknown>, e: { author: string; at: number }) => void;

/** How each kind of team event lands in a project, as Igrek on a computer reads them. */
const FOLDS: Record<string, Fold> = {
  session: (p, v, e) => {
    const id = String(v.id ?? "");
    if (!id) return;
    const summary = typeof v.summary === "string" ? (JSON.parse(v.summary) as MemberSession["summary"]) : null;
    p.sessions.set(id, {
      id,
      tool: String(v.tool ?? ""),
      title: (v.title as string) ?? undefined,
      firstPrompt: (v.firstPrompt as string | null) ?? null,
      updatedAt: Number(v.updatedAt ?? e.at),
      startedAt: Number(v.startedAt ?? 0) || undefined,
      userMessages: Number(v.userMessages ?? 0),
      summary,
      author: e.author,
    });
  },
  messages: (p, v) => {
    for (const m of (v.messages as MemberMessage[]) ?? []) {
      const list = p.messages.get(m.session_id) ?? [];
      if (!list.some((x) => x.id === m.id)) list.push(m);
      if (list.length > MAX_MESSAGES) list.shift();
      p.messages.set(m.session_id, list);
    }
  },
  memory: (p, v, e) => {
    const id = String(v.id ?? "");
    if (!id) return;
    p.memory.set(id, {
      id,
      section: String(v.section ?? ""),
      text: String(v.text ?? ""),
      status: v.status as string | undefined,
      updatedAt: Number(v.updatedAt ?? e.at),
      author: e.author,
    });
  },
  comment: (p, v, e) => {
    const id = String(v.id ?? "");
    if (!id) return;
    p.comments.set(id, {
      id,
      targetKind: String(v.targetKind ?? ""),
      targetId: String(v.targetId ?? ""),
      text: String(v.text ?? ""),
      at: Number(v.at ?? e.at),
      author: e.author,
    });
  },
  task: (p, v, e) => {
    const id = String(v.id ?? "");
    const known = p.tasks.get(id);
    if (!id || (known && known.updatedAt >= Number(v.updatedAt ?? 0))) return;
    p.tasks.set(id, { ...(v as unknown as MemberTask), author: known?.author ?? e.author });
  },
  forget: (p, v) => {
    p.sessions.delete(String(v.id ?? ""));
    p.messages.delete(String(v.id ?? ""));
  },
};

export class MemberClient {
  state: MemberState = { phase: "signedOut" };
  readonly projects = new Map<string, MemberProject>();
  readonly members = new Map<string, string>();
  online = new Set<string>();
  private keys = new Map<number, TeamKey>();
  private epoch = 0;
  private indexKey?: string;
  private ws?: WebSocket;
  private listeners = new Set<() => void>();

  constructor(
    private readonly store: MemberStore,
    /** The hub's address; "" in the page (same origin). */
    private readonly hub = "",
    private readonly openSocket: (url: string) => WebSocket = (url) => new WebSocket(url),
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  private setState(state: MemberState): void {
    this.state = state;
    this.changed();
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.store.get<string>(TOKEN);
    const res = await fetch(`${this.hub}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string; needs2fa?: boolean };
    if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status, body });
    return body;
  }

  /** On page load: carry on with a stored sign-in, or show the sign-in form. */
  async resume(): Promise<void> {
    if (!(await this.store.get<string>(TOKEN))) return this.setState({ phase: "signedOut" });
    try {
      const me = await this.request<{ user: MemberUser }>("/api/me");
      await this.afterSignIn(me.user);
    } catch {
      await this.store.delete(TOKEN);
      this.setState({ phase: "signedOut" });
    }
  }

  async signIn(username: string, password: string, code?: string): Promise<void> {
    try {
      const res = await this.request<{ token: string; user: MemberUser }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password, code, device: "browser" }),
      });
      await this.store.set(TOKEN, res.token);
      await this.afterSignIn(res.user);
    } catch (err) {
      const body = (err as { body?: { needs2fa?: boolean } }).body;
      this.setState({ phase: "signedOut", error: (err as Error).message, needs2fa: body?.needs2fa });
    }
  }

  async changePassword(password: string): Promise<void> {
    await this.request("/api/password", { method: "POST", body: JSON.stringify({ password }) });
    const me = await this.request<{ user: MemberUser }>("/api/me");
    await this.afterSignIn(me.user);
  }

  async signOut(): Promise<void> {
    await this.request("/api/logout", { method: "POST" }).catch(() => undefined);
    await this.store.delete(TOKEN);
    this.ws?.close();
    this.keys.clear();
    this.projects.clear();
    this.setState({ phase: "signedOut" });
  }

  private async afterSignIn(user: MemberUser): Promise<void> {
    if (user.mustChange) return this.setState({ phase: "changePassword", user });
    const device = await this.ensureDevice();
    await this.loadMembers();
    if (!(await this.refreshKeys())) {
      const fingerprint = device.publicKey.slice(0, 8);
      return this.setState({ phase: "waitingForKey", user, fingerprint });
    }
    this.setState({ phase: "ready", user, connected: false });
    this.connect();
  }

  /** This browser's key pair, made once; the private half can't be read back out of the browser. */
  private async ensureDevice(): Promise<{ publicKey: string; privateKey: CryptoKey }> {
    let device = await this.store.get<{ publicKey: string; privateKey: CryptoKey }>(DEVICE);
    if (!device) {
      const made = await generateDeviceKey(false);
      device = { publicKey: made.publicKey, privateKey: made.privateKey };
      await this.store.set(DEVICE, device);
    }
    await this.request("/api/device-key", { method: "POST", body: JSON.stringify({ publicKey: device.publicKey }) });
    return device;
  }

  /** Team keys an admin wrapped for this device; each is checked against the hub's check value. */
  async refreshKeys(): Promise<boolean> {
    const device = await this.store.get<{ publicKey: string; privateKey: CryptoKey }>(DEVICE);
    if (!device) return false;
    const { wraps } = await this.request<{
      wraps: { epoch: number; fromPublic: string; nonce: string; wrapped: string }[];
    }>("/api/key-wraps");
    const me = await this.request<{ keyCheck: string | null; currentKeyCheck: string | null; keyEpoch: number }>(
      "/api/me",
    );
    for (const w of wraps) {
      try {
        const raw = await unwrapTeamKey(device.privateKey, w.fromPublic, w.epoch, w.nonce, w.wrapped);
        const key = await importTeamKey(raw);
        const expected = w.epoch === 0 ? me.keyCheck : w.epoch === me.keyEpoch ? me.currentKeyCheck : undefined;
        if (expected && expected !== (await keyCheck(key))) continue;
        this.keys.set(w.epoch, key);
      } catch {
        // Wrapped for another key pair of this account.
      }
    }
    const first = this.keys.get(0);
    if (!first) return false;
    this.epoch = Math.max(...this.keys.keys());
    this.indexKey = await projectKey(first, "__team-index__");
    return true;
  }

  private async loadMembers(): Promise<void> {
    const list = await this.request<{ id: string; displayName: string }[]>("/api/members").catch(() => []);
    for (const m of list) this.members.set(m.id, m.displayName);
  }

  nameOf(userId: string): string {
    return this.members.get(userId) ?? userId.slice(0, 6);
  }

  // ---- live events -------------------------------------------------------------------

  private connect(): void {
    void this.store.get<string>(TOKEN).then((token) => {
      if (!token || !this.indexKey) return;
      const base = this.hub || location.origin;
      const ws = this.openSocket(`${base.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`);
      this.ws = ws;
      ws.onopen = () => {
        if (this.state.phase === "ready") this.setState({ ...this.state, connected: true });
        this.send({ op: "sub", projects: [this.indexKey, ...this.projects.keys()] });
      };
      ws.onmessage = (m) => void this.onMessage(String(m.data));
      ws.onclose = () => {
        if (this.state.phase !== "ready") return;
        this.setState({ ...this.state, connected: false });
        setTimeout(() => this.state.phase === "ready" && this.connect(), 3000);
      };
    });
  }

  private send(message: unknown): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }

  private async onMessage(raw: string): Promise<void> {
    const msg = JSON.parse(raw) as { op: string; project?: string; events?: WireEvent[]; users?: string[] };
    if (msg.op === "online" && msg.users) {
      this.online = new Set(msg.users);
      this.changed();
    } else if (msg.op === "events" && msg.project && msg.events) {
      await this.apply(msg.project, msg.events);
    } else if (msg.op === "key-wraps") {
      await this.refreshKeys();
    }
  }

  /** Decrypts a batch and folds it into the projects; events made with a key this device lacks are skipped. */
  async apply(project: string, events: WireEvent[]): Promise<void> {
    for (const event of events) {
      const key = this.keys.get(event.epoch ?? 0);
      if (!key) continue;
      try {
        const value = await decrypt<Record<string, unknown>>(
          key,
          aadFor(project, event.kind, event.n, event.prev),
          event.nonce,
          event.data,
        );
        if (project === this.indexKey) this.addProject(value);
        else this.fold(project, event, value);
      } catch {
        // Tampered with, or not meant for this team key.
      }
    }
    this.changed();
  }

  private addProject(value: Record<string, unknown>): void {
    const key = String(value.key ?? "");
    if (!/^[0-9a-f]{64}$/.test(key) || this.projects.has(key)) return;
    this.projects.set(key, {
      key,
      name: String(value.name ?? "project"),
      sessions: new Map(),
      messages: new Map(),
      memory: new Map(),
      comments: new Map(),
      tasks: new Map(),
    });
    this.send({ op: "sub", projects: [key] });
  }

  private fold(project: string, event: WireEvent, v: Record<string, unknown>): void {
    const p = this.projects.get(project);
    const apply = FOLDS[event.kind];
    if (p && apply) apply(p, v, { author: this.nameOf(event.author), at: event.at });
  }

  // ---- what a web member may send -----------------------------------------------------

  private async publish(project: string, kind: string, id: string, value: unknown): Promise<void> {
    const key = this.keys.get(this.epoch);
    if (!key) throw new Error("No team key yet");
    const sealed = await encrypt(key, aadFor(project, kind), value);
    this.send({ op: "pub", project, kind, id: id.slice(0, 40), epoch: this.epoch, ...sealed });
  }

  /** A comment on a session, a decision or a card; teammates see it like one written in Igrek. */
  async comment(project: string, targetKind: string, targetId: string, text: string): Promise<void> {
    const value = {
      id: crypto.randomUUID().slice(0, 12),
      targetKind,
      targetId,
      text: text.slice(0, 4000),
      mentions: [],
      at: Date.now(),
    };
    await this.publish(project, "comment", `c-${value.id}`, value);
    this.fold(project, { kind: "comment", author: this.myId(), at: value.at } as WireEvent, value);
    this.changed();
  }

  /** A new card on the project's board; Igrek shows it with this member as its author. */
  async addTask(project: string, title: string): Promise<void> {
    const now = Date.now();
    const task = {
      id: crypto.randomUUID().slice(0, 16),
      title: title.trim().slice(0, 200),
      description: "",
      status: "todo" as const,
      order: now,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    if (!task.title) return;
    await this.publish(project, "task", `task-${task.id}-${now}`, task);
    this.fold(project, { kind: "task", author: this.myId(), at: now } as WireEvent, task);
    this.changed();
  }

  /** "I'm taking this" on a board card (or let it go). */
  async claim(project: string, taskId: string, take: boolean): Promise<void> {
    const task = this.projects.get(project)?.tasks.get(taskId);
    if (!task || this.state.phase !== "ready") return;
    const me = this.state.user;
    if (take && task.claimedBy && task.claimedBy.id !== me.id)
      throw new Error(`${task.claimedBy.name} already took this card`);
    const { author: _a, ...rest } = task;
    const next = { ...rest, claimedBy: take ? { id: me.id, name: me.displayName } : undefined, updatedAt: Date.now() };
    await this.publish(project, "task", `task-${taskId}-${next.updatedAt}`, next);
    this.fold(project, { kind: "task", author: me.id, at: next.updatedAt } as WireEvent, next);
    this.changed();
  }

  private myId(): string {
    return this.state.phase === "ready" ? this.state.user.id : "";
  }
}

/**
 * The page's store: IndexedDB, which can hold a non-extractable CryptoKey as it is. It keeps
 * the name from before the rename to Igrek: the key in it cannot be copied out to a new one.
 */
export function indexedDbStore(name = "godeye-member"): MemberStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction("kv", mode).objectStore("kv"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  };
  return {
    get: (key) => run("readonly", (s) => s.get(key)),
    set: (key, value) => run("readwrite", (s) => s.put(value, key)),
    delete: (key) => run("readwrite", (s) => s.delete(key)),
  };
}
