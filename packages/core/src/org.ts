/**
 * The company (plan.md 20.2-20.7): its teams (kept on the hub, plain: who is in which team) and
 * everything said and planned between them (kept as end-to-end encrypted events on one company
 * stream). The same fold runs in Igrek on a computer and in the hub's web page, so both show the
 * same cards, channels, requests and announcements.
 */

export interface OrgTeam {
  id: string;
  name: string;
  description: string;
  leadId?: string;
  members: string[];
  /** Opaque project ids (the hub's), the team's responsibility. */
  projects: string[];
}

export interface OrgStructure {
  teams: OrgTeam[];
  generalManagers: string[];
}

export type OrgCardStatus = "open" | "accepted" | "doing" | "review" | "done" | "declined" | "closed";
export type OrgPriority = "low" | "normal" | "high" | "urgent";

/** One piece of work: for a person, a team's queue, a bot, or asked of one team by another. */
export interface OrgCard {
  id: string;
  title: string;
  detail: string;
  /** The team whose queue it is in. */
  team?: string;
  /** A request from another team (plan.md 20.4): it goes back to them when done. */
  fromTeam?: string;
  /** A person's hub id, or "bot:<handle>" for a team bot. */
  assignee?: string;
  /** The project it is about (its hub id) and its name, for whoever cannot read the project. */
  project?: string;
  projectName?: string;
  priority: OrgPriority;
  due?: number;
  status: OrgCardStatus;
  /** Where it came from: by hand, the coordinator bot, a note in a preview, a meeting, an alert. */
  origin: "manual" | "bot" | "preview" | "meeting" | "alert";
  /** The picked element and page, for a note left in a preview. */
  note?: { url: string; text?: string };
  /** Why the coordinator chose this person, in one sentence. */
  reason?: string;
  /** The person waiting for it: told when it is done. */
  requestedBy: string;
  /** "Waiting for approval", "need information": who it waits on, and since when. */
  waitingOn?: { who: string; what: string; since: number };
  /** Follow-ups already sent, by stage, so each goes once. */
  told?: Record<string, number>;
  by: string;
  at: number;
  updatedAt: number;
  updatedBy: string;
  history: { at: number; by: string; what: string }[];
  /** Two people changed it at once while apart: the other side's values, shown until settled. */
  conflict?: {
    by: string;
    at: number;
    fields: Partial<Pick<OrgCard, "title" | "detail" | "assignee" | "status" | "due">>;
  };
}

/** A message in a company channel, an announcement, a comment on a card, or a report. */
export interface OrgPost {
  id: string;
  /** "general", "team:<id>", "pair:<a>|<b>" (two teams), "card:<id>", "report:<user>". */
  channel: string;
  text: string;
  by: string;
  at: number;
  mentions: string[];
  /** Teams named with @ (everyone in them is told). */
  teamMentions: string[];
  announce?: boolean;
  /** An announcement's audience; none is the whole company. */
  audience?: string[];
  bot?: boolean;
  /** What the bot says, as a text key and values: each reader sees it in their own language. */
  say?: { key: string; vars?: Record<string, string | number> };
  /** The card a bot message or a comment is about. */
  card?: string;
  editedAt?: number;
  deleted?: boolean;
  /** Earlier texts, for whoever may see changes (plan.md 20.9). */
  previous?: { text: string; at: number }[];
}

/** When someone works, and when they are away (plan.md 20.7, 20.8). */
export interface OrgAvailability {
  /** Minutes after midnight, local to them. */
  from: number;
  to: number;
  /** 0 = Sunday. */
  days: number[];
  leave: { from: number; to: number }[];
  /** Their offset from UTC in minutes (as Date.getTimezoneOffset gives it). */
  tz: number;
}

export interface OrgBotConfig {
  name: string;
  handle: string;
  /** The person whose Igrek runs the bot (it needs a computer that is on). */
  host?: string;
  /** Hour of the morning report, local to the host; -1 = none. */
  reportHour: number;
  enabled: boolean;
}

