import type { Database } from "bun:sqlite";
import type { ChatMessage, SessionSummaryData } from "@igrek/core";
import { languages } from "@igrek/i18n";
import type { Hono } from "hono";
import type { Board } from "./board";
import { taskMark } from "./board-auto";
import type { StopRegistry } from "./bus";
import { runClaude } from "./summarizer";
import type { Sync } from "./sync/client";
import { asksIgrek, type Chat, channelId, taskEvent } from "./team-chat";

interface Deps {
  db: Database;
  chat: Chat;
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

/** The team chat (team-chat.ts): channels, messages, threads, @ai, and messages that become cards. */
export function registerTeamChatRoutes(app: Hono, deps: Deps): void {
  const { chat, sync, board } = deps;
  const shared = () => {
    const ids = new Set(sync.sharedProjectIds());
    return deps.projects().filter((p) => ids.has(p.id));
  };
  const projectOf = (channel: string) => shared().find((p) => channel.startsWith(`${p.id}:`));

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

  app.get("/api/chat/channels/:id/messages", (c) => {
    const channel = c.req.param("id");
    const thread = c.req.query("thread");
    if (!thread) chat.markRead(channel);
    return c.json(chat.messages(channel, thread || undefined));
  });

  app.post("/api/chat/channels/:id/messages", async (c) => {
    const channel = c.req.param("id");
    const project = projectOf(channel);
    if (!project) return c.json({ error: "Channel not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { text?: string; parentId?: string };
    const text = (body.text ?? "").trim();
    if (!text) return c.json({ error: "Write something" }, 400);
    const id = chat.post({
      projectId: project.id,
      channel,
      text,
      parentId: body.parentId || undefined,
      author: sync.identity().name,
      mentions: await sync.mentionsIn(text),
    });
    void sync.flush();
    const posted = chat.message(id);
    if (posted && asksIgrek(text)) void answer(deps, project.id, channel, posted);
    return c.json(posted);
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
