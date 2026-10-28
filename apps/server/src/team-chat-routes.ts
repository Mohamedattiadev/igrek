import type { Database } from "bun:sqlite";
import { CHAT_REACTIONS, type ChatMessage, type SessionSummaryData } from "@igrek/core";
import { languages } from "@igrek/i18n";
import type { Hono } from "hono";
import type { Board } from "./board";
import { taskMark } from "./board-auto";
import type { Bots } from "./bots";
import type { StopRegistry } from "./bus";
import { ChatFiles, MAX_FILE } from "./chat-files";
import { cleanPreview, linkPreview } from "./link-preview";
import { runClaude } from "./summarizer";
import type { Sync } from "./sync/client";
import { asksIgrek, type Chat, channelId, taskEvent } from "./team-chat";

interface Deps {
  db: Database;
  chat: Chat;
  /** Team bots (bots.ts): "@john rewrite the payment module" is a job for John. */
  bots?: Bots;
  files: ChatFiles;
  board: Board;
  sync: Sync;
  projects: () => { id: string; name: string }[];
  language: () => string;
  runnerDir: string;
  stops: StopRegistry;
}

const languageName = (code: string) => languages.find((l) => l.code === code)?.english ?? code;
const fail = (err: unknown) => ({ error: (err as Error).message });

/** "TASK: @kerim: Fix the cart total" lines in Igrek's answer become cards. */
const TASK_LINE = /^TASK:\s*(?:@([\w.-]{2,32})\s*:\s*)?(.+)$/gim;

/** What Igrek knows when it answers in a channel: the talk so far, the project's decisions, recent work, open cards. */
function context(deps: Deps, projectId: string, channel: string, thread?: string): string {
  const talk = (thread ? deps.chat.messages(channel, thread) : deps.chat.messages(channel))
    .slice(-30)
    .map((m) => `${m.bot ? "Igrek" : (m.author ?? "me")}: ${m.text}`);
  const decisions = (
    deps.db
      .query(
        "SELECT text FROM memory_items WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 30",
      )
      .all(projectId) as { text: string }[]
  ).map((r) => `- ${r.text}`);
  const work = (
    deps.db
      .query("SELECT title, summary FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 10")
      .all(projectId) as { title: string | null; summary: string | null }[]
  ).map((r) => {
    const did = r.summary ? (JSON.parse(r.summary) as SessionSummaryData).texts.en?.did?.join("; ") : "";
    return `- ${r.title ?? "untitled"}${did ? `: ${did}` : ""}`;
  });
  const cards = deps.board
    .list(projectId)
    .filter((t) => t.status !== "done")
    .slice(0, 30)
    .map((t) => `- [${t.status}] ${t.title}${t.assignee ? ` (${t.assignee.name})` : ""}`);
  return [
    `Decisions and rules of the project:\n${decisions.join("\n") || "(none)"}`,
    `Recent work:\n${work.join("\n") || "(none)"}`,
    `Open cards on the board:\n${cards.join("\n") || "(none)"}`,
    `The ${thread ? "thread" : "channel"} so far:\n${talk.join("\n")}`,
  ].join("\n\n");
}

/** Cards from Igrek's "TASK:" lines, given to the teammate named; the answer is kept without those lines. */
function cardsFrom(deps: Deps, projectId: string, answer: string): { text: string; taskId?: string } {
  const members = deps.sync.memberList();
  let taskId: string | undefined;
  for (const m of answer.matchAll(TASK_LINE)) {
    const card = deps.board.add({ projectId, title: (m[2] ?? "").trim(), origin: "chat" });
    const who = members.find((p) => p.username.toLowerCase() === (m[1] ?? "").toLowerCase());
    if (who) deps.board.assign(card.id, { kind: "person", id: who.id, name: who.displayName || who.username });
    taskId ??= card.id;
  }
  return { text: answer.replace(TASK_LINE, "").trim(), ...(taskId ? { taskId } : {}) };
}

/**
 * Each bot a message calls gets it as a job, answered in that message's thread. One that cannot
 * start (no git in the project, a bot of another project) says why there, to the asker only.
 */
