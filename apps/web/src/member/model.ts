import { type ChatAttachment, cleanAttachment, cleanPreview, type LinkPreview, type Seat } from "@igrek/core";

/**
 * What the web member's page holds of a project, and how each kind of team event lands in it, as
 * Igrek on a computer reads them. Everything here was decrypted in this browser.
 */

export interface MemberSession {
  id: string;
  tool: string;
  title?: string;
  firstPrompt?: string | null;
  updatedAt: number;
  startedAt?: number;
  userMessages?: number;
  /** Igrek's summary of the session (SessionSummaryData): a title and, per language, what was done and what is left. */
  summary?: { title?: string; texts?: Record<string, { did?: string[]; why?: string; left?: string[] }> } | null;
  author: string;
  authorId: string;
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

export interface MemberComment {
  id: string;
  targetKind: string;
  targetId: string;
  text: string;
  at: number;
  author: string;
  /** The writer's hub id, so only they can edit or delete it. */
  authorId: string;
  /** Hub ids of the people the message names with @. */
  mentions: string[];
  /** In a chat channel: the message this one answers in its thread. */
  parentId?: string;
  /** Igrek's answer to someone's @ai. */
  bot?: boolean;
  /** The board card the message became. */
  taskId?: string;
  /** The message this one answers (team chat, plan.md 19.9). */
  quoteId?: string;
  /** The link's card the writer sent along. */
  preview?: LinkPreview;
  /** A file sent with it; it shows once all its parts are here. */
  attachment?: ChatAttachment;
  editedAt?: number;
  deleted?: boolean;
  pinned?: boolean;
  /** When its pin last changed: the newest change wins, as on a computer. */
  updateAt?: number;
  /** Its earlier texts, from edits and the deletion. */
  previous?: { text: string; at: number }[];
}

export interface MemberChannel {
  id: string;
  name: string;
  topic: string;
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
  channels: Map<string, MemberChannel>;
  /** Reactions per message: who (hub id) gave which. */
  reactions: Map<string, Map<string, Set<string>>>;
  /** How far each teammate has read a channel, by the channel's name: hub id to time. */
  seen: Map<string, Map<string, number>>;
}

/** A teammate's Igrek report for the Company page (sync/seats.ts), with who sent it. */
export type MemberSeat = Pick<Seat, "version" | "os" | "accounts" | "week"> & { member: string; at: number };

export function emptyProject(key: string, name: string): MemberProject {
  return {
    key,
    name,
    sessions: new Map(),
    messages: new Map(),
    memory: new Map(),
    comments: new Map(),
    channels: new Map(),
    tasks: new Map(),
    reactions: new Map(),
    seen: new Map(),
  };
}

const MAX_MESSAGES = 2000;

/** A channel's name: what follows the first ":" in its id, as every Igrek rebuilds it. */
export const channelName = (id: string) => id.split(":").slice(1).join(":") || "general";

type Fold = (p: MemberProject, v: Record<string, unknown>, e: { author: string; authorId: string; at: number }) => void;

function commentOf(v: Record<string, unknown>, e: { author: string; authorId: string; at: number }): MemberComment {
  const preview = cleanPreview(v.preview);
  const attachment = cleanAttachment(v.attachment);
  return {
    id: String(v.id),
    targetKind: String(v.targetKind ?? ""),
    targetId: String(v.targetId ?? ""),
    text: String(v.text ?? ""),
    at: Number(v.at ?? e.at),
    author: e.author,
    authorId: e.authorId,
    mentions: Array.isArray(v.mentions) ? v.mentions.map(String).slice(0, 50) : [],
    ...(v.parentId ? { parentId: String(v.parentId) } : {}),
    ...(v.bot ? { bot: true } : {}),
    ...(v.taskId ? { taskId: String(v.taskId) } : {}),
    ...(v.quoteId ? { quoteId: String(v.quoteId) } : {}),
    ...(preview ? { preview } : {}),
    ...(attachment ? { attachment } : {}),
  };
}

/** How each kind of team event lands in a project, as Igrek on a computer reads them. */
export const FOLDS: Record<string, Fold> = {
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
      authorId: e.authorId,
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
    const known = p.comments.get(id);
    // A message that later became a card comes again with the card; what changed since stays.
    p.comments.set(id, known ? { ...known, ...(v.taskId ? { taskId: String(v.taskId) } : {}) } : commentOf(v, e));
  },
  reaction: (p, v, e) => {
    const id = String(v.messageId ?? "");
    const given = p.reactions.get(id) ?? new Map<string, Set<string>>();
    const mine = given.get(e.authorId) ?? new Set<string>();
    if (v.removed) mine.delete(String(v.reaction));
    else mine.add(String(v.reaction));
    given.set(e.authorId, mine);
    p.reactions.set(id, given);
  },
  // The pin is anyone's and the newest wins; an edit or deletion counts only from the one who wrote it.
  "chat-update": (p, v, e) => {
    const c = p.comments.get(String(v.id ?? ""));
    if (!c) return;
    const at = Number(v.at ?? 0);
    if ((c.updateAt ?? 0) <= at) Object.assign(c, { pinned: !!v.pinned, updateAt: at });
    if (c.authorId !== e.authorId) return;
    // What it said before stays, for whoever may see changes (plan.md 20.9).
    const before = { text: c.text, at: c.editedAt ?? c.at };
    if (v.deleted && !c.deleted)
      Object.assign(c, { text: "", deleted: true, pinned: false, previous: [...(c.previous ?? []), before] });
    else if (!v.deleted && Number(v.editedAt ?? 0) > (c.editedAt ?? 0))
      Object.assign(c, {
        text: String(v.text ?? ""),
        editedAt: Number(v.editedAt),
        previous: [...(c.previous ?? []), before],
      });
  },
  seen: (p, v, e) => {
    const name = channelName(String(v.channelId ?? ""));
    const marks = p.seen.get(name) ?? new Map<string, number>();
    marks.set(e.authorId, Math.max(marks.get(e.authorId) ?? 0, Number(v.at ?? 0)));
    p.seen.set(name, marks);
  },
  channel: (p, v) => {
    const id = String(v.id ?? "");
    if (id) p.channels.set(id, { id, name: String(v.name ?? ""), topic: String(v.topic ?? "") });
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

/** Every channel this browser knows of: made in Igrek, or seen in a message; #general first. */
export function channelsOf(project: MemberProject): MemberChannel[] {
  const all = new Map(project.channels);
  for (const c of project.comments.values())
    if (c.targetKind === "channel" && !all.has(c.targetId))
      all.set(c.targetId, { id: c.targetId, name: channelName(c.targetId), topic: "" });
  return [...all.values()].sort((a, b) =>
    a.name === "general" ? -1 : b.name === "general" ? 1 : a.name.localeCompare(b.name),
  );
}

/** A channel's messages, oldest first. */
export function messagesIn(project: MemberProject, channelId: string): MemberComment[] {
  return [...project.comments.values()]
    .filter((c) => c.targetKind === "channel" && c.targetId === channelId)
    .sort((a, b) => a.at - b.at);
}
