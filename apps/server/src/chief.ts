import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatEvent, ChatInfo, FlowRun } from "@igrek/core";
import type { Hono } from "hono";
import type { ChatOp, Chats } from "./chats";

/**
 * The chief (after OpenAI's dots and xAI's Grok Bot): one chat the user talks to about everything.
 * It hands work to the projects as runs (each in its own copy; the user approves every hand-off and
 * every merge), keeps a notebook of what it should remember, and the runs report back to it. It runs
 * on this computer, in its own folder, so it works while Igrek is on, for free and with nothing sent
 * anywhere but the model the user already pays for. Telegram (telegram.ts) reaches it from a phone.
 */
const NOTES = "NOTES.md";
const STATE = "chief.json";

/** Claude Code reads CLAUDE.md in the chat's folder at every start; the notebook comes in with it. */
const CLAUDE_MD = `# The chief

You are the user's chief assistant in Igrek. You talk with them about all their projects and hand the
work to the projects instead of doing it here.

- igrek_projects lists their projects. igrek_delegate starts a run in one project's own copy, done by the
  persona that fits; the user approves each hand-off, and nothing reaches their branch without their OK.
- When a run finishes, Igrek writes its result into this chat. igrek_runs shows how the runs are going.
- For later or repeated work, and for work that should start when something happens (CI fails, an issue
  is opened, the site goes down, the app throws), use igrek_schedule; the user approves it.
- For how some software works inside, suggest a REA chat (Tools, Reverse engineering), only for software
  the user owns or may examine.
- Keep ${NOTES} up to date: the user's preferences, ongoing responsibilities, decisions, people. Short lines,
  newest first, no secrets (private details stay placeholders like [[private:name]]).
- Answer briefly, in the user's language.

@${NOTES}
`;

/** The general thread's key; a project's thread is keyed by the project's id. */
const GENERAL = "general";

interface State {
  /** Before threads there was one session. */
  sessionId?: string;
  /** Each thread's last Claude Code session, so it goes on after a restart. */
  sessions?: Record<string, string>;
}

/** A run's result as one line for the chief's chat: "runId|status|project|changed files". */
function runReport(run: FlowRun, projectName: string): string {
  return [run.id, run.status, projectName, String(run.changes?.length ?? 0)].join("|");
}

const REPORTED: FlowRun["status"][] = ["ready", "done", "failed", "needs_you", "stopped"];

interface Thread {
  chatId?: string;
  detach?: () => void;
}

/**
 * The chief's threads: a general one about everything, and one per project the user opens, so a long
 * talk about one project does not bury the others (asked for by the user). They share the notebook.
 */
export class Chief {
  private threads = new Map<string, Thread>();
  private reported = new Map<string, FlowRun["status"]>();
  /** Telegram listens here: everything that happens in the chief's threads, with the thread's key. */
  private listeners = new Set<(op: ChatOp, thread: string) => void>();