function giveToBots(deps: Deps, projectId: string, channel: string, message: ChatMessage): void {
  for (const bot of deps.bots?.mentioned(projectId, message.text) ?? []) {
    const request = message.text.replace(new RegExp(`(^|\\s)@${bot.handle}\\b`, "gi"), " ").trim();
    try {
      deps.bots?.start(bot.id, { projectId, request, channel, thread: message.parentId ?? message.id });
    } catch (err) {
      deps.chat.keepHere(
        deps.chat.post({
          projectId,
          channel,
          parentId: message.parentId ?? message.id,
          text: `igrek:error:${bot.name}: ${(err as Error).message.slice(0, 300)}`,
          mentions: [],
          bot: true,
        }),
      );
    }
  }
}

/** Igrek answers in the thread of the message that asked it, with the asker's own Claude. */
async function answer(deps: Deps, projectId: string, channel: string, asked: ChatMessage): Promise<void> {
  const thread = asked.parentId ?? asked.id;
  deps.chat.writing(channel, true);
  try {
    const project = deps.projects().find((p) => p.id === projectId)?.name ?? "";
    const reply = await runClaude(
      [
        `You are Igrek, an assistant in the team chat of the project "${project}". Someone wrote @ai to you.`,
        `Answer the last message that asks you, in ${languageName(deps.language())}. Be short and concrete, like a good teammate in Slack.`,
        "If you are asked to write something into the chat (a plan, a list, a summary, notes), write it in full.",
        "If work should become a card on the board, add one line per card at the end: TASK: @username: short title (leave out @username if nobody was named).",
        "Use only what is below; say so when you do not know.",
        "",
        context(deps, projectId, channel, asked.parentId ? thread : undefined),
      ].join("\n"),
      deps.runnerDir,
      deps.stops,
      "sonnet",
    );
    const { text, taskId } = cardsFrom(deps, projectId, reply);
    deps.chat.post({ projectId, channel, parentId: thread, text, mentions: [], bot: true, taskId });
  } catch (err) {
    // Only the one who asked needs to know Igrek could not answer; it stays on this computer.
    deps.chat.keepHere(
      deps.chat.post({
        projectId,
        channel,
        parentId: thread,
        text: `igrek:error:${(err as Error).message.slice(0, 300)}`,
        mentions: [],
        bot: true,
      }),
    );
  } finally {
    deps.chat.writing(channel, false);
    void deps.sync.flush();
  }
}

/** Files, pictures and voice messages in a channel (chat-files.ts). */
function registerFileRoutes(
  app: Hono,
  { chat, files, sync }: Deps,
  projectOf: (channel: string) => { id: string; name: string } | undefined,
): void {
  // The file itself is the body; its name, a line of text and a quoted message ride in the query.
  app.post("/api/chat/channels/:id/files", async (c) => {
    const channel = c.req.param("id");
    const project = projectOf(channel);
    if (!project) return c.json({ error: "Channel not found" }, 404);
    if (Number(c.req.header("content-length") ?? 0) > MAX_FILE)
      return c.json({ error: "Files up to 10 MB can be sent in the chat" }, 413);
    try {
      const attachment = files.save(
        new Uint8Array(await c.req.arrayBuffer()),
        c.req.query("name") ?? "file",
        c.req.header("content-type") ?? "",
      );
      const text = (c.req.query("text") ?? "").trim();
      const id = chat.post({
        projectId: project.id,
        channel,
        text,
        author: sync.identity().name,
        mentions: text ? await sync.mentionsIn(text) : [],
        quoteId: c.req.query("quote") || undefined,
        attachment,
      });
      void sync.flush();
      return c.json(chat.message(id));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // Pictures and voice messages open in the page; anything else is only ever a download, so a
  // file a teammate sent can never run as a page of this app.
  app.get("/api/chat/files/:hash", (c) => {
    const hash = c.req.param("hash");
    const bytes = files.read(hash);
    if (!bytes) return c.json({ error: "Not here (yet)" }, 404);
    const row = chat.attachmentOf(hash);
    const inline = !!row && ChatFiles.inline(row.type);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": inline && row ? row.type : "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row?.name ?? "file")}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });
}

/** Direct messages between me and one teammate (sync/direct.ts), sealed for our devices alone. */
function registerDirectRoutes(app: Hono, { sync }: Deps): void {
  const isMember = (peer: string) => sync.memberList().some((m) => m.id === peer && m.id !== sync.identity().id);
  app.get("/api/chat/direct", (c) => c.json(sync.direct.conversations()));
  // Listed before they are marked read, so the page knows where the "Unread messages" line goes.
  app.get("/api/chat/direct/:peer/messages", (c) => {
    const list = sync.direct.messages(c.req.param("peer"));
    sync.direct.markRead(c.req.param("peer"));
    return c.json(list);
  });
  app.post("/api/chat/direct/:peer/messages", async (c) => {
    const peer = c.req.param("peer");
    if (!isMember(peer)) return c.json({ error: "Not a teammate" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string; quoteId?: string };
    const text = (body.text ?? "").trim();
    if (!text) return c.json({ error: "Write something" }, 400);
    const id = sync.direct.post(peer, text, body.quoteId || undefined);
    void sync.flush();
    return c.json(sync.direct.messages(peer).find((m) => m.id === id));
  });
}

/** The team's timeline and the company's work view, across every shared project. */
function registerTeamViewRoutes(
  app: Hono,
  { chat, board, sync }: Deps,
  shared: () => { id: string; name: string }[],
): void {
  // The team's timeline of the last days (7 unless asked), across every shared project.
  app.get("/api/team/timeline", (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 7, 1), 60);
    return c.json(chat.timeline(shared(), Date.now() - days * 86_400_000));
  });

  // The company's work view: every card of the shared projects, and commits and sessions per person
  // this week ("" is me: my own sessions carry no author here).
  app.get("/api/team/work", (c) => {
    const projects = shared();
    const ids = projects.map((p) => p.id);
    return c.json({
      projects,
      tasks: board.listMany(ids),
      week: chat.workSince(ids, Date.now() - 7 * 86_400_000),
      me: sync.identity().name ?? "",
    });
  });
}

