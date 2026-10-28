import type { Database } from "bun:sqlite";
import {
  CHAT_REACTIONS,
  type ChatChannel,
  type ChatMessage,
  type ChatReaction,
  type TaskStatus,
  type TeamTimelineItem,
} from "@igrek/core";
import type { Bus } from "./bus";

/** "PoultryCareAi:general": a channel belongs to one shared project, whose key encrypts it for the team. */
export const channelId = (projectId: string, name: string) => `${projectId}:${name}`;

/** Lower case, letters, digits and dashes, like Slack's channel names. */
function channelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** The thread of the message a card came from hears how the card moves; the page words it. */
export const taskEvent = (status: TaskStatus | "created") => `igrek:task:${status}`;

/** "@ai" or "@igrek" anywhere in a message asks Igrek to answer in the thread. */
export const asksIgrek = (text: string) => /(^|\s)@(ai|igrek)\b/i.test(text);

type MessageRow = {
  id: string;
  target_id: string;
  parent_id: string | null;
  author_id: string | null;
  author_name: string | null;
  text: string;
  at: number;
  bot: number;
  task_id: string | null;
  replies: number;
  last_reply: number | null;
  task_title: string | null;
  task_status: TaskStatus | null;
  task_assignee: string | null;
  quote_of: string | null;
  edited_at: number | null;
  deleted: number;
  pinned: number;
  starred: number;
  forwarded: number;
  read: number;
};

const SELECT_MESSAGE = `SELECT c.id, c.target_id, c.parent_id, c.author_id, c.author_name, c.text, c.at, c.bot, c.task_id,
  c.quote_of, c.edited_at, c.deleted, c.pinned, c.starred, c.forwarded, c.read,
  (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS replies,
  (SELECT MAX(r.at) FROM comments r WHERE r.parent_id = c.id) AS last_reply,
  t.title AS task_title, t.status AS task_status, t.assignee_name AS task_assignee
  FROM comments c LEFT JOIN board_tasks t ON t.id = c.task_id AND t.deleted = 0`;

type Reactions = ChatMessage["reactions"];

/** What a message adds to the plain row: its reactions, the message it quotes, who has seen it. */
interface Extras {
  reactions?: Reactions;
  quote?: ChatMessage["quote"];
  seenBy?: string[];
}

/** Only what is set, so a plain message stays small on the wire. */
function flags(r: MessageRow): Partial<ChatMessage> {
  return {
    ...(r.edited_at ? { editedAt: r.edited_at } : {}),
    ...(r.deleted ? { deleted: true } : {}),
    ...(r.pinned ? { pinned: true } : {}),
    ...(r.starred ? { starred: true } : {}),
    ...(r.forwarded ? { forwarded: true } : {}),
    ...(r.read ? {} : { unread: true }),
  };
}

function toMessage(r: MessageRow, extras: Extras = {}): ChatMessage {
  return {
    id: r.id,
    channelId: r.target_id,
    ...(r.parent_id ? { parentId: r.parent_id } : {}),
    ...(r.author_name ? { author: r.author_name } : {}),
    ...(r.author_id ? { authorId: r.author_id } : {}),
    mine: r.author_id === null,
    bot: r.bot === 1,
    text: r.deleted ? "" : r.text,
    at: r.at,
    replies: r.replies,
    reactions: extras.reactions ?? [],
    ...flags(r),
    ...(extras.quote ? { quote: extras.quote } : {}),
    ...(extras.seenBy?.length ? { seenBy: extras.seenBy } : {}),
    ...(r.last_reply ? { lastReplyAt: r.last_reply } : {}),
    ...(r.task_id && r.task_title && r.task_status
      ? {
          task: {
            id: r.task_id,
            title: r.task_title,
            status: r.task_status,
            ...(r.task_assignee ? { assignee: r.task_assignee } : {}),
          },
        }
      : {}),
  };
}

/**
 * The team's chat (plan.md, 26 Oct 2026): channels per shared project, threads, Igrek answering
 * when asked with @ai, and messages that become cards on the board. Messages are comments with
 * target "channel", so they travel to teammates end-to-end encrypted like every comment.
 */
