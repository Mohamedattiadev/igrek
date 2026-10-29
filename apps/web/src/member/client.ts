import {
  aadFor,
  audienceOf,
  COMPANY_STREAM,
  cardPeople,
  decrypt,
  emptyOrg,
  encrypt,
  foldOrg,
  generateDeviceKey,
  importTeamKey,
  keyCheck,
  meetingNotices,
  namedIn,
  type OrgPost,
  type OrgState,
  type OrgStructure,
  projectKey,
  roomOfMeeting,
  type SeatBudget,
  type TeamKey,
  unwrapTeamKey,
} from "@igrek/core";
import type { CallEvent } from "../components/meet/call";
import { type DirectDevice, type DirectMessage, deviceIdOf, MemberDirect } from "./direct";
import { FileParts, prepareFile } from "./files";
import {
  channelName,
  emptyProject,
  FOLDS,
  type MemberComment,
  type MemberProject,
  type MemberSeat,
  messagesIn,
} from "./model";

/**
 * The web member's sync client (plan.md 4.3, 20.1): signs in to the hub, keeps a device key whose
 * private half cannot be copied out of the browser, receives the team key wrapped for that device
 * once an admin approves it, and decrypts the team's events in the page. The hub never sees a key
 * or a plain value, exactly as with Igrek on a computer. The team key itself is never stored: it
 * is unwrapped again from the hub's copy each time the page opens.
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
  avatar?: string;
  language?: string;
  mustChange?: boolean;
  generalManager?: boolean;
}

/** A teammate as the hub lists them. */
export interface MemberPerson {
  id: string;
  username: string;
  displayName: string;
  role: MemberUser["role"];
  generalManager?: boolean;
  avatar?: string;
  lastSeen?: number;
}

/** "Kerim is working on ..." from a teammate's Igrek, while it lasts. */
export interface MemberPresence {
  userId: string;
  project: string;
  title?: string;
  tool: string;
  files: string[];
  at: number;
  until: number;
}

/** Something that should reach the person even with the page in the background. */
export interface MemberNotice {
  title: string;
  body: string;
  /** Where it leads: a channel ("<project>|<channel id>") or a direct talk ("dm:<id>"). */
  open: string;
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
const READS = "reads";
const OUTBOX = "outbox";
const PRESENCE_TTL = 60_000;
const TYPING_TTL = 6_000;

/** The key a channel's or a direct talk's read mark is kept under. */
export const channelKey = (project: string, channelId: string) => `${project}|${channelId}`;
export const directKey = (peer: string) => `dm:${peer}`;

export class MemberClient {
  state: MemberState = { phase: "signedOut" };
  readonly projects = new Map<string, MemberProject>();
  readonly members = new Map<string, MemberPerson>();
  readonly direct = new MemberDirect();
  readonly files = new FileParts();
  /** Teammates' Igrek reports (accounts, limits, week) for the Company page. */
  readonly seats = new Map<string, MemberSeat>();
  /** The budgets the admin set in Igrek, shared with the team. */
  budgets: Record<string, SeatBudget> = {};
  readonly presence = new Map<string, MemberPresence>();
  online = new Set<string>();
  /** The company (plan.md 20): its teams from the hub, its cards and channels from the company stream. */
  org: OrgState = emptyOrg();
  structure: OrgStructure = { teams: [], generalManagers: [] };
  private companyKey?: string;
  /** What was written while the hub could not be reached; it goes, in order, when it can (plan.md 20.10). */
  private outbox: Record<string, unknown>[] = [];
  /** Called for a message that names me, a direct message to me, or a card given to me. */
  onNotice: (notice: MemberNotice) => void = () => undefined;
  private typing = new Map<string, { project: string; channel: string; until: number }>();
  private reads: { from: number; marks: Record<string, number> } = { from: 0, marks: {} };
  private keys = new Map<number, TeamKey>();
  private epoch = 0;
  private indexKey?: string;
  private rooms: string[] = [];
  private device?: DirectDevice;
  /** What arrives after this is new; the replay of the history on page load does not notify. */
  private liveFrom = Number.POSITIVE_INFINITY;
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
    clearInterval(this.reminders);
    clearInterval(this.comparing);
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
    await this.loadReads();
    this.outbox = (await this.store.get<Record<string, unknown>[]>(OUTBOX)) ?? [];
    await this.loadStructure();
    this.rooms = await this.direct.roomsFor(user.id, [...this.members.keys()]);
    this.setState({ phase: "ready", user, connected: false });
    this.connect();
    clearInterval(this.reminders);
    this.reminders = setInterval(() => this.meetingReminders(), 30_000);
    clearInterval(this.comparing);
    this.comparing = setInterval(() => void this.compare().catch(() => undefined), 5 * 60_000);
    setTimeout(() => void this.compare().catch(() => undefined), 15_000);
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
    this.device = { ...device, id: await deviceIdOf((await this.store.get<string>(TOKEN)) ?? "") };
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
    this.companyKey = await projectKey(first, COMPANY_STREAM);
    return true;
  }