/** What the box being written in asks for (a pasted link's card, "typing..."), and muting a channel. */
function registerComposerRoutes(
  app: Hono,
  { chat, sync }: Deps,
  projectOf: (channel: string) => { id: string; name: string } | undefined,
): void {
  app.post("/api/chat/channels/:id/mute", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { on?: boolean };
    chat.setMuted(c.req.param("id"), !!body.on);
    return c.json({ ok: true });
  });

  // A link pasted in the composer: its card, fetched here only because the writer is about to send it.
  app.get("/api/chat/link-preview", async (c) => {
    const preview = await linkPreview(c.req.query("url") ?? "").catch(() => undefined);
    return preview ? c.json(preview) : c.json({ error: "No preview for this address" }, 404);
  });

  // A key pressed in the composer: teammates see "typing..." for a few seconds.
  app.post("/api/chat/channels/:id/typing", (c) => {
    const project = projectOf(c.req.param("id"));
    if (project) void sync.sendTyping(project.id, c.req.param("id"));
    return c.json({ ok: true });
  });
}

/**
 * What makes the team chat feel like WhatsApp (plan.md 19.9): pinned, starred and searched
 * messages, muting, "typing...", editing and deleting my own, pins, stars and forwarding.
 */
function registerWhatsAppRoutes(
  app: Hono,
  { chat, sync }: Deps,
  shared: () => { id: string; name: string }[],
  projectOf: (channel: string) => { id: string; name: string } | undefined,
): void {
  app.get("/api/chat/channels/:id/pinned", (c) => c.json(chat.pinned(c.req.param("id"))));
  app.get("/api/chat/channels/:id/search", (c) => c.json(chat.search(c.req.param("id"), c.req.query("q") ?? "")));
  app.get("/api/chat/starred", (c) => c.json(chat.starred(shared().map((p) => p.id))));

  // My own message, written again or deleted for everyone.
  app.patch("/api/chat/messages/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return c.json({ error: "Write something" }, 400);
    if (!chat.edit(c.req.param("id"), text)) return c.json({ error: "Only your own messages can be edited" }, 403);
    void sync.flush();
    return c.json(chat.message(c.req.param("id")));
  });

  app.delete("/api/chat/messages/:id", (c) => {
    if (!chat.remove(c.req.param("id"))) return c.json({ error: "Only your own messages can be deleted" }, 403);
    void sync.flush();
    return c.json(chat.message(c.req.param("id")));
  });

  app.post("/api/chat/messages/:id/pin", async (c) => {
    const message = chat.message(c.req.param("id"));
    if (!message || !projectOf(message.channelId)) return c.json({ error: "Message not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { on?: boolean };
    chat.pin(message.id, !!body.on);
    void sync.flush();
    return c.json(chat.message(message.id));
  });

  app.post("/api/chat/messages/:id/star", async (c) => {
    const message = chat.message(c.req.param("id"));
    if (!message) return c.json({ error: "Message not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { on?: boolean };
    chat.star(message.id, !!body.on);
    return c.json(chat.message(message.id));
  });

  // A message sent on to another channel, marked "Forwarded" there.
  app.post("/api/chat/messages/:id/forward", async (c) => {
    const message = chat.message(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { channel?: string };
    const project = projectOf(String(body.channel ?? ""));
    if (!message || message.deleted || !project) return c.json({ error: "Pick a channel" }, 400);
    const id = chat.post({
      projectId: project.id,
      channel: String(body.channel),
      text: message.text,
      author: sync.identity().name,
      mentions: [],
      forwarded: true,
    });
    void sync.flush();
    return c.json(chat.message(id));
  });
}

/** The team chat (team-chat.ts): channels, messages, threads, @ai, and messages that become cards. */
export function registerTeamChatRoutes(app: Hono, deps: Deps): void {
  const { chat, sync, board } = deps;
  const shared = () => {
    const ids = new Set(sync.sharedProjectIds());
    return deps.projects().filter((p) => ids.has(p.id));
  };
  const projectOf = (channel: string) => shared().find((p) => channel.startsWith(`${p.id}:`));
  registerWhatsAppRoutes(app, deps, shared, projectOf);
  registerComposerRoutes(app, deps, projectOf);
  registerTeamViewRoutes(app, deps, shared);
  registerDirectRoutes(app, deps);
  registerFileRoutes(app, deps, projectOf);

  app.get("/api/chat/channels", (c) => c.json(chat.channels(shared())));

  app.post("/api/chat/channels", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string; name?: string; topic?: string };
    if (!shared().some((p) => p.id === body.projectId)) return c.json({ error: "Share this project first" }, 400);
    try {
      const id = chat.createChannel(String(body.projectId), body.name ?? "", body.topic ?? "", sync.identity().name);
      void sync.flush();
      return c.json({ id });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // Listed before they are marked read, so the page knows where the "Unread messages" line goes.
  app.get("/api/chat/channels/:id/messages", (c) => {
    const channel = c.req.param("id");
    const thread = c.req.query("thread");
    const list = chat.messages(channel, thread || undefined);
    if (!thread) chat.markRead(channel);
    if (!thread) void sync.flush();
    return c.json(list);
  });

  app.post("/api/chat/channels/:id/messages", async (c) => {
    const channel = c.req.param("id");
    const project = projectOf(channel);
    if (!project) return c.json({ error: "Channel not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      parentId?: string;
      quoteId?: string;
      preview?: unknown;
    };
    const text = (body.text ?? "").trim();
    if (!text) return c.json({ error: "Write something" }, 400);
    const id = chat.post({
      projectId: project.id,
      channel,
      text,
      parentId: body.parentId || undefined,
      quoteId: body.quoteId || undefined,
      preview: cleanPreview(body.preview),
      author: sync.identity().name,
      mentions: await sync.mentionsIn(text),
    });
    void sync.flush();
    const posted = chat.message(id);
    if (posted && asksIgrek(text)) void answer(deps, project.id, channel, posted);
    if (posted) giveToBots(deps, project.id, channel, posted);
    return c.json(posted);
  });

  // A reaction under a message, given or taken back.
  app.post("/api/chat/messages/:id/react", async (c) => {
    const message = chat.message(c.req.param("id"));
    if (!message || !projectOf(message.channelId)) return c.json({ error: "Message not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { reaction?: string };
    const reaction = CHAT_REACTIONS.find((r) => r === body.reaction);
    if (!reaction) return c.json({ error: "Unknown reaction" }, 400);
    chat.react(message.id, reaction, sync.identity().name);
    void sync.flush();
    return c.json(chat.message(message.id));
  });

  // A message becomes a card, for the teammate it names (or the one picked).
  app.post("/api/chat/messages/:id/task", async (c) => {
    const message = chat.message(c.req.param("id"));
    const project = message ? projectOf(message.channelId) : undefined;
    if (!message || !project) return c.json({ error: "Message not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { assignee?: string; title?: string };
    const firstLine = message.text.split("\n")[0]?.replace(/@[\w.-]+\s*/g, "") ?? "";
    const card = board.add({
      projectId: project.id,
      title: (body.title || firstLine || message.text).slice(0, 200),
      description: message.text,
      origin: "chat",
    });
    const who = sync.memberList().find((m) => m.id === body.assignee);
    if (who) board.assign(card.id, { kind: "person", id: who.id, name: who.displayName || who.username });
    chat.linkTask(message.id, card.id);
    chat.post({
      projectId: project.id,
      channel: message.channelId,
      parentId: message.parentId ?? message.id,
      text: taskEvent("created"),
      mentions: who ? [who.id] : [],
      bot: true,
    });
    void sync.flush();
    return c.json(board.get(card.id));
  });

  // From a Claude session to the team: a message in a channel, and a card for someone if asked.
  app.post("/api/sessions/:id/to-chat", async (c) => {
    const session = deps.db.query("SELECT id, project_id, title FROM sessions WHERE id = ?").get(c.req.param("id")) as {
      id: string;
      project_id: string | null;
      title: string | null;
    } | null;
    const body = (await c.req.json().catch(() => ({}))) as {
      channel?: string;
      text?: string;
      assignee?: string;
      task?: boolean;
    };
    const channel = body.channel || (session?.project_id ? channelId(session.project_id, "general") : "");
    const project = projectOf(channel);
    const text = (body.text ?? "").trim();
    if (!session || !project || !text)
      return c.json({ error: "Pick a shared project's channel and write something" }, 400);
    const id = chat.post({
      projectId: project.id,
      channel,
      text,
      author: sync.identity().name,
      mentions: await sync.mentionsIn(text),
    });
    if (body.task) {
      const card = board.add({
        projectId: project.id,
        title:
          text
            .split("\n")[0]
            ?.replace(/@[\w.-]+\s*/g, "")
            .slice(0, 200) ||
          session.title ||
          "Task",
        description: `${text}\n\n${session.title ?? ""}`.trim(),
        origin: "chat",
      });
      const who = sync.memberList().find((m) => m.id === body.assignee);
      if (who) board.assign(card.id, { kind: "person", id: who.id, name: who.displayName || who.username });
      chat.linkTask(id, card.id);
    }
    void sync.flush();
    return c.json(chat.message(id));
  });

  // What to write to the team about a session: Igrek drafts it from the session's summary and last messages.
  app.post("/api/sessions/:id/chat-draft", async (c) => {
    const rows = deps.db
      .query("SELECT role, text FROM messages WHERE session_id = ? AND kind = 'text' ORDER BY ts DESC LIMIT 20")
      .all(c.req.param("id")) as { role: string; text: string }[];
    if (!rows.length) return c.json({ error: "Nothing in this session yet" }, 400);
    try {
      const draft = await runClaude(
        [
          `Write a short message to the team in ${languageName(deps.language())} about this coding session: what was done and what is left. Plain sentences, no headings, at most 6 lines.`,
          ...rows.reverse().map((r) => `${r.role}: ${r.text.slice(0, 1500)}`),
        ].join("\n"),
        deps.runnerDir,
        deps.stops,
        "haiku",
      );
      return c.json({ draft: draft.trim() });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // "Start" on a card: what its chat starts with, and the card's mark so the board can follow it.
  app.post("/api/board/:id/start", (c) => {
    const task = board.get(c.req.param("id"));
    if (!task) return c.json({ error: "Card not found" }, 404);
    const me = sync.identity();
    if (me.id && me.name && !task.claimedBy) board.claim(task.id, { id: me.id, name: me.name });
    void sync.flush();
    // The page words the first message in the user's language around this mark.
    return c.json({
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      mark: taskMark(task.id),
    });
  });
}
