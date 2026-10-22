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

interface State {
  sessionId?: string;
}

/** A run's result as one line for the chief's chat: "runId|status|project|changed files". */
function runReport(run: FlowRun, projectName: string): string {
  return [run.id, run.status, projectName, String(run.changes?.length ?? 0)].join("|");
}

const REPORTED: FlowRun["status"][] = ["ready", "done", "failed", "needs_you", "stopped"];

export class Chief {
  private chatId?: string;
  private reported = new Map<string, FlowRun["status"]>();
  /** Telegram listens here: everything that happens in the chief's chat. */
  private listeners = new Set<(op: ChatOp) => void>();
  private detach?: () => void;

  constructor(
    readonly dir: string,
    private readonly chats: Chats,
    /** Starts the chief's chat (or continues its session) with the account, MCP server and focus. */
    private readonly startChat: (cwd: string, resume?: string) => ChatInfo,
    private readonly projectName: (projectId: string) => string,
  ) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "CLAUDE.md"), CLAUDE_MD);
    if (!existsSync(join(dir, NOTES))) writeFileSync(join(dir, NOTES), "# What I remember\n\n");
  }

  private state(): State {
    try {
      return JSON.parse(readFileSync(join(this.dir, STATE), "utf8")) as State;
    } catch {
      return {};
    }
  }

  /** The chief's chat, started (or continued from its last session) when there is none running. */
  open(): ChatInfo {
    const live = this.chatId ? this.chats.get(this.chatId) : undefined;
    if (live && live.status !== "exited") return live;
    const info = this.startChat(this.dir, live?.sessionId ?? this.state().sessionId);
    this.chatId = info.id;
    this.detach?.();
    this.detach = this.chats.attach(info.id, (op) => {
      if (op.op === "info" && op.info.sessionId && op.info.sessionId !== this.state().sessionId)
        writeFileSync(join(this.dir, STATE), JSON.stringify({ sessionId: op.info.sessionId }));
      for (const listener of this.listeners) listener(op);
    })?.detach;
    return info;
  }

  send(text: string): void {
    this.chats.send(this.open().id, text);
  }

  /** The chat's events now, for a reader that joins late (Telegram finding the last answer). */
  events(): ChatEvent[] {
    return this.chatId ? (this.chats.snapshot(this.chatId)?.events ?? []) : [];
  }

  answer(requestId: string, decision: "allow" | "deny"): void {
    if (this.chatId) this.chats.answer(this.chatId, requestId, decision);
  }

  listen(listener: (op: ChatOp) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A run the chief started changed: its result goes into the chief's chat, once per state. */
  onRun(run: FlowRun): void {
    if (run.by !== "chief" || !REPORTED.includes(run.status) || this.reported.get(run.id) === run.status) return;
    this.reported.set(run.id, run.status);
    const chatId = this.open().id;
    this.chats.addEvent(chatId, {
      kind: "notice",
      id: `run-${run.id}-${run.status}`,
      at: Date.now(),
      tone: run.status === "failed" ? "danger" : "neutral",
      code: "run",
      text: runReport(run, this.projectName(run.projectId)),
    });
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
  app.post("/api/chief", (c) => {
    try {
      return c.json(chief.open());
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.get("/api/chief/notes", (c) => c.json({ text: chief.notes() }));
  app.put("/api/chief/notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    chief.setNotes(String(body.text ?? ""));
    return c.json({ ok: true });
  });
}