export interface OrgState {
  cards: Record<string, OrgCard>;
  posts: Record<string, OrgPost>;
  /** Who read which announcement, when. */
  reads: Record<string, Record<string, number>>;
  availability: Record<string, OrgAvailability>;
  bot: OrgBotConfig;
}

export const DEFAULT_BOT: OrgBotConfig = { name: "Asistan", handle: "asistan", reportHour: 9, enabled: false };

export function emptyOrg(): OrgState {
  return { cards: {}, posts: {}, reads: {}, availability: {}, bot: { ...DEFAULT_BOT } };
}

/** The company stream's name, turned into an opaque id with the team key like a project's. */
export const COMPANY_STREAM = "__company__";

const STATUSES: OrgCardStatus[] = ["open", "accepted", "doing", "review", "done", "declined", "closed"];
const PRIORITIES: OrgPriority[] = ["low", "normal", "high", "urgent"];
const ORIGINS: OrgCard["origin"][] = ["manual", "bot", "preview", "meeting", "alert"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 50) : []);

/** A card as it came over the wire: only its known parts, of the right kinds. */
export function cleanCard(v: Record<string, unknown>, author: string, at: number): OrgCard | undefined {
  const id = str(v.id, 40);
  const title = str(v.title, 200)?.trim();
  if (!id || !title) return undefined;
  return {
    id,
    title,
    detail: str(v.detail, 4000) ?? "",
    ...optionalIds(v),
    priority: PRIORITIES.includes(v.priority as OrgPriority) ? (v.priority as OrgPriority) : "normal",
    status: STATUSES.includes(v.status as OrgCardStatus) ? (v.status as OrgCardStatus) : "open",
    origin: ORIGINS.includes(v.origin as OrgCard["origin"]) ? (v.origin as OrgCard["origin"]) : "manual",
    ...optionalParts(v),
    requestedBy: str(v.requestedBy, 40) ?? author,
    by: str(v.by, 40) ?? author,
    at: num(v.at) ?? at,
    updatedAt: num(v.updatedAt) ?? at,
    updatedBy: author,
    history: Array.isArray(v.history) ? (v.history as OrgCard["history"]).slice(-40) : [],
  };
}

/** The card's optional links: its team, the asking team, its holder, its project. */
function optionalIds(v: Record<string, unknown>): Partial<OrgCard> {
  const out: Partial<OrgCard> = {};
  for (const [k, max] of [
    ["team", 40],
    ["fromTeam", 40],
    ["assignee", 60],
    ["project", 64],
    ["projectName", 80],
  ] as const) {
    const value = str(v[k], max);
    if (value) out[k] = value;
  }
  return out;
}

/** The card's optional parts: due date, a preview note, the bot's reason, what it waits on, follow-ups sent. */
function optionalParts(v: Record<string, unknown>): Partial<OrgCard> {
  const note = v.note as { url?: unknown; text?: unknown } | undefined;
  const out: Partial<OrgCard> = {};
  if (num(v.due)) out.due = num(v.due);
  if (note && typeof note.url === "string")
    out.note = { url: note.url.slice(0, 300), ...(str(note.text, 160) ? { text: str(note.text, 160) } : {}) };
  if (str(v.reason, 300)) out.reason = str(v.reason, 300);
  if (v.waitingOn && typeof v.waitingOn === "object") out.waitingOn = v.waitingOn as OrgCard["waitingOn"];
  if (v.told && typeof v.told === "object") out.told = v.told as Record<string, number>;
  if (v.conflict && typeof v.conflict === "object") out.conflict = v.conflict as OrgCard["conflict"];
  return out;
}

const MERGED: (keyof NonNullable<OrgCard["conflict"]>["fields"])[] = ["title", "detail", "assignee", "status", "due"];

