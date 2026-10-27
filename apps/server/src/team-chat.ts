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
};

const SELECT_MESSAGE = `SELECT c.id, c.target_id, c.parent_id, c.author_id, c.author_name, c.text, c.at, c.bot, c.task_id,
  (SELECT COUNT(*) FROM comments r WHERE r.parent_id = c.id) AS replies,
  (SELECT MAX(r.at) FROM comments r WHERE r.parent_id = c.id) AS last_reply,
  t.title AS task_title, t.status AS task_status, t.assignee_name AS task_assignee
  FROM comments c LEFT JOIN board_tasks t ON t.id = c.task_id AND t.deleted = 0`;

type Reactions = ChatMessage["reactions"];

function toMessage(r: MessageRow, reactions: Reactions = []): ChatMessage {
  return {
    id: r.id,
    channelId: r.target_id,
    ...(r.parent_id ? { parentId: r.parent_id } : {}),
    ...(r.author_name ? { author: r.author_name } : {}),
    ...(r.author_id ? { authorId: r.author_id } : {}),
    mine: r.author_id === null,
    bot: r.bot === 1,
    text: r.text,
    at: r.at,
    replies: r.replies,
    reactions,
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
            `SELECT target_id, MAX(at) AS last, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread, COUNT(*) AS n
             FROM comments WHERE target_kind = 'channel' GROUP BY target_id`,
          )
          .all() as { target_id: string; last: number; unread: number; n: number }[]
      ).map((r) => [r.target_id, r]),
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
          messages: s?.n ?? 0,
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
      return this.withReactions(
        this.db.query(`${SELECT_MESSAGE} WHERE c.parent_id = ? ORDER BY c.at`).all(thread) as MessageRow[],
      );
    const rows = this.db
      .query(
        `${SELECT_MESSAGE} WHERE c.target_kind = 'channel' AND c.target_id = ? AND c.parent_id IS NULL ORDER BY c.at DESC LIMIT 200`,
      )
      .all(channel) as MessageRow[];
    return this.withReactions(rows.reverse());
  }

  message(id: string): ChatMessage | undefined {
    const row = this.db.query(`${SELECT_MESSAGE} WHERE c.id = ?`).get(id) as MessageRow | null;
    return row ? this.withReactions([row])[0] : undefined;
  }

  /** The reactions under each message, in one query: grouped by kind, with who gave them. */
  private withReactions(rows: MessageRow[]): ChatMessage[] {
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
    return rows.map((r) => toMessage(r, given.get(r.id)));
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
  }): string {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read, parent_id, bot, task_id)
         VALUES (?, ?, 'channel', ?, NULL, ?, ?, ?, ?, 1, ?, ?, ?)`,
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
      );
    this.bus.publish({ type: "chat-changed", channelId: args.channel });
    return id;
  }

  /** Igrek is writing an answer in this channel: the page shows it, nothing is stored. */
  writing(channel: string, on: boolean): void {
    this.bus.publish({ type: "chat-changed", channelId: channel, writing: on });
  }

  /** A message that never goes to teammates (marked as already sent). */
  keepHere(id: string): void {
    this.db.query("UPDATE comments SET sent = 1 WHERE id = ?").run(id);
  }

  markRead(channel: string): void {
    this.db
      .query("UPDATE comments SET read = 1 WHERE target_kind = 'channel' AND target_id = ? AND read = 0")
      .run(channel);
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