  constructor(
    readonly dir: string,
    private readonly chats: Chats,
    /** Starts a thread's chat (or continues its session); `projectId` for a project's thread. */
    private readonly startChat: (cwd: string, resume?: string, projectId?: string) => ChatInfo,
    private readonly projectName: (projectId: string) => string,
  ) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "CLAUDE.md"), CLAUDE_MD);
    if (!existsSync(join(dir, NOTES))) writeFileSync(join(dir, NOTES), "# What I remember\n\n");
  }

  private sessions(): Record<string, string> {
    try {
      const state = JSON.parse(readFileSync(join(this.dir, STATE), "utf8")) as State;
      return { ...(state.sessionId ? { [GENERAL]: state.sessionId } : {}), ...state.sessions };
    } catch {
      return {};
    }
  }

  private remember(thread: string, sessionId: string): void {
    const sessions = this.sessions();
    if (sessions[thread] === sessionId) return;
    writeFileSync(join(this.dir, STATE), JSON.stringify({ sessions: { ...sessions, [thread]: sessionId } }));
  }

  /** A thread's chat, started (or continued from its last session) when there is none running. */
  open(thread = GENERAL): ChatInfo {
    const state = this.threads.get(thread) ?? {};
    this.threads.set(thread, state);
    const live = state.chatId ? this.chats.get(state.chatId) : undefined;
    if (live && live.status !== "exited") return live;
    const info = this.startChat(
      this.dir,
      live?.sessionId ?? this.sessions()[thread],
      thread === GENERAL ? undefined : thread,
    );
    state.chatId = info.id;
    state.detach?.();
    state.detach = this.chats.attach(info.id, (op) => {
      if (op.op === "info" && op.info.sessionId) this.remember(thread, op.info.sessionId);
      for (const listener of this.listeners) listener(op, thread);
    })?.detach;
    return info;
  }

  /** The threads that have a talk (started now or before), general first. */
  list(): string[] {
    return [...new Set([GENERAL, ...Object.keys(this.sessions()), ...this.threads.keys()])];
  }

  send(text: string, thread = GENERAL): void {
    this.chats.send(this.open(thread).id, text);
  }

  /** A thread's events now, for a reader that joins late (Telegram finding the last answer). */
  events(thread = GENERAL): ChatEvent[] {
    const chatId = this.threads.get(thread)?.chatId;
    return chatId ? (this.chats.snapshot(chatId)?.events ?? []) : [];
  }

  answer(requestId: string, decision: "allow" | "deny", thread = GENERAL): void {
    const chatId = this.threads.get(thread)?.chatId;
    if (chatId) this.chats.answer(chatId, requestId, decision);
  }

  listen(listener: (op: ChatOp, thread: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A run the chief started changed: its result goes to the project's thread (or the general one), once per state. */
  onRun(run: FlowRun): void {
    if (run.by !== "chief" || !REPORTED.includes(run.status) || this.reported.get(run.id) === run.status) return;
    this.reported.set(run.id, run.status);
    const thread = this.list().includes(run.projectId) ? run.projectId : GENERAL;
    this.chats.addEvent(this.open(thread).id, {
      kind: "notice",
      id: `run-${run.id}-${run.status}`,
      at: Date.now(),
      tone: run.status === "failed" ? "danger" : "neutral",
      code: "run",
      text: runReport(run, this.projectName(run.projectId)),
    });
  }

  /** "" for the general thread, the project's name for a project's thread. */
  threadName(thread: string): string {
    return thread === GENERAL ? "" : this.projectName(thread);
  }

  notes(): string {
    return readFileSync(join(this.dir, NOTES), "utf8");
  }

  setNotes(text: string): void {
    writeFileSync(join(this.dir, NOTES), text.slice(0, 50_000));
  }
}

export function registerChiefRoutes(
  app: Hono,
  chief: Chief,
  /** A run in a project's own copy, started for the chief (a name, folder or id names the project). */
  delegate: (project: string, request: string, persona?: string) => FlowRun,
): void {
  // From the chief's MCP tool, after the user allowed the step in the chat: agents may start a run,
  // which works in its own copy and merges nothing without the user.
  app.post("/api/agent/delegate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { project?: unknown; request?: unknown; persona?: unknown };
    try {
      const run = delegate(
        String(body.project ?? ""),
        String(body.request ?? ""),
        typeof body.persona === "string" && body.persona ? body.persona : undefined,
      );
      return c.json({ id: run.id, status: run.status, link: `/runs/${run.id}` });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  // A thread: the general one, or a project's (its id).
  app.post("/api/chief", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { thread?: unknown };
    try {
      return c.json(chief.open(typeof body.thread === "string" && body.thread ? body.thread : GENERAL));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.get("/api/chief/threads", (c) => c.json(chief.list()));
  app.get("/api/chief/notes", (c) => c.json({ text: chief.notes() }));
  app.put("/api/chief/notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    chief.setNotes(String(body.text ?? ""));
    return c.json({ ok: true });
  });
}