export class Chat {
  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
  ) {}

  /** Every channel of the given projects: "general" always, those made here or by teammates, those with messages. */
  channels(projects: { id: string; name: string }[]): ChatChannel[] {
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const stats = new Map(
      (
        this.db
          .query(
            `SELECT target_id, MAX(at) AS last, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread, COUNT(*) AS n,
               json_group_array(DISTINCT CASE WHEN read = 0 THEN author_name END) AS from_names
             FROM comments WHERE target_kind = 'channel' GROUP BY target_id`,
          )
          .all() as { target_id: string; last: number; unread: number; n: number; from_names: string }[]
      ).map((r) => [r.target_id, r]),
    );
    const muted = new Set(
      (this.db.query("SELECT channel AS channel_id FROM chat_muted").all() as { channel_id: string }[]).map(
        (r) => r.channel_id,
      ),
    );
    const made = this.db.query("SELECT id, project_id, name, topic FROM channels").all() as {
      id: string;
      project_id: string;
      name: string;
      topic: string;
    }[];
    const ids = new Map<string, { projectId: string; name: string; topic: string }>();
    for (const p of projects) ids.set(channelId(p.id, "general"), { projectId: p.id, name: "general", topic: "" });
    for (const c of made) ids.set(c.id, { projectId: c.project_id, name: c.name, topic: c.topic });
    for (const id of stats.keys()) {
      const [projectId = "", name = "general"] = id.split(":");
      if (!ids.has(id)) ids.set(id, { projectId, name, topic: "" });
    }
    return [...ids.entries()]
      .filter(([, c]) => names.has(c.projectId))
      .map(([id, c]) => {
        const s = stats.get(id);
        return {
          id,
          projectId: c.projectId,
          project: names.get(c.projectId) ?? "",
          name: c.name,
          topic: c.topic,
          last: s?.last ?? 0,
          unread: s?.unread ?? 0,
          unreadFrom: s ? (JSON.parse(s.from_names) as (string | null)[]).filter((n): n is string => !!n) : [],
          messages: s?.n ?? 0,
          muted: muted.has(id),
        };
      })
      .sort((a, b) => a.project.localeCompare(b.project) || (a.name === "general" ? -1 : a.name.localeCompare(b.name)));
  }

  createChannel(projectId: string, rawName: string, topic: string, author?: string): string {
    const name = channelName(rawName);
    if (!name) throw new Error("A channel needs a name");
    const id = channelId(projectId, name);
    this.db
      .query(
        "INSERT INTO channels (id, project_id, name, topic, author_name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET topic = excluded.topic, sent = 0",
      )
      .run(id, projectId, name, topic.trim().slice(0, 200), author ?? null, Date.now());
    this.bus.publish({ type: "chat-changed", channelId: id });
    return id;
  }

  /** The channel's messages without replies (newest 200), or one thread's replies. */
  messages(channel: string, thread?: string): ChatMessage[] {
    if (thread)
      return this.decorate(
        this.db.query(`${SELECT_MESSAGE} WHERE c.parent_id = ? ORDER BY c.at`).all(thread) as MessageRow[],
      );
    const rows = this.db
      .query(
        `${SELECT_MESSAGE} WHERE c.target_kind = 'channel' AND c.target_id = ? AND c.parent_id IS NULL ORDER BY c.at DESC LIMIT 200`,
      )
      .all(channel) as MessageRow[];
    return this.decorate(rows.reverse());
  }

  message(id: string): ChatMessage | undefined {
    const row = this.db.query(`${SELECT_MESSAGE} WHERE c.id = ?`).get(id) as MessageRow | null;
    return row ? this.decorate([row])[0] : undefined;
  }

  /** Reactions, quotes and who has seen them, a few queries for the whole list. */
  private decorate(rows: MessageRow[]): ChatMessage[] {
    const reactions = this.reactionsOf(rows);
    const quotes = this.quotesOf(rows);
    const seen = this.seenOf(rows);
    return rows.map((r) => toMessage(r, { reactions: reactions.get(r.id), quote: quotes.get(r.id), seenBy: seen(r) }));
  }

  /** The message each one answers: who wrote it and how it starts. */
  private quotesOf(rows: MessageRow[]): Map<string, NonNullable<ChatMessage["quote"]>> {
    const ids = rows.flatMap((r) => (r.quote_of ? [r.quote_of] : []));
    const out = new Map<string, NonNullable<ChatMessage["quote"]>>();
    if (!ids.length) return out;
    const found = new Map(
      (
        this.db
          .query(
            "SELECT id, author_id, author_name, text, deleted FROM comments WHERE id IN (SELECT value FROM json_each(?))",
          )
          .all(JSON.stringify(ids)) as {
          id: string;
          author_id: string | null;
          author_name: string | null;
          text: string;
          deleted: number;
        }[]
      ).map((q) => [q.id, q]),
    );
    for (const r of rows) {
      if (!r.quote_of) continue;
      const q = found.get(r.quote_of);
      out.set(
        r.id,
        q
          ? {
              id: q.id,
              mine: q.author_id === null,
              text: q.deleted ? "" : q.text.slice(0, 200),
              ...(q.author_name ? { author: q.author_name } : {}),
            }
          : { id: r.quote_of, mine: false, text: "", missing: true },
      );
    }
    return out;
  }

  /** For my own messages: the teammates who have read their channel past it. */
  private seenOf(rows: MessageRow[]): (r: MessageRow) => string[] | undefined {
    const channels = [...new Set(rows.filter((r) => r.author_id === null).map((r) => r.target_id))];
    if (!channels.length) return () => undefined;
    const marks = this.db
      .query(
        `SELECT channel AS channel_id, COALESCE(member_name, '') AS name, at FROM chat_seen
         WHERE member != '' AND channel IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(channels)) as { channel_id: string; name: string; at: number }[];
    return (r) =>
      r.author_id === null
        ? marks.filter((m) => m.channel_id === r.target_id && m.at >= r.at && m.name).map((m) => m.name)
        : undefined;
  }

  /** The reactions under each message, in one query: grouped by kind, with who gave them. */
  private reactionsOf(rows: MessageRow[]): Map<string, Reactions> {
    const given = new Map<string, Reactions>();
    const found = this.db
      .query(
        `SELECT comment_id, member, member_name, reaction FROM chat_reactions
         WHERE removed = 0 AND comment_id IN (SELECT value FROM json_each(?)) ORDER BY at`,
      )
      .all(JSON.stringify(rows.map((r) => r.id))) as {
      comment_id: string;
      member: string;
      member_name: string | null;
      reaction: ChatReaction;
    }[];
    for (const f of found) {
      const list = given.get(f.comment_id) ?? [];
      let entry = list.find((e) => e.reaction === f.reaction);
      if (!entry) {
        entry = { reaction: f.reaction, count: 0, mine: false, names: [] };
        list.push(entry);
      }
      entry.count++;
      entry.mine ||= f.member === "";
      if (f.member_name) entry.names.push(f.member_name);
      given.set(f.comment_id, list);
    }
    return given;
  }

  /**
   * My reaction on a message, given or taken back (like tapping it again on WhatsApp). Mine are
   * kept with member "", teammates' with their hub id; either way it goes out with the next sync.
   */
  react(messageId: string, reaction: ChatReaction, name?: string): void {
    this.db
      .query(
        `INSERT INTO chat_reactions (comment_id, member, member_name, reaction, at, sent, removed)
         VALUES (?, '', ?, ?, ?, 0, 0)
         ON CONFLICT(comment_id, member, reaction) DO UPDATE SET removed = 1 - removed, sent = 0, at = excluded.at`,
      )
      .run(messageId, name ?? null, reaction, Date.now());
    const row = this.db.query("SELECT target_id FROM comments WHERE id = ?").get(messageId) as {
      target_id: string;
    } | null;
    if (row) this.bus.publish({ type: "chat-changed", channelId: row.target_id });
  }

  /** A message written here (or Igrek's answer, bot) goes out with the next sync. */
  post(args: {
    projectId: string;
    channel: string;
    text: string;
    parentId?: string;
    author?: string;
    mentions: string[];
    bot?: boolean;
    taskId?: string;
    quoteId?: string;
    forwarded?: boolean;
  }): string {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read, parent_id, bot, task_id,
           quote_of, forwarded)
         VALUES (?, ?, 'channel', ?, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        args.projectId,
        args.channel,
        args.author ?? null,
        args.text.slice(0, 8000),
        JSON.stringify(args.mentions),
        Date.now(),
        args.parentId ?? null,
        args.bot ? 1 : 0,
        args.taskId ?? null,
        args.quoteId ?? null,
        args.forwarded ? 1 : 0,
      );
    this.bus.publish({ type: "chat-changed", channelId: args.channel });
    return id;
  }

  private changed(messageId: string): void {
    const row = this.db.query("SELECT target_id FROM comments WHERE id = ?").get(messageId) as {
      target_id: string;
    } | null;
    if (row) this.bus.publish({ type: "chat-changed", channelId: row.target_id });
  }

  /** My own message, written again; teammates get the new text with the next sync. */
  edit(messageId: string, text: string): boolean {
    const { changes } = this.db
      .query(
        `UPDATE comments SET text = ?, edited_at = ?, update_at = ?, update_sent = 0
         WHERE id = ? AND author_id IS NULL AND deleted = 0 AND bot = 0`,
      )
      .run(text.slice(0, 8000), Date.now(), Date.now(), messageId);
    if (changes) this.changed(messageId);
    return changes > 0;
  }

  /** My own message, deleted for everyone: "This message was deleted" stays in its place. */
  remove(messageId: string): boolean {
    const { changes } = this.db
      .query(
        "UPDATE comments SET text = '', deleted = 1, pinned = 0, update_at = ?, update_sent = 0 WHERE id = ? AND author_id IS NULL",
      )
      .run(Date.now(), messageId);
    if (changes) this.changed(messageId);
    return changes > 0;
  }

  /** Pinned for the whole team (anyone may pin, like in a WhatsApp group). */
  pin(messageId: string, on: boolean): void {
    this.db
      .query("UPDATE comments SET pinned = ?, update_at = ?, update_sent = 0 WHERE id = ? AND deleted = 0")
      .run(on ? 1 : 0, Date.now(), messageId);
    this.changed(messageId);
  }

  /** Starred for me only; it never leaves this computer. */
  star(messageId: string, on: boolean): void {
    this.db.query("UPDATE comments SET starred = ? WHERE id = ?").run(on ? 1 : 0, messageId);
    this.changed(messageId);
  }

  pinned(channel: string): ChatMessage[] {
    return this.decorate(
      this.db
        .query(`${SELECT_MESSAGE} WHERE c.target_id = ? AND c.pinned = 1 AND c.deleted = 0 ORDER BY c.at DESC`)
        .all(channel) as MessageRow[],
    );
  }

  /** Every starred message of the given projects, newest first. */
  starred(projectIds: string[]): ChatMessage[] {
    return this.decorate(
      this.db
        .query(
          `${SELECT_MESSAGE} WHERE c.target_kind = 'channel' AND c.starred = 1 AND c.deleted = 0
             AND c.project_id IN (SELECT value FROM json_each(?)) ORDER BY c.at DESC LIMIT 200`,
        )
        .all(JSON.stringify(projectIds)) as MessageRow[],
    );
  }

  /** Messages of a channel (replies too) that contain every word searched for. */
  search(channel: string, query: string): ChatMessage[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!words.length) return [];
    const like = words.map(() => "AND lower(c.text) LIKE ? ESCAPE '\\'").join(" ");
    return this.decorate(
      this.db
        .query(
          `${SELECT_MESSAGE} WHERE c.target_kind = 'channel' AND c.target_id = ? AND c.deleted = 0 AND c.bot = 0 ${like}
           ORDER BY c.at DESC LIMIT 100`,
        )
        .all(channel, ...words.map((w) => `%${w.replace(/[\\%_]/g, "\\$&")}%`)) as MessageRow[],
    );
  }

  setMuted(channel: string, on: boolean): void {
    this.db
      .query(on ? "INSERT OR IGNORE INTO chat_muted (channel) VALUES (?)" : "DELETE FROM chat_muted WHERE channel = ?")
      .run(channel);
    this.bus.publish({ type: "chat-changed", channelId: channel });
  }

  // ---- team sync of edits, deletions, pins and "seen" -------------------------------------------

  unsentUpdates(projectId: string): {
    id: string;
    text: string;
    deleted: boolean;
    pinned: boolean;
    editedAt?: number;
    at: number;
  }[] {
    return (
      this.db
        .query(
          `SELECT id, text, deleted, pinned, edited_at, update_at, author_id FROM comments
           WHERE project_id = ? AND update_sent = 0 AND sent = 1 AND target_kind = 'channel'`,
        )
        .all(projectId) as {
        id: string;
        text: string;
        deleted: number;
        pinned: number;
        edited_at: number | null;
        update_at: number | null;
        author_id: string | null;
      }[]
    ).map((r) => ({
      id: r.id,
      // Only the writer's own computer speaks for the text; a pin from anyone else carries none.
      text: r.author_id === null ? r.text : "",
      deleted: r.author_id === null && r.deleted === 1,
      pinned: r.pinned === 1,
      ...(r.edited_at && r.author_id === null ? { editedAt: r.edited_at } : {}),
      at: r.update_at ?? 0,
    }));
  }

  /** Sent, unless it changed again on its way. */
  markUpdateSent(id: string, at: number): void {
    this.db.query("UPDATE comments SET update_sent = 1 WHERE id = ? AND update_at = ?").run(id, at);
  }

  /**
   * A teammate edited, deleted or pinned a message. The pin is anyone's and the newest one wins;
   * text and deletion count only from the one who wrote it, so someone else's later pin cannot hold
   * back the writer's own deletion or edit.
   */
  applyUpdate(value: Record<string, unknown>, author: { id: string }): void {
    const id = String(value.id ?? "");
    const at = Number(value.at ?? 0);
    const row = this.db.query("SELECT author_id, update_at, edited_at FROM comments WHERE id = ?").get(id) as {
      author_id: string | null;
      update_at: number | null;
      edited_at: number | null;
    } | null;
    if (!row) return;
    this.db.transaction(() => {
      if ((row.update_at ?? 0) <= at)
        this.db
          .query("UPDATE comments SET pinned = ?, update_at = ?, update_sent = 1 WHERE id = ?")
          .run(value.pinned ? 1 : 0, at, id);
      if (row.author_id !== author.id) return;
      if (value.deleted) this.db.query("UPDATE comments SET text = '', deleted = 1, pinned = 0 WHERE id = ?").run(id);
      else if (Number(value.editedAt ?? 0) > (row.edited_at ?? 0))
        this.db
          .query("UPDATE comments SET text = ?, edited_at = ? WHERE id = ? AND deleted = 0")
          .run(String(value.text ?? "").slice(0, 8000), Number(value.editedAt), id);
    })();
    this.changed(id);
  }

  /** My "read up to here" marks of the project's channels (those its messages are in, or named after it). */
  unsentSeen(projectId: string): { channelId: string; at: number }[] {
    return (
      this.db
        .query(
          `SELECT channel AS channel_id, at FROM chat_seen WHERE member = '' AND sent = 0 AND (
             channel IN (SELECT DISTINCT target_id FROM comments WHERE project_id = ? AND target_kind = 'channel')
             OR channel LIKE ? ESCAPE '\\')`,
        )
        .all(projectId, `${projectId.replace(/[\\%_]/g, "\\$&")}:%`) as { channel_id: string; at: number }[]
    ).map((r) => ({ channelId: r.channel_id, at: r.at }));
  }

  markSeenSent(channel: string, at: number): void {
    this.db.query("UPDATE chat_seen SET sent = 1 WHERE channel = ? AND member = '' AND at = ?").run(channel, at);
  }

  /** How far a teammate has read a channel; its id is rebuilt with our project id, like a channel's. */
  applySeen(projectId: string, value: Record<string, unknown>, author: { id: string; name: string }): void {
    const name = String(value.channelId ?? "")
      .split(":")
      .slice(1)
      .join(":");
    if (!author.id || !name) return;
    const channel = channelId(projectId, name);
    this.db
      .query(
        `INSERT INTO chat_seen (channel, member, member_name, at, sent) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(channel, member) DO UPDATE SET member_name = excluded.member_name, at = MAX(chat_seen.at, excluded.at)`,
      )
      .run(channel, author.id, author.name, Number(value.at ?? 0));
    this.bus.publish({ type: "chat-changed", channelId: channel });
  }

  /** Igrek is writing an answer in this channel: the page shows it, nothing is stored. */
  writing(channel: string, on: boolean): void {
    this.bus.publish({ type: "chat-changed", channelId: channel, writing: on });
  }

  /** A message that never goes to teammates (marked as already sent). */
  keepHere(id: string): void {
    this.db.query("UPDATE comments SET sent = 1 WHERE id = ?").run(id);
  }

  /** Opened: its count goes, the sidebar hears of it at once, and teammates see that I read it. */
  markRead(channel: string): void {
    const changes = this.db.transaction(() => {
      const { changes } = this.db
        .query("UPDATE comments SET read = 1 WHERE target_kind = 'channel' AND target_id = ? AND read = 0")
        .run(channel);
      if (changes > 0)
        this.db
          .query(
            `INSERT INTO chat_seen (channel, member, at, sent) VALUES (?, '', ?, 0)
             ON CONFLICT(channel, member) DO UPDATE SET at = excluded.at, sent = 0`,
          )
          .run(channel, Date.now());
      return changes;
    })();
    if (changes > 0) this.bus.publish({ type: "chat-changed", channelId: channel });
  }

  /** The card a message became; the message is sent again so teammates see the link too. */
  linkTask(messageId: string, taskId: string): void {
    this.db
      .query("UPDATE comments SET task_id = ?, sent = 0 WHERE id = ? AND author_id IS NULL")
      .run(taskId, messageId);
    const row = this.db.query("SELECT target_id FROM comments WHERE id = ?").get(messageId) as {
      target_id: string;
    } | null;
    if (row) this.bus.publish({ type: "chat-changed", channelId: row.target_id });
  }

  /** The message a card came from, to tell its thread how the card moves. */
  messageOfTask(taskId: string): { id: string; projectId: string; channel: string } | undefined {
    // Igrek's answer that made a card names it too; the card's message is the one not in a thread.
    const rows = this.db
      .query("SELECT id, project_id, target_id, parent_id FROM comments WHERE task_id = ?")
      .all(taskId) as { id: string; project_id: string; target_id: string; parent_id: string | null }[];
    const row = rows.find((r) => !r.parent_id) ?? rows[0];
    return row ? { id: row.parent_id ?? row.id, projectId: row.project_id, channel: row.target_id } : undefined;
  }

  /** A note in the thread of the message a card came from, when the card moves. */
  noteTask(taskId: string, status: TaskStatus): void {
    const source = this.messageOfTask(taskId);
    if (source)
      this.post({
        projectId: source.projectId,
        channel: source.channel,
        parentId: source.id,
        text: taskEvent(status),
        mentions: [],
        bot: true,
      });
  }

  /**
   * The team's timeline (plan.md, 27 Oct 2026): sessions, commits, cards and messages of the shared
   * projects in one list, newest first, so everyone sees who works on what without asking.
   */
  timeline(projects: { id: string; name: string }[], since: number): TeamTimelineItem[] {
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const ids = JSON.stringify(projects.map((p) => p.id));
    const sessions = this.db
      .query(
        `SELECT id, project_id, COALESCE(title, first_prompt, '') AS title, author_name, author_id, updated_at FROM sessions
         WHERE project_id IN (SELECT value FROM json_each(?)) AND private = 0 AND updated_at > ? ORDER BY updated_at DESC LIMIT 80`,
      )
      .all(ids, since) as {
      id: string;
      project_id: string;
      title: string;
      author_name: string | null;
      author_id: string | null;
      updated_at: number;
    }[];
    const commits = this.db
      .query(
        `SELECT project_id, hash, author, subject, at FROM commits
         WHERE project_id IN (SELECT value FROM json_each(?)) AND at > ? ORDER BY at DESC LIMIT 80`,
      )
      .all(ids, since) as { project_id: string; hash: string; author: string; subject: string; at: number }[];
    const tasks = this.db
      .query(
        `SELECT id, project_id, title, status, assignee_name, author_name, updated_at FROM board_tasks
         WHERE project_id IN (SELECT value FROM json_each(?)) AND deleted = 0 AND updated_at > ? ORDER BY updated_at DESC LIMIT 80`,
      )
      .all(ids, since) as {
      id: string;
      project_id: string;
      title: string;
      status: TaskStatus;
      assignee_name: string | null;
      author_name: string | null;
      updated_at: number;
    }[];
    const messages = this.db
      .query(
        `SELECT id, project_id, target_id, author_name, author_id, text, at FROM comments
         WHERE target_kind = 'channel' AND parent_id IS NULL AND bot = 0
           AND project_id IN (SELECT value FROM json_each(?)) AND at > ? ORDER BY at DESC LIMIT 80`,
      )
      .all(ids, since) as {
      id: string;
      project_id: string;
      target_id: string;
      author_name: string | null;
      author_id: string | null;
      text: string;
      at: number;
    }[];
    const project = (id: string) => ({ projectId: id, project: names.get(id) ?? "" });
    const items: TeamTimelineItem[] = [
      ...sessions.map((r) => ({
        id: `s-${r.id}`,
        kind: "session" as const,
        ...project(r.project_id),
        who: r.author_id ? (r.author_name ?? "") : "",
        mine: !r.author_id,
        title: r.title.slice(0, 160),
        at: r.updated_at,
      })),
      ...commits.map((r) => ({
        id: `g-${r.project_id}-${r.hash}`,
        kind: "commit" as const,
        ...project(r.project_id),
        who: r.author,
        mine: false,
        title: r.subject.slice(0, 160),
        at: r.at,
      })),
      ...tasks.map((r) => ({
        id: `t-${r.id}`,
        kind: "task" as const,
        ...project(r.project_id),
        who: r.assignee_name ?? r.author_name ?? "",
        // A card made here and given to nobody yet: mine.
        mine: !r.assignee_name && !r.author_name,
        title: r.title,
        at: r.updated_at,
        status: r.status,
      })),
      ...messages.map((r) => ({
        id: `m-${r.id}`,
        kind: "message" as const,
        ...project(r.project_id),
        who: r.author_id ? (r.author_name ?? "") : "",
        mine: !r.author_id,
        title: r.text.split("\n")[0]?.slice(0, 160) ?? "",
        at: r.at,
        channelId: r.target_id,
      })),
    ];
    return items.sort((a, b) => b.at - a.at).slice(0, 200);
  }

  /** Commits and AI sessions per person in the shared projects since a time, for the company's work view. */
  workSince(projectIds: string[], since: number): { who: string; commits: number; sessions: number }[] {
    const ids = JSON.stringify(projectIds);
    const commits = this.db
      .query(
        `SELECT author AS who, COUNT(*) AS n FROM commits
         WHERE project_id IN (SELECT value FROM json_each(?)) AND at > ? GROUP BY author`,
      )
      .all(ids, since) as { who: string; n: number }[];
    const sessions = this.db
      .query(
        `SELECT COALESCE(author_name, '') AS who, COUNT(*) AS n FROM sessions
         WHERE project_id IN (SELECT value FROM json_each(?)) AND private = 0 AND updated_at > ? GROUP BY author_name`,
      )
      .all(ids, since) as { who: string; n: number }[];
    const people = new Map<string, { who: string; commits: number; sessions: number }>();
    const row = (who: string) => {
      const found = people.get(who) ?? { who, commits: 0, sessions: 0 };
      people.set(who, found);
      return found;
    };
    for (const c of commits) row(c.who).commits += c.n;
    for (const s of sessions) row(s.who).sessions += s.n;
    return [...people.values()].sort((a, b) => b.commits + b.sessions - (a.commits + a.sessions));
  }

  // ---- team sync of channels (messages travel as comments) ------------------------------------

  unsentChannels(projectId: string): { id: string; name: string; topic: string; at: number }[] {
    return (
      this.db
        .query("SELECT id, name, topic, created_at FROM channels WHERE project_id = ? AND sent = 0")
        .all(projectId) as { id: string; name: string; topic: string; created_at: number }[]
    ).map((r) => ({ id: r.id, name: r.name, topic: r.topic, at: r.created_at }));
  }

  unsentReactions(projectId: string): { messageId: string; reaction: string; removed: boolean; at: number }[] {
    return (
      this.db
        .query(
          `SELECT r.comment_id, r.reaction, r.removed, r.at FROM chat_reactions r JOIN comments c ON c.id = r.comment_id
           WHERE r.member = '' AND r.sent = 0 AND c.project_id = ?`,
        )
        .all(projectId) as { comment_id: string; reaction: string; removed: number; at: number }[]
    ).map((r) => ({ messageId: r.comment_id, reaction: r.reaction, removed: r.removed === 1, at: r.at }));
  }

  /** Sent: a taken-back reaction is gone for good. Changed again while on its way: it goes again. */
  markReactionSent(messageId: string, reaction: string, at: number): void {
    this.db.transaction(() => {
      this.db
        .query(
          "DELETE FROM chat_reactions WHERE comment_id = ? AND member = '' AND reaction = ? AND at = ? AND removed = 1",
        )
        .run(messageId, reaction, at);
      this.db
        .query("UPDATE chat_reactions SET sent = 1 WHERE comment_id = ? AND member = '' AND reaction = ? AND at = ?")
        .run(messageId, reaction, at);
    })();
  }

  /** A teammate's reaction, given or taken back; one on a message that is not here is dropped. */
  applyReaction(value: Record<string, unknown>, author: { id: string; name: string }): void {
    const messageId = String(value.messageId ?? "");
    const reaction = String(value.reaction ?? "");
    if (!author.id || !(CHAT_REACTIONS as readonly string[]).includes(reaction)) return;
    this.db.transaction(() => {
      if (value.removed)
        this.db
          .query("DELETE FROM chat_reactions WHERE comment_id = ? AND member = ? AND reaction = ?")
          .run(messageId, author.id, reaction);
      else
        this.db
          .query(
            `INSERT INTO chat_reactions (comment_id, member, member_name, reaction, at, sent, removed)
             SELECT id, ?, ?, ?, ?, 1, 0 FROM comments WHERE id = ?
             ON CONFLICT(comment_id, member, reaction) DO UPDATE SET member_name = excluded.member_name, removed = 0`,
          )
          .run(author.id, author.name, reaction, Number(value.at ?? Date.now()), messageId);
    })();
    const row = this.db.query("SELECT target_id FROM comments WHERE id = ?").get(messageId) as {
      target_id: string;
    } | null;
    if (row) this.bus.publish({ type: "chat-changed", channelId: row.target_id });
  }

  markChannelSent(id: string): void {
    this.db.query("UPDATE channels SET sent = 1 WHERE id = ?").run(id);
  }

  /** A channel a teammate made: its id carries their project id, so it is rebuilt with ours. */
  applyRemote(projectId: string, value: Record<string, unknown>, author: string): void {
    const name = channelName(String(value.name ?? ""));
    if (!name) return;
    const id = channelId(projectId, name);
    this.db
      .query(
        "INSERT INTO channels (id, project_id, name, topic, author_name, created_at, sent) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET topic = excluded.topic",
      )
      .run(id, projectId, name, String(value.topic ?? "").slice(0, 200), author, Number(value.at ?? Date.now()));
    this.bus.publish({ type: "chat-changed", channelId: id });
  }
}