/**
 * Two versions of a card: the newer one wins, its history keeps both sides' lines. When both were
 * made from the same version by different people (changed while apart), the losing side's changed
 * fields are kept as a conflict to settle, so nothing is lost (plan.md 20.10).
 */
export function mergeCard(known: OrgCard | undefined, incoming: OrgCard, base?: number): OrgCard {
  if (!known) return incoming;
  const [newer, older] = incoming.updatedAt >= known.updatedAt ? [incoming, known] : [known, incoming];
  const lines = new Map([...older.history, ...newer.history].map((h) => [`${h.at}:${h.by}:${h.what}`, h]));
  const history = [...lines.values()].sort((a, b) => a.at - b.at).slice(-40);
  const parallel = base !== undefined && older.updatedAt > base && older.updatedBy !== newer.updatedBy;
  const fields: NonNullable<OrgCard["conflict"]>["fields"] = {};
  if (parallel) for (const f of MERGED) if (older[f] !== newer[f]) (fields as Record<string, unknown>)[f] = older[f];
  const conflict = Object.keys(fields).length ? { by: older.updatedBy, at: older.updatedAt, fields } : newer.conflict;
  return { ...newer, history, told: { ...older.told, ...newer.told }, ...(conflict ? { conflict } : {}) };
}

function cleanPost(v: Record<string, unknown>, author: string, at: number): OrgPost | undefined {
  const id = str(v.id, 40);
  const channel = str(v.channel, 120);
  if (!id || !channel) return undefined;
  return {
    id,
    channel,
    text: str(v.text, 8000) ?? "",
    by: author,
    at: num(v.at) ?? at,
    mentions: ids(v.mentions),
    teamMentions: ids(v.teamMentions),
    ...(v.announce ? { announce: true } : {}),
    ...(Array.isArray(v.audience) ? { audience: ids(v.audience) } : {}),
    ...(v.bot ? { bot: true } : {}),
    ...(cleanSay(v.say) ? { say: cleanSay(v.say) } : {}),
    ...(str(v.card, 40) ? { card: str(v.card, 40) } : {}),
  };
}

function cleanSay(v: unknown): OrgPost["say"] | undefined {
  const say = v as { key?: unknown; vars?: unknown } | undefined;
  if (!say || typeof say.key !== "string" || !/^[a-zA-Z]{1,40}$/.test(say.key)) return undefined;
  const vars: Record<string, string | number> = {};
  if (say.vars && typeof say.vars === "object")
    for (const [k, x] of Object.entries(say.vars as Record<string, unknown>).slice(0, 20))
      if (typeof x === "string" || typeof x === "number")
        vars[k.slice(0, 30)] = typeof x === "string" ? x.slice(0, 1000) : x;
  return { key: say.key, vars };
}

/** Folds one decrypted company event into the state; returns what changed, for notices. */
export function foldOrg(
  state: OrgState,
  kind: string,
  v: Record<string, unknown>,
  e: { author: string; at: number },
): { card?: OrgCard; post?: OrgPost } {
  if (kind === "org-card") {
    const card = cleanCard(v, e.author, e.at);
    if (!card) return {};
    const merged = mergeCard(state.cards[card.id], card, num(v.base));
    state.cards[card.id] = merged;
    return { card: merged };
  }
  if (kind === "org-post") {
    const post = cleanPost(v, e.author, e.at);
    if (!post || state.posts[post.id]) return {};
    state.posts[post.id] = post;
    return { post };
  }
  if (kind === "org-post-edit") return { post: editPost(state, v, e.author) };
  if (kind === "org-read") {
    const id = str(v.id, 40) ?? "";
    state.reads[id] = { ...state.reads[id], [e.author]: num(v.at) ?? e.at };
  } else if (kind === "org-avail") {
    state.availability[e.author] = cleanAvailability(v);
  } else if (kind === "org-bot") {
    state.bot = {
      name: str(v.name, 40)?.trim() || DEFAULT_BOT.name,
      handle: str(v.handle, 32)?.trim() || DEFAULT_BOT.handle,
      ...(str(v.host, 40) ? { host: str(v.host, 40) } : {}),
      reportHour: num(v.reportHour) ?? DEFAULT_BOT.reportHour,
      enabled: !!v.enabled,
    };
  }
  return {};
}