  /** The company's teams and its general manager(s), from the hub; and whether it has a router for big calls. */
  async loadStructure(): Promise<void> {
    this.structure = await this.request<OrgStructure>("/api/org").catch(() => this.structure);
    this.sfu = !!(await this.request<{ url?: string }>("/api/sfu").catch(() => ({}) as { url?: string })).url;
    this.changed();
  }

  /** Whether the hub has a router (LiveKit) for calls of more than five. */
  sfu = false;

  /** The right to join a big call's room on the router. */
  sfuToken(room: string): Promise<{ url: string; token: string }> {
    return this.request("/api/sfu-token", { method: "POST", body: JSON.stringify({ room }) });
  }

  private async loadMembers(): Promise<void> {
    const list = await this.request<MemberPerson[]>("/api/members").catch(() => []);
    for (const m of list) this.members.set(m.id, m);
  }

  nameOf(userId: string): string {
    const m = this.members.get(userId);
    return m?.displayName || m?.username || userId.slice(0, 6);
  }

  me(): MemberUser | undefined {
    return this.state.phase === "ready" ? this.state.user : undefined;
  }

  private myId(): string {
    return this.me()?.id ?? "";
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
        this.send({
          op: "sub",
          projects: [
            this.indexKey,
            ...(this.companyKey ? [this.companyKey] : []),
            ...this.projects.keys(),
            ...this.rooms,
          ],
        });
        void this.flushOutbox();
        // What the hub replays now is history; from a moment after, it is news worth a notice.
        setTimeout(() => {
          this.liveFrom = Date.now();
        }, 1500);
      };
      ws.onmessage = (m) => void this.onMessage(String(m.data));
      ws.onclose = () => {
        if (this.state.phase !== "ready") return;
        this.setState({ ...this.state, connected: false });
        setTimeout(() => this.state.phase === "ready" && this.connect(), 3000);
      };
    });
  }

  private send(message: unknown): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  private async onMessage(raw: string): Promise<void> {
    const msg = JSON.parse(raw) as { op: string; project?: string; events?: WireEvent[]; users?: string[] };
    if (msg.op === "online" && msg.users) {
      this.online = new Set(msg.users);
      this.changed();
    } else if (msg.op === "events" && msg.project && msg.events) {
      if (this.direct.isRoom(msg.project)) await this.applyDirect(msg.project, msg.events);
      else await this.apply(msg.project, msg.events);
    } else if (msg.op === "presence") {
      await this.applyPresence(msg as unknown as WireEvent & { project: string });
    } else if (msg.op === "key-wraps") {
      await this.refreshKeys();
    } else if (msg.op === "members") {
      await this.membersChanged();
    } else if (msg.op === "ack") {
      // My own event, numbered by the hub: it counts as here (the hub does not send it back).
      const ack = msg as unknown as { id: string; seq: number | null };
      const project = this.acks.get(ack.id);
      this.acks.delete(ack.id);
      if (project && ack.seq)
        this.received.get(project)?.add(ack.seq) ?? this.received.set(project, new Set([ack.seq]));
    } else if (msg.op === "org") {
      await this.loadStructure();
      await this.membersChanged();
    } else if (["peers", "joined", "left", "signal"].includes(msg.op)) {
      for (const fn of this.callListeners) fn(msg as unknown as CallEvent);
    }
  }

  /** A rename, a new teammate: their names, and a room with each new one. */
  private async membersChanged(): Promise<void> {
    await this.loadMembers();
    const me = this.myId();
    if (!me) return;
    const rooms = await this.direct.roomsFor(me, [...this.members.keys()]);
    const fresh = rooms.filter((r) => !this.rooms.includes(r));
    this.rooms = rooms;
    if (fresh.length) this.send({ op: "sub", projects: fresh });
    this.changed();
  }

  /** My events on their way to the hub, by id: which stream each is in, for its "ack". */
  private acks = new Map<string, string>();
  /** Which events of each stream this browser has, by the hub's number (plan.md 20.10). */
  private received = new Map<string, Set<number>>();
  /** When this browser last compared itself with the hub, and whether it was the same. */
  checked?: { at: number; matches: boolean; repaired: number };

  /**
   * Proof that this browser sees what the hub holds: per stream, the hub's count of events against
   * the ones that arrived here; a stream short of some is asked for again from its start.
   */
  async compare(): Promise<{ behind: number }> {
    const keys = [this.indexKey, this.companyKey, ...this.projects.keys()].filter((k): k is string => !!k);
    const digests = await this.request<Record<string, { count: number }>>(
      `/api/sync/digest?projects=${keys.join(",")}`,
    ).catch(() => ({}) as Record<string, { count: number }>);
    const short = Object.entries(digests).filter(([k, d]) => d.count > (this.received.get(k)?.size ?? 0));
    if (short.length)
      this.send({ op: "sub", projects: short.map(([k]) => k), since: Object.fromEntries(short.map(([k]) => [k, 0])) });
    const behind = short.reduce((n, [k, d]) => n + d.count - (this.received.get(k)?.size ?? 0), 0);
    this.checked = { at: Date.now(), matches: behind === 0, repaired: behind };
    this.changed();
    return { behind };
  }

  /** Decrypts a batch and folds it into the projects; events made with a key this device lacks are skipped. */
  async apply(project: string, events: WireEvent[]): Promise<void> {
    const got = this.received.get(project) ?? new Set<number>();
    this.received.set(project, got);
    for (const event of events) {
      got.add(event.seq);
      const key = this.keys.get(event.epoch ?? 0);
      if (!key) continue;
      try {
        const value = await decrypt<Record<string, unknown>>(
          key,
          aadFor(project, event.kind, event.n, event.prev),
          event.nonce,
          event.data,
        );
        if (project === this.indexKey) this.applyIndex(event, value);
        else if (project === this.companyKey) this.foldCompany(event, value);
        else await this.fold(project, event, value);
      } catch {
        // Tampered with, or not meant for this team key.
      }
    }
    this.changed();
  }

  /** One company event; a message to me while the page is open is a notice. */
  private foldCompany(event: { kind: string; author: string; at: number }, value: Record<string, unknown>): void {
    const { post, card } = foldOrg(this.org, event.kind, value, { author: event.author, at: event.at });
    const me = this.me();
    if (!me || event.author === me.id || event.at <= this.liveFrom) return;
    if (post && this.forMe(post))
      this.onNotice({
        title: post.bot ? this.org.bot.name : this.nameOf(post.by),
        body: post.text.slice(0, 140),
        open: `org:${post.channel}`,
      });
    if (card && card.assignee === me.id && card.updatedBy !== me.id && card.status === "accepted")
      this.onNotice({ title: this.org.bot.name, body: card.title, open: "org:cards" });
  }

  private forMe(post: OrgPost): boolean {
    const me = this.myId();
    return (
      post.channel === `bot:${me}` ||
      !!post.announce ||
      cardPeople(this.org, post.channel).includes(me) ||
      audienceOf(this.structure, post).includes(me)
    );
  }

  /** A change to the company, made here: folded at once and sent (or kept until the hub can be reached). */
  async orgAct(kind: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = String(value.id ?? crypto.randomUUID().slice(0, 18));
    const full = { ...value, id, at: Number(value.at ?? Date.now()) };
    foldOrg(this.org, kind, full, { author: this.myId(), at: full.at });
    this.changed();
    if (this.companyKey) await this.publish(this.companyKey, kind, `${kind}-${id}-${Date.now() % 1e6}`, full);
    return full;
  }

  /** A message in a company channel, with the people and teams it names. */
  orgPost(input: { channel: string; text: string; announce?: boolean; audience?: string[]; card?: string }) {
    return this.orgAct("org-post", { ...input, ...namedIn(this.structure, [...this.members.values()], input.text) });
  }

  /** The hub's teams: made and changed there (it checks who may). */
  async teams(method: string, path: string, body?: unknown): Promise<unknown> {
    const out = await this.request(`/api/org/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    await this.loadStructure();
    return out;
  }

  // ---- meetings (plan.md 20.8): the call's messages go through this connection ---------------

  private callListeners = new Set<(e: CallEvent) => void>();

  callSend(msg: { op: string; room: string; to?: string; data?: string; name?: string }): void {
    this.send(msg);
  }

  onCall(fn: (e: CallEvent) => void): () => void {
    this.callListeners.add(fn);
    return () => this.callListeners.delete(fn);
  }

  /** A one-time link for someone outside the team, to one call, for a day. */
  async guestLink(room: string): Promise<string> {
    return (
      await this.request<{ token: string }>("/api/guest-links", { method: "POST", body: JSON.stringify({ room }) })
    ).token;
  }

  private reminders?: ReturnType<typeof setInterval>;
  private comparing?: ReturnType<typeof setInterval>;
  private toldMeetings = new Set<string>();

  /** Ten minutes before my meetings and when they start; the page words it ("meet:soon"). */
  private meetingReminders(): void {
    const me = this.myId();
    if (!me) return;
    const teams = this.structure.teams.filter((t) => t.members.includes(me)).map((t) => t.id);
    for (const n of meetingNotices(Object.values(this.org.meetings), me, teams)) {
      if (this.toldMeetings.has(n.id)) continue;
      this.toldMeetings.add(n.id);
      const tell = () =>
        this.onNotice({ title: n.meeting.title, body: `meet:${n.kind}`, open: `org:meet:${n.meeting.id}` });
      // Late: only someone who is not in the call is told it started without them.
      if (n.kind !== "late") tell();
      else
        void roomOfMeeting(n.meeting.key)
          .then((room) => this.request<{ people: string[] }>(`/api/rooms/${room}`))
          .then((r) => !r.people.includes(me) && tell())
          .catch(() => undefined);
    }
  }

  /** How many of my changes still wait for the hub. */
  waiting(): number {
    return this.outbox.length;
  }

  private async flushOutbox(): Promise<void> {
    while (this.outbox.length && this.ws?.readyState === 1) {
      this.send(this.outbox[0]);
      this.outbox.shift();
    }
    await this.store.set(OUTBOX, this.outbox);
    this.changed();
  }

  /** The team's index: projects, each Igrek's report, and the admin's budgets. */
  private applyIndex(event: WireEvent, value: Record<string, unknown>): void {
    if (event.kind === "seat") {
      if (!Array.isArray(value.accounts)) return;
      const known = this.seats.get(event.author);
      if (!known || known.at < event.at)
        this.seats.set(event.author, { ...(value as unknown as MemberSeat), member: event.author, at: event.at });
    } else if (event.kind === "budgets") {
      if (this.members.get(event.author)?.role === "admin" && value.budgets && typeof value.budgets === "object")
        this.budgets = value.budgets as Record<string, SeatBudget>;
    } else this.addProject(value);
  }

  private addProject(value: Record<string, unknown>): void {
    const key = String(value.key ?? "");
    if (!/^[0-9a-f]{64}$/.test(key) || this.projects.has(key)) return;
    this.projects.set(key, emptyProject(key, String(value.name ?? "project")));
    this.send({ op: "sub", projects: [key] });
  }

  private async fold(project: string, event: WireEvent, v: Record<string, unknown>): Promise<void> {
    const p = this.projects.get(project);
    if (!p) return;
    if (event.kind === "file-part") {
      await this.files.receive(v);
      return;
    }
    const apply = FOLDS[event.kind];
    if (!apply) return;
    apply(p, v, { author: this.nameOf(event.author), authorId: event.author, at: event.at });
    if (event.author !== this.myId() && event.at > this.liveFrom) this.noticeFor(p, event.kind, v, event.author);
  }

  /** A message naming me, or a card someone gave me, while the page is open. */
  private noticeFor(p: MemberProject, kind: string, v: Record<string, unknown>, author: string): void {
    const me = this.me();
    if (!me) return;
    if (kind === "comment" && v.targetKind === "channel") {
      const c = p.comments.get(String(v.id));
      if (c && this.mentionsMe(c))
        this.onNotice({
          title: `${this.nameOf(author)} · #${channelName(c.targetId)}`,
          body: c.text.slice(0, 140),
          open: channelKey(p.key, c.targetId),
        });
    } else if (kind === "task") {
      const assignee = v.assignee as { kind?: string; id?: string } | undefined;
      if (assignee?.kind === "person" && assignee.id === me.id && v.status !== "done")
        this.onNotice({ title: p.name, body: String(v.title ?? ""), open: `project:${p.key}` });
    }
  }

  /** Whether a message names me: by the hub id Igrek puts in it, or by my @username typed in the browser. */
  mentionsMe(c: MemberComment): boolean {
    const me = this.me();
    if (!me || c.authorId === me.id || c.deleted) return false;
    if (c.mentions.includes(me.id)) return true;
    const name = me.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)@${name}\\b`, "i").test(c.text);
  }

  // ---- presence and typing ------------------------------------------------------------

  private async applyPresence(p: WireEvent & { project: string }): Promise<void> {
    const key = this.keys.get(p.epoch ?? 0);
    if (!key || p.author === this.myId() || !this.projects.has(p.project)) return;
    try {
      const value = await decrypt<{
        title?: string;
        tool?: string;
        files?: string[];
        at?: number;
        typing?: { channel?: string; at?: number };
      }>(key, `${p.project}:presence`, p.nonce, p.data);
      // A stale one (the hub replays the last presence to newcomers) says nothing about now.
      if (value.typing?.channel && Date.now() - Number(value.typing.at ?? 0) < TYPING_TTL)
        this.typing.set(p.author, {
          project: p.project,
          channel: value.typing.channel,
          until: Date.now() + TYPING_TTL,
        });
      if (value.tool)
        this.presence.set(`${p.author}:${p.project}`, {
          userId: p.author,
          project: p.project,
          title: value.title,
          tool: value.tool,
          files: value.files ?? [],
          at: value.at ?? p.at,
          until: Date.now() + PRESENCE_TTL,
        });
      this.changed();
      setTimeout(() => this.changed(), TYPING_TTL + 100);
    } catch {
      // Not made with our key.
    }
  }

  /** Who is typing in a channel right now. */
  typingIn(project: string, channelId: string): string[] {
    const name = channelName(channelId);
    const now = Date.now();
    return [...this.typing]
      .filter(([, t]) => t.project === project && t.channel === name && t.until > now)
      .map(([id]) => this.nameOf(id));
  }

  /** Teammates working in Igrek in the last minutes, newest first. */
  working(project?: string): MemberPresence[] {
    const now = Date.now();
    return [...this.presence.values()]
      .filter((p) => p.until > now && (!project || p.project === project))
      .sort((a, b) => b.at - a.at);
  }

  private lastTyping = 0;

  /** "Ayse is typing..." for teammates; at most every few seconds, nothing is stored. */
  async sendTyping(project: string, channelId: string): Promise<void> {
    const key = this.keys.get(this.epoch);
    if (!key || Date.now() - this.lastTyping < 3000) return;
    this.lastTyping = Date.now();
    const sealed = await encrypt(key, `${project}:presence`, {
      typing: { channel: channelName(channelId), at: Date.now() },
    });
    this.send({ op: "presence", project, epoch: this.epoch, ...sealed });
  }

  // ---- read marks and unread counts -----------------------------------------------------

  private async loadReads(): Promise<void> {
    const saved = await this.store.get<{ from: number; marks: Record<string, number> }>(READS);
    // The first time in this browser, what came before counts as read: only new things are unread.
    this.reads = saved ?? { from: Date.now(), marks: {} };
    if (!saved) await this.store.set(READS, this.reads);
  }

  readMark(key: string): number {
    return this.reads.marks[key] ?? this.reads.from;
  }

  private async setRead(key: string, at: number): Promise<boolean> {
    if (this.readMark(key) >= at) return false;
    this.reads.marks[key] = at;
    await this.store.set(READS, this.reads);
    this.changed();
    return true;
  }

  /** Teammates' messages in a channel I have not opened since they came. */
  unreadIn(project: MemberProject, channelId: string): number {
    const mark = this.readMark(channelKey(project.key, channelId));
    const me = this.myId();
    return messagesIn(project, channelId).filter((c) => c.authorId !== me && !c.deleted && c.at > mark).length;
  }

  unreadDirect(peer: string): number {
    const mark = this.readMark(directKey(peer));
    return (this.direct.talks.get(peer) ?? []).filter((m) => !m.mine && m.at > mark).length;
  }

  /** Opened: its count goes, and teammates see how far I have read (as from Igrek on a computer). */
  async markSeen(project: string, channelId: string): Promise<void> {
    const p = this.projects.get(project);
    const last = p ? messagesIn(p, channelId).at(-1) : undefined;
    if (!last || !(await this.setRead(channelKey(project, channelId), last.at))) return;
    if (this.me()?.role === "viewer") return;
    const value = { channelId, at: Date.now() };
    await this.publish(project, "seen", `seen-${crypto.randomUUID().slice(0, 12)}`, value);
    FOLDS.seen?.(p as MemberProject, value, { author: "", authorId: this.myId(), at: value.at });
  }

  async markDirectRead(peer: string): Promise<void> {
    const last = this.direct.talks.get(peer)?.at(-1);
    if (last) await this.setRead(directKey(peer), last.at);
  }

  // ---- direct messages -----------------------------------------------------------------

  private async applyDirect(room: string, events: WireEvent[]): Promise<void> {
    const me = this.myId();
    if (!this.device || !me) return;
    const added = await this.direct.open(room, events, me, this.device);
    for (const m of added)
      if (!m.mine && m.at > this.liveFrom)
        this.onNotice({ title: this.nameOf(m.peer), body: m.text.slice(0, 140), open: directKey(m.peer) });
    if (added.length) this.changed();
  }

  /** Sealed for the two people's devices; the hub, an admin or anyone else on the team cannot open it. */
  async sendDirect(peer: string, text: string, quoteId?: string): Promise<DirectMessage> {
    const me = this.myId();
    if (!this.device || !me || !text.trim()) throw new Error("Not signed in");
    const keysOf = (id: string) =>
      this.request<{ deviceId: string; publicKey: string }[]>(`/api/users/${encodeURIComponent(id)}/device-keys`);
    const devices = [...(await keysOf(peer)), ...(await keysOf(me))];
    const sealed = await this.direct.seal({ me, peer, device: this.device, text: text.trim(), quoteId }, devices);
    if (!sealed) throw new Error(`${this.nameOf(peer)} has no device that could read it yet`);
    if (!this.send(sealed.op)) throw new Error("Not connected to the hub; try again in a moment");
    this.direct.add(sealed.message);
    await this.setRead(directKey(peer), sealed.message.at);
    this.changed();
    return sealed.message;
  }

  // ---- what a web member may send -----------------------------------------------------

  private async publish(project: string, kind: string, id: string, value: unknown): Promise<void> {
    const key = this.keys.get(this.epoch);
    if (!key) throw new Error("No team key yet");
    const sealed = await encrypt(key, aadFor(project, kind), value);
    const op = { op: "pub", project, kind, id: id.slice(0, 40), epoch: this.epoch, ...sealed };
    this.acks.set(op.id, project);
    // Offline: it waits, in order, and goes when the hub is back (plan.md 20.10).
    if (this.outbox.length || !this.send(op)) {
      this.outbox.push(op);
      await this.store.set(OUTBOX, this.outbox);
      this.changed();
    }
  }

  /** The hub ids of the teammates a text names with @username. */
  private mentionsIn(text: string): string[] {
    const named = new Set([...text.matchAll(/(?:^|\s)@([\w.-]+)/g)].map((m) => (m[1] ?? "").toLowerCase()));
    return [...this.members.values()].filter((m) => named.has(m.username.toLowerCase())).map((m) => m.id);
  }

  /**
   * A comment on a session, a decision or a card, or a message in a channel; teammates see it like
   * one written in Igrek. A file goes first, in parts, so it is (nearly) there when its message is.
   */
  async comment(
    project: string,
    target: { kind: string; id: string },
    text: string,
    extra: { parentId?: string; quoteId?: string; file?: Blob & { name?: string } } = {},
  ): Promise<void> {
    const file = extra.file ? await prepareFile(extra.file) : undefined;
    if (!text.trim() && !file) return;
    if (file) {
      for (let i = 0; i < file.parts.length; i++)
        await this.publish(project, "file-part", `f-${file.attachment.hash.slice(0, 24)}-${i}`, {
          hash: file.attachment.hash,
          i,
          n: file.parts.length,
          data: file.parts[i],
        });
      this.files.keep(file.attachment.hash, file.parts);
    }
    const value = {
      id: crypto.randomUUID().slice(0, 12),
      targetKind: target.kind,
      targetId: target.id,
      text: text.trim().slice(0, 4000),
      mentions: this.mentionsIn(text),
      at: Date.now(),
      ...(extra.parentId ? { parentId: extra.parentId } : {}),
      ...(extra.quoteId ? { quoteId: extra.quoteId } : {}),
      ...(file ? { attachment: file.attachment } : {}),
    };
    await this.publish(project, "comment", `c-${value.id}`, value);
    await this.foldMine(project, "comment", value);
    if (target.kind === "channel") await this.setRead(channelKey(project, target.id), value.at);
  }

  private async foldMine(project: string, kind: string, value: Record<string, unknown>): Promise<void> {
    await this.fold(project, { kind, author: this.myId(), at: Date.now() } as WireEvent, value);
    this.changed();
  }

  /** My own message, changed or deleted for everyone; its pin stays as it is. */
  async updateMessage(project: string, id: string, change: { text: string } | { deleted: true }): Promise<void> {
    const c = this.projects.get(project)?.comments.get(id);
    if (!c || c.authorId !== this.myId()) return;
    const at = Date.now();
    const text = "text" in change ? change.text.trim().slice(0, 4000) : "";
    if ("text" in change && !text) return;
    const value =
      "deleted" in change
        ? { id, text: "", deleted: true, pinned: false, at }
        : { id, text, deleted: false, pinned: !!c.pinned, editedAt: at, at };
    await this.publish(project, "chat-update", `u-${id}-${at}`, value);
    await this.foldMine(project, "chat-update", value);
  }

  /** My reaction on a message, given or taken back (a second tap), like in Igrek. */
  async react(project: string, messageId: string, reaction: string): Promise<void> {
    const had = this.projects.get(project)?.reactions.get(messageId)?.get(this.myId())?.has(reaction) ?? false;
    const value = { messageId, reaction, removed: had, at: Date.now() };
    // Event ids are cut at 40 characters: the message id would leave every tap the same id.
    await this.publish(project, "reaction", `r-${crypto.randomUUID()}`, value);
    await this.foldMine(project, "reaction", value);
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
    await this.foldMine(project, "task", task);
  }

  /** "I'm taking this" on a board card (or let it go). */
  async claim(project: string, taskId: string, take: boolean): Promise<void> {
    const task = this.projects.get(project)?.tasks.get(taskId);
    const me = this.me();
    if (!task || !me) return;
    if (take && task.claimedBy && task.claimedBy.id !== me.id)
      throw new Error(`${task.claimedBy.name} already took this card`);
    const { author: _a, ...rest } = task;
    const next = { ...rest, claimedBy: take ? { id: me.id, name: me.displayName } : undefined, updatedAt: Date.now() };
    await this.publish(project, "task", `task-${taskId}-${next.updatedAt}`, next);
    await this.foldMine(project, "task", next);
  }

  /** Name, picture and language, on the hub; teammates see the new name at once. */
  async updateProfile(patch: { displayName?: string; avatar?: string; language?: string }): Promise<void> {
    const user = await this.request<MemberUser>("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
    if (this.state.phase === "ready") this.setState({ ...this.state, user: { ...this.state.user, ...user } });
    await this.loadMembers();
    this.changed();
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