/** The writer's own edit or deletion; the earlier text is kept for whoever may see changes. */
function editPost(state: OrgState, v: Record<string, unknown>, author: string): OrgPost | undefined {
  const post = state.posts[str(v.id, 40) ?? ""];
  const at = num(v.at) ?? 0;
  if (!post || post.by !== author || at <= (post.editedAt ?? 0)) return undefined;
  post.previous = [...(post.previous ?? []), { text: post.text, at: post.editedAt ?? post.at }].slice(-20);
  if (v.deleted) Object.assign(post, { text: "", deleted: true, editedAt: at });
  else Object.assign(post, { text: str(v.text, 8000) ?? "", editedAt: at });
  return post;
}

function cleanAvailability(v: Record<string, unknown>): OrgAvailability {
  const from = Math.min(1440, Math.max(0, num(v.from) ?? 9 * 60));
  const to = Math.min(1440, Math.max(from, num(v.to) ?? 18 * 60));
  const days = Array.isArray(v.days)
    ? v.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d < 7)
    : [1, 2, 3, 4, 5];
  const leave = Array.isArray(v.leave)
    ? (v.leave as { from?: unknown; to?: unknown }[])
        .map((l) => ({ from: num(l.from) ?? 0, to: num(l.to) ?? 0 }))
        .filter((l) => l.to > l.from)
        .slice(-30)
    : [];
  return { from, to, days, leave, tz: num(v.tz) ?? 0 };
}

// ---- who may do what ------------------------------------------------------------------

export interface OrgPerson {
  id: string;
  role: "admin" | "member" | "viewer";
  generalManager?: boolean;
}

export const teamsOf = (s: OrgStructure, userId: string) => s.teams.filter((t) => t.members.includes(userId));
export const leadsTeam = (s: OrgStructure, userId: string, teamId?: string) =>
  s.teams.some((t) => t.leadId === userId && (!teamId || t.id === teamId));
export const isManager = (s: OrgStructure, p: OrgPerson) => !!p.generalManager || s.generalManagers.includes(p.id);

/** Gives work to others: the general manager, admins and team leads (the bot acts with their authority). */
export function canAssign(s: OrgStructure, p: OrgPerson): boolean {
  return p.role !== "viewer" && (isManager(s, p) || p.role === "admin" || leadsTeam(s, p.id));
}

/** Writes to the whole company or chosen teams: only the general manager and the leads (plan.md 20.3). */
export function canAnnounce(s: OrgStructure, p: OrgPerson): boolean {
  return p.role !== "viewer" && (isManager(s, p) || leadsTeam(s, p.id));
}

/** Who should hear of a post: the people it names, every member of a team it names, and a direct channel's two. */
export function audienceOf(s: OrgStructure, post: OrgPost): string[] {
  const out = new Set(post.mentions);
  for (const t of s.teams) if (post.teamMentions.includes(t.id)) for (const m of t.members) out.add(m);
  out.delete(post.by);
  return [...out];
}

/** Whether a person sees an announcement: all of them, or one for a team they are in. */
export function seesAnnouncement(s: OrgStructure, post: OrgPost, p: OrgPerson): boolean {
  if (!post.audience?.length || isManager(s, p) || post.by === p.id) return true;
  return teamsOf(s, p.id).some((t) => post.audience?.includes(t.id));
}

// ---- reading the state ----------------------------------------------------------------

const OPEN: OrgCardStatus[] = ["open", "accepted", "doing", "review"];
export const isOpen = (c: OrgCard) => OPEN.includes(c.status);
export const isOverdue = (c: OrgCard, now = Date.now()) => isOpen(c) && !!c.due && c.due < now;

/** Open cards someone holds: what the coordinator weighs before giving them more. */
export function loadOf(state: OrgState, userId: string): number {
  return Object.values(state.cards).filter((c) => isOpen(c) && c.assignee === userId).length;
}

/** "@qa", "@backend": the teams a text names, by their name. */
export function teamMentionsIn(s: OrgStructure, text: string): string[] {
  const named = new Set([...text.matchAll(/(?:^|\s)@([\p{L}\p{N}._-]+)/gu)].map((m) => fold(m[1] ?? "")));
  return s.teams.filter((t) => named.has(fold(t.name).replace(/\s+/g, "-"))).map((t) => t.id);
}

/** The people (by @username) and teams (by @name) a message names, for its notices. */
export function namedIn(
  s: OrgStructure,
  people: { id: string; username: string }[],
  text: string,
): { mentions: string[]; teamMentions: string[] } {
  const names = new Map(people.map((p) => [p.username.toLowerCase(), p.id]));
  const mentions = [...text.matchAll(/(?:^|\s)@([\w.-]+)/g)]
    .map((m) => names.get((m[1] ?? "").toLowerCase()))
    .filter((x): x is string => !!x);
  return { mentions: [...new Set(mentions)], teamMentions: teamMentionsIn(s, text) };
}

/** Lowercase without accents, so "guvenlik" finds "Güvenlik" and "I" finds "ı". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i").toLowerCase();
}

/** A new card's fields, filled in; the caller publishes it as "org-card". */
export function newCard(input: Partial<OrgCard> & { title: string }, by: string, now = Date.now()): OrgCard {
  return {
    id: crypto.randomUUID().slice(0, 18),
    detail: "",
    priority: "normal",
    status: input.assignee ? "accepted" : "open",
    origin: "manual",
    requestedBy: by,
    ...input,
    by,
    at: now,
    updatedAt: now,
    updatedBy: by,
    history: [{ at: now, by, what: "created" }, ...(input.history ?? [])],
  };
}

/** The card changed by someone, with a line in its history; send it with base = the version it was made from. */
export function changeCard(card: OrgCard, patch: Partial<OrgCard>, by: string, what: string, now = Date.now()) {
  const at = Math.max(now, card.updatedAt + 1);
  return {
    ...card,
    ...patch,
    updatedAt: at,
    updatedBy: by,
    history: [...card.history, { at, by, what }].slice(-40),
    base: card.updatedAt,
  };
}

// ---- projects at a glance -------------------------------------------------------------

export interface ProjectGlance {
  key: string;
  name: string;
  teams: string[];
  open: number;
  overdue: number;
  doneWeek: number;
  doing: number;
  lastWorkAt?: number;
  lastWorkBy?: string;
  sessionsWeek: number;
}

/** Where a project stands: by its cards and how recently anyone worked on it. */
export function phaseOf(p: ProjectGlance): "idle" | "planning" | "building" | "finishing" {
  if (!p.open && !p.doneWeek) return p.sessionsWeek ? "building" : "idle";
  if (p.open && !p.doing && !p.doneWeek) return "planning";
  return p.open <= p.doneWeek ? "finishing" : "building";
}

/** 0-100 and a word: late cards, no work for a long time and a big pile lower it. */
export function healthOf(p: ProjectGlance, now = Date.now()): { score: number; risk: "low" | "medium" | "high" } {
  let score = 100 - Math.min(45, p.overdue * 15);
  const quiet = p.lastWorkAt ? (now - p.lastWorkAt) / 86_400_000 : 30;
  if (p.open > 0 && quiet > 3) score -= Math.min(30, Math.round(quiet * 3));
  if (p.open > 12) score -= 10;
  score = Math.max(0, Math.min(100, score));
  return { score, risk: score >= 75 ? "low" : score >= 50 ? "medium" : "high" };
}
