import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import {
  type ChatEvent,
  type ChatInfo,
  type ChatMode,
  type ChatPill,
  type QueuedMessage,
  type RateLimitInfo,
  type RecentChat,
  RICH_BLOCKS_HINT,
  STEP_CUT,
} from "@igrek/core";
import type { Bus, StopRegistry } from "./bus";
import { cleanEnv } from "./env";
import { guardFor, readsOutside, SHIP_ASK_RULES } from "./guards";
import { readLines } from "./jsonlines";
import { LIMIT_REACHED } from "./localmodel";
import { sandboxAvailable } from "./system";
import { type ProjectExtensions, untrustedArgs } from "./trust";
import type { Worktree } from "./worktrees";

/** UI modes → Claude Code permission modes. */
const PERMISSION_MODE: Record<ChatMode, string> = {
  normal: "manual",
  acceptEdits: "acceptEdits",
  auto: "auto",
  plan: "plan",
};

const MAX_EVENTS = 2000;
const MAX_RESULT = 8000;

type Json = Record<string, unknown>;

interface Chat {
  info: ChatInfo;
  events: ChatEvent[];
  index: Map<string, number>;
  /** Counts every change sent to listeners, so a client can tell an old op from a new one. */
  seq: number;
  listeners: Set<(op: ChatOp) => void>;
  write: (message: unknown) => void;
  kill: () => void;
  /** Tools the user said "always allow" for in this chat. */
  alwaysAllow: Set<string>;
  /** The chat has read content from outside (web), so its requests get a closer look. */
  tainted?: boolean;
  /** Streaming state: which assistant message/block deltas belong to. */
  streaming?: { messageId: string; blocks: Map<number, string> };
  /** Messages waiting for the current turn to end, images included. */
  queue: { id: string; text: string; images: Image[] }[];
  /** The last turn ended while nobody had the chat open. */
  unseen?: boolean;
  /** The latest steps as tool + input, to notice the AI going round in circles. */
  recentSteps: string[];
  /** Steps already reported as a loop, so each is said once. */
  loopsSaid: Set<string>;
  /** Waits for the usage limit to reset, then sends the user's "go on". */
  resumeTimer?: ReturnType<typeof setTimeout>;
}

type Image = { mediaType: string; data: string };

/** What to do with a message written while the AI is still working. */
export type SendHow = "queue" | "steer";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/** Files the AI wrote since the last user message. */
export function editedThisTurn(events: ChatEvent[]): string[] {
  const files = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event || event.kind === "user") break;
    if (event.kind !== "tool" || event.status !== "done" || !WRITE_TOOLS.has(event.name)) continue;
    const input = (event.input ?? {}) as { file_path?: unknown; notebook_path?: unknown };
    const file = input.file_path ?? input.notebook_path;
    if (typeof file === "string") files.add(file);
  }
  return [...files];
}

export type ChatOp = { op: "upsert"; seq: number; event: ChatEvent } | { op: "info"; seq: number; info: ChatInfo };

export interface ChatStart {
  projectId: string;
  cwd: string;
  title?: string;
  model?: string;
  mode?: ChatMode;
  resume?: string;
  /** Account the chat runs as (its folder goes in env). */
  accountId?: string;
  env?: Record<string, string>;
  worktree?: Worktree;
  /** Igrek's own MCP server for every chat (memory, search, library, lessons, schedule proposals). */
  igrekMcp?: { config: string; allow: string[] };
  /** The OpenUI instructions, when the user turned on rich answers; otherwise the JSON blocks hint. */
  richUi?: string;
  /** The project's own extensions to leave out, because the user has not trusted them yet. */
  untrusted?: ProjectExtensions;
  /** Run as a persona (plan.md 6.3): its prompt, its tools, its turn limit. */
  persona?: {
    id: string;
    name?: string;
    tools: "read" | "edit";
    systemPrompt: string;
    /** --tools list; undefined keeps Claude Code's normal set. */
    toolList?: string[];
    maxTurns: number;
    /** Igrek's MCP server (library search) and its tools that need no prompt. */
    mcpConfig?: string;
    allowTools?: string[];
  };
}

/**
 * The narrowest rule that covers a step, for "always allow in this project": the tool's name, or
 * for a shell command its first two words ("Bash(bun test)"). A command that chains or redirects
 * gets no rule, so "bun test && rm -rf ~" is never covered by "Bash(bun test)".
 */
export function ruleFor(toolName: string, input: unknown): string | undefined {
  // A question for the user is never answered by a rule.
  if (ASK_TOOLS.has(toolName)) return undefined;
  if (toolName !== "Bash") return toolName;
  const command = String((input as Json | undefined)?.command ?? "").trim();
  if (!command || /[;&|<>`$()\n\\]/.test(command)) return undefined;
  const words = command.split(/\s+/).slice(0, 2).join(" ");
  return `Bash(${words})`;
}

/** Does a saved rule cover this step? A Bash rule covers commands that start with its words. */
export function ruleCovers(rule: string, toolName: string, input: unknown): boolean {
  const own = ruleFor(toolName, input);
  if (!own) return false;
  if (rule === own) return true;
  const m = rule.match(/^Bash\((.+)\)$/);
  const command = String((input as Json | undefined)?.command ?? "").trim();
  return !!m?.[1] && toolName === "Bash" && (command === m[1] || command.startsWith(`${m[1]} `));
}

/** The persona's prompt (if any) and how answers may draw: OpenUI when rich answers are on, JSON blocks otherwise. */
function systemPrompt(options: Pick<ChatStart, "persona" | "richUi">): string {
  const drawing = options.richUi ?? RICH_BLOCKS_HINT;
  return options.persona ? `${options.persona.systemPrompt}\n\n${drawing}` : drawing;
}

/** What the chat shows about the project's extensions it left out. */
function untrustedInfo(ext: ProjectExtensions | undefined): Pick<ChatInfo, "untrusted"> {
  return ext
    ? { untrusted: { hooks: ext.hooks, mcpServers: ext.mcpServers, skills: ext.skills, fingerprint: ext.fingerprint } }
    : {};
}

/** Tools that ask the user something: they wait for an answer, never for an approval. */
const ASK_TOOLS = new Set(["AskUserQuestion"]);

/** Window size from Claude Code when it says, otherwise from the model's name and what was used. */
function windowFor(model: string | undefined, tokens: number): number {
  return model?.includes("[1m]") || tokens > 200_000 ? 1_000_000 : 200_000;
}

function pillOf(chat: Chat): ChatPill | undefined {
  if (chat.info.status === "exited") return undefined;
  const pending = chat.events.filter((e) => e.kind === "permission" && e.status === "pending");
  if (pending.some((e) => e.kind === "permission" && e.toolName !== "ExitPlanMode" && !ASK_TOOLS.has(e.toolName)))
    return "approval";
  if (pending.some((e) => e.kind === "permission" && ASK_TOOLS.has(e.toolName))) return "question";
  if (chat.info.status === "idle") {
    let i = chat.events.length - 1;
    while (i >= 0 && chat.events[i]?.kind !== "text" && chat.events[i]?.kind !== "user") i--;
    const last = chat.events[i];
    if (last?.kind === "text" && /\?\s*$/.test(last.text.replace(/[*_`)\]]+\s*$/, ""))) return "question";
  }
  if (chat.info.limit && !chat.info.limit.resumeAt) return "limit";
  if (chat.info.status === "working") return "working";
  if (pending.length) return "plan";
  if (chat.unseen) return "done";
  return undefined;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Json[]).map((part) => (typeof part.text === "string" ? part.text : "")).join("\n");
  }
  return "";
}

/**
 * Chat view over Claude Code (plan.md 2.2): one long-lived `claude -p` process per
 * chat speaking stream-json, with permission prompts answered from the UI.
 * The session is saved like any other, so it shows up in Igrek's history.
 */
export class Chats {
  /** How long after the limit resets a chat goes on by itself (the reset time is approximate). */
  static resumeMargin = 60_000;
  private chats = new Map<string, Chat>();
  /** Called whenever Claude reports limit usage (wired to the Limits page). */
  onRateLimit: (accountId: string | undefined, info: RateLimitInfo) => void = () => undefined;
  /** A chat started in a folder (the gate takes its baseline there). */
  onStart: (cwd: string) => void = () => undefined;
  /** A turn finished; `edited` are the files it wrote. */
  onTurnEnd: (id: string, cwd: string, edited: string[]) => void = () => undefined;
  /** Steps the user always allows in a project (plan.md 16.1); wired to the database. */
  projectRules: (projectId: string) => string[] = () => [];
  addProjectRule: (projectId: string, rule: string) => void = () => undefined;
  /** A chat learned its saved session id (links a persona chat to its session). */
  onSession: (info: ChatInfo) => void = () => undefined;
  /** A persona chat finished a turn: its notebook entries are recorded; returns what was kept. */
  onPersonaTurn: (info: ChatInfo, text: string) => { saved: number; rejected: number } = () => ({
    saved: 0,
    rejected: 0,
  });

  constructor(
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
    /** Path to the claude binary; injectable so tests never call the real one. */
    private readonly claudeBin: () => string | null = () => Bun.which("claude"),
    /** Snapshot of the code before each AI turn; returns the checkpoint id. */
    private readonly checkpoint: (cwd: string, label: string) => string | undefined = () => undefined,
  ) {}

  list(): ChatInfo[] {
    return [...this.chats.values()].map((c) => this.view(c)).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): ChatInfo | undefined {
    const chat = this.chats.get(id);
    return chat ? this.view(chat) : undefined;
  }

  start(options: ChatStart): ChatInfo {
    if (!existsSync(options.cwd)) throw new Error("Project folder not found");
    const claude = this.claudeBin();
    if (!claude) throw new Error("Claude Code is not installed on this computer");
    const id = crypto.randomUUID().slice(0, 8);
    const mode = options.mode ?? "normal";
    const sandboxed = mode === "auto" && sandboxAvailable();
    const args = [
      claude,
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-prompt-tool",
      "stdio",
      "--permission-mode",
      PERMISSION_MODE[mode],
      ...(options.untrusted ? untrustedArgs(options.untrusted) : []),
      // Shipping work (push, merge, publish, deploy) always asks, whatever the mode.
      // Auto mode also gets Claude Code's sandbox when this computer has what it needs.
      "--settings",
      JSON.stringify({
        permissions: { ask: SHIP_ASK_RULES },
        ...(sandboxed ? { sandbox: { enabled: true, autoAllowBashIfSandboxed: false } } : {}),
      }),
      ...(options.model ? ["--model", options.model] : []),
      ...(options.resume ? ["--resume", options.resume] : []),
      // Every chat may answer with the app's charts and stat tiles; a persona adds its own prompt.
      "--append-system-prompt",
      systemPrompt(options),
      ...(options.persona
        ? [
            "--max-turns",
            String(options.persona.maxTurns),
            // A read-only persona gets only the reading tools and no MCP servers but Igrek's own.
            ...(options.persona.toolList ? ["--tools", options.persona.toolList.join(","), "--strict-mcp-config"] : []),
            ...(options.persona.mcpConfig ? ["--mcp-config", options.persona.mcpConfig] : []),
            ...(options.persona.allowTools?.length ? ["--allowedTools", ...options.persona.allowTools] : []),
          ]
        : options.igrekMcp
          ? ["--mcp-config", options.igrekMcp.config, "--allowedTools", ...options.igrekMcp.allow]
          : []),
    ];
    const proc = Bun.spawn(args, {
      cwd: options.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: cleanEnv({ ...options.env, IGREK_CHAT: id }),
    });
    const chat: Chat = {
      info: {
        id,
        projectId: options.projectId,
        cwd: options.cwd,
        title: options.title ?? "Chat",
        model: options.model,
        mode,
        status: "idle",
        startedAt: Date.now(),
        sessionId: options.resume,
        accountId: options.accountId,
        worktree: options.worktree,
        sandboxed,
        ...untrustedInfo(options.untrusted),
        ...(options.persona
          ? { persona: { id: options.persona.id, name: options.persona.name, tools: options.persona.tools } }
          : {}),
      },
      events: [],
      index: new Map(),
      seq: 0,
      listeners: new Set(),
      write: (message) => {
        proc.stdin.write(`${JSON.stringify(message)}\n`);
        proc.stdin.flush();
      },
      kill: () => proc.kill(),
      alwaysAllow: new Set(),
      queue: [],
      recentSteps: [],
      loopsSaid: new Set(),
    };
    this.chats.set(id, chat);
    const unregister = this.stops.register(`chat-${id}`, { label: chat.info.title, stop: () => proc.kill() });

    void readLines(proc.stdout, (line) => this.handle(chat, line));
    void new Response(proc.stderr).text().then((err) => {
      if (err.trim())
        this.upsert(chat, {
          kind: "notice",
          id: `stderr-${Date.now()}`,
          at: Date.now(),
          text: clip(err.trim(), 2000),
          tone: "danger",
        });
    });
    void proc.exited.then((code) => {
      unregister();
      this.closeOpenSteps(chat, Date.now());
      chat.info.status = "exited";
      chat.info.exitCode = code;
      this.emitInfo(chat);
      this.changed();
    });
    this.changed();
    this.onStart(chat.info.cwd);
    return { ...chat.info };
  }

  attach(
    id: string,
    listener: (op: ChatOp) => void,
  ): { info: ChatInfo; events: ChatEvent[]; seq: number; detach: () => void } | undefined {
    const chat = this.chats.get(id);
    if (!chat) return undefined;
    chat.listeners.add(listener);
    // Opening the chat is seeing it.
    if (chat.unseen) {
      chat.unseen = false;
      this.changed();
    }
    return {
      info: this.view(chat),
      events: [...chat.events],
      seq: chat.seq,
      detach: () => chat.listeners.delete(listener),
    };
  }

  /** The whole chat as it is now, to restart a client that fell behind. */
  snapshot(id: string): { info: ChatInfo; events: ChatEvent[]; seq: number } | undefined {
    const chat = this.chats.get(id);
    return chat && { info: this.view(chat), events: [...chat.events], seq: chat.seq };
  }

  /**
   * A message from the user. While the AI is working it waits in the queue and goes out when the
   * turn ends; "steer" stops the turn and sends it right away instead.
   */
  send(id: string, text: string, images: Image[] = [], how: SendHow = "queue"): void {
    const chat = this.chats.get(id);
    if (!chat || chat.info.status === "exited") throw new Error("This chat has ended");
    if (!text && images.length === 0) return;
    if (chat.info.status === "working" || chat.info.status === "waiting") {
      const item = { id: `q-${crypto.randomUUID().slice(0, 8)}`, text, images };
      if (how === "steer") {
        chat.queue.unshift(item);
        this.interrupt(id);
      } else chat.queue.push(item);
      this.syncQueue(chat);
      return;
    }
    this.deliver(chat, text, images);
  }

  /** Takes a message out of the queue. */
  unqueue(id: string, queuedId: string): void {
    const chat = this.chats.get(id);
    if (!chat) return;
    chat.queue = chat.queue.filter((item) => item.id !== queuedId);
    this.syncQueue(chat);
  }

  /** Sends one queued message now: right away when idle, by stopping the turn when not. */
  sendQueued(id: string, queuedId: string): void {
    const chat = this.chats.get(id);
    const item = chat?.queue.find((q) => q.id === queuedId);
    if (!chat || !item || chat.info.status === "exited") return;
    chat.queue = [item, ...chat.queue.filter((q) => q.id !== queuedId)];
    if (chat.info.status === "idle") this.next(chat);
    else {
      this.syncQueue(chat);
      this.interrupt(id);
    }
  }

  /** Messages kept from before a restart wait in the queue until the user sends them. */
  restoreQueue(id: string, items: QueuedMessage[]): void {
    const chat = this.chats.get(id);
    if (!chat || !items.length) return;
    chat.queue.push(...items.map((item) => ({ id: item.id, text: item.text, images: [] })));
    this.syncQueue(chat);
  }

  private next(chat: Chat): void {
    const item = chat.queue.shift();
    this.syncQueue(chat);
    if (item) this.deliver(chat, item.text, item.images);
  }

  private syncQueue(chat: Chat): void {
    chat.info.queued = chat.queue.length
      ? chat.queue.map((item) => ({ id: item.id, text: item.text, images: item.images.length }))
      : undefined;
    this.emitInfo(chat);
    this.changed();
  }

  private deliver(chat: Chat, text: string, images: Image[]): void {
    // A new turn starts: whatever stopped the last one is history.
    clearTimeout(chat.resumeTimer);
    chat.resumeTimer = undefined;
    chat.info.limit = undefined;
    const content: Json[] = [
      ...images.map((image) => ({
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.data },
      })),
      ...(text ? [{ type: "text", text }] : []),
    ];
    if (chat.info.title === "Chat" && text) chat.info.title = clip(text.replace(/\s+/g, " "), 60);
    const checkpointId = this.checkpoint(chat.info.cwd, clip(text.replace(/\s+/g, " "), 60) || "chat turn");
    if (checkpointId) {
      this.upsert(chat, {
        kind: "checkpoint",
        id: `cp-${Date.now()}`,
        at: Date.now(),
        checkpointId,
        projectId: chat.info.projectId,
      });
    }
    this.upsert(chat, { kind: "user", id: `u-${Date.now()}`, at: Date.now(), text, images: images.length });
    chat.write({ type: "user", message: { role: "user", content } });
    chat.info.status = "working";
    this.emitInfo(chat);
    this.changed();
  }

  /** Outside content came in: back to asking, and say why. */
  private taint(chat: Chat, now: number): void {
    chat.tainted = true;
    if (chat.info.mode === "auto" || chat.info.mode === "acceptEdits") this.setMode(chat.info.id, "normal");
    this.upsert(chat, { kind: "notice", id: `taint-${now}`, at: now, text: "", tone: "neutral", code: "external" });
  }

  /** Answers a permission prompt. "always" also allows this tool for the rest of the chat. */
  answer(
    id: string,
    requestId: string,
    decision: "allow" | "deny" | "always" | "project",
    message?: string,
    /** The user's answers to an AskUserQuestion card, by question text. */
    answers?: Record<string, string>,
  ): void {
    const chat = this.chats.get(id);
    const index = chat?.index.get(`perm-${requestId}`);
    if (!chat || index === undefined) return;
    const event = chat.events[index];
    if (event?.kind !== "permission" || event.status !== "pending") return;
    // "Always" never covers shipping or post-web requests: those are asked each time.
    if (decision === "always" && !event.guard && !ASK_TOOLS.has(event.toolName)) chat.alwaysAllow.add(event.toolName);
    if (decision === "project" && !event.guard && event.rule) this.addProjectRule(chat.info.projectId, event.rule);
    // Answers go back the way the Agent SDK expects them: inside the tool's input.
    const input =
      answers && ASK_TOOLS.has(event.toolName) ? { ...((event.input ?? {}) as Json), answers } : event.input;
    this.respond(chat, requestId, decision !== "deny", input, message);
    this.upsert(chat, { ...event, status: decision === "deny" ? "denied" : "allowed" });
    chat.info.status = "working";
    this.emitInfo(chat);
    this.changed();
  }

  interrupt(id: string): void {
    const chat = this.chats.get(id);
    if (!chat || chat.info.status === "exited") return;
    chat.write({ type: "control_request", request_id: crypto.randomUUID(), request: { subtype: "interrupt" } });
  }

  setMode(id: string, mode: ChatMode): void {
    const chat = this.chats.get(id);
    if (!chat || chat.info.status === "exited") return;
    chat.write({
      type: "control_request",
      request_id: crypto.randomUUID(),
      request: { subtype: "set_permission_mode", mode: PERMISSION_MODE[mode] },
    });
    chat.info.mode = mode;
    this.emitInfo(chat);
  }

  close(id: string): void {
    const chat = this.chats.get(id);
    if (!chat) return;
    if (chat.info.status === "exited") {
      this.chats.delete(id);
      this.changed();
    } else chat.kill();
  }

  stopAll(): void {
    for (const chat of this.chats.values()) {
      clearTimeout(chat.resumeTimer);
      chat.kill();
    }
  }

  /** Latest limit usage reported by Claude in any chat (feeds the Limits page). */
  lastRateLimit(): RateLimitInfo | undefined {
    return [...this.chats.values()]
      .map((c) => c.info.rateLimit)
      .filter(Boolean)
      .at(-1);
  }

  // ---- protocol ---------------------------------------------------------------

  private respond(chat: Chat, requestId: string, allow: boolean, input: unknown, message?: string): void {
    chat.write({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: requestId,
        response: allow
          ? { behavior: "allow", updatedInput: input }
          : { behavior: "deny", message: message || "The user declined this step." },
      },
    });
  }

  /** Folds one protocol message into the chat's event list. Exported for tests via the class. */
  handle(chat: Chat, line: string): void {
    let msg: Json;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const now = Date.now();
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          chat.info.sessionId = String(msg.session_id ?? chat.info.sessionId ?? "");
          if (typeof msg.model === "string") chat.info.model = msg.model;
          if (chat.info.sessionId) this.onSession({ ...chat.info });
          this.emitInfo(chat);
          this.changed();
        }
        return;
      }
      case "rate_limit_event": {
        const info = msg.rate_limit_info as Json | undefined;
        const windows = info?.unifiedWindows as Record<string, { utilization?: number; resetsAt?: number }> | undefined;
        if (windows) {
          chat.info.rateLimit = {
            fiveHour: windows.five_hour?.utilization,
            fiveHourResetsAt: windows.five_hour?.resetsAt ? windows.five_hour.resetsAt * 1000 : undefined,
            week: windows.seven_day?.utilization,
            weekResetsAt: windows.seven_day?.resetsAt ? windows.seven_day.resetsAt * 1000 : undefined,
            at: now,
          };
          this.emitInfo(chat);
          this.onRateLimit(chat.info.accountId, chat.info.rateLimit);
        }
        return;
      }
      case "stream_event": {
        this.handleDelta(chat, msg.event as Json | undefined, now);
        return;
      }
      case "assistant": {
        const message = msg.message as Json;
        const messageId = String(message.id ?? now);
        const blocks = Array.isArray(message.content) ? (message.content as Json[]) : [];
        // What the model saw for this answer: the whole conversation, partly from the prompt cache.
        const usage = message.usage as Record<string, number> | undefined;
        if (usage && typeof usage.input_tokens === "number") {
          const cacheRead = usage.cache_read_input_tokens ?? 0;
          const tokens = usage.input_tokens + cacheRead + (usage.cache_creation_input_tokens ?? 0);
          const window = chat.info.context?.window ?? windowFor(chat.info.model, tokens);
          chat.info.context = { tokens, window: Math.max(window, windowFor(undefined, tokens)), cacheRead, at: now };
          this.emitInfo(chat);
        }
        blocks.forEach((block, i) => {
          if (block.type === "text" && typeof block.text === "string") {
            const full = block.text;
            // Claude Code may send one assistant message per block, so `i` is not the stream index
            // (a thinking block before the text shifts it). Match the streamed block by its text.
            const streamed =
              chat.streaming?.messageId === messageId
                ? [...chat.streaming.blocks.values()].find((sid) => {
                    const at = chat.index.get(sid);
                    const prev = at !== undefined ? chat.events[at] : undefined;
                    return prev?.kind === "text" && !!prev.text && full.startsWith(prev.text.slice(0, 200));
                  })
                : undefined;
            const id = streamed ?? `t-${messageId}-${i}`;
            this.upsert(chat, { kind: "text", id, at: now, text: full });
          } else if (block.type === "tool_use") {
            if (!chat.tainted && readsOutside(String(block.name ?? ""))) this.taint(chat, now);
            this.upsert(chat, {
              kind: "tool",
              id: String(block.id),
              at: now,
              name: String(block.name ?? "tool"),
              input: block.input,
              status: "running",
            });
            this.watchLoop(chat, String(block.name ?? "tool"), block.input, now);
          }
        });
        return;
      }
      case "user": {
        const message = msg.message as Json;
        for (const part of Array.isArray(message.content) ? (message.content as Json[]) : []) {
          if (part.type !== "tool_result") continue;
          const index = chat.index.get(String(part.tool_use_id));
          const event = index !== undefined ? chat.events[index] : undefined;
          if (event?.kind === "tool") {
            this.upsert(chat, {
              ...event,
              status: part.is_error ? "error" : "done",
              result: clip(resultText(part.content), MAX_RESULT),
            });
          }
        }
        return;
      }
      case "control_request": {
        const request = msg.request as Json;
        if (request?.subtype !== "can_use_tool") return;
        const requestId = String(msg.request_id);
        const toolName = String(request.tool_name ?? "tool");
        const guard = guardFor(toolName, request.input, !!chat.tainted);
        const allowedHere = this.projectRules(chat.info.projectId).some((r) => ruleCovers(r, toolName, request.input));
        if ((chat.alwaysAllow.has(toolName) || allowedHere) && !guard && !ASK_TOOLS.has(toolName)) {
          this.respond(chat, requestId, true, request.input);
          return;
        }
        this.upsert(chat, {
          kind: "permission",
          id: `perm-${requestId}`,
          requestId,
          at: now,
          toolName,
          input: request.input,
          description: typeof request.description === "string" ? request.description : undefined,
          guard,
          rule: guard ? undefined : ruleFor(toolName, request.input),
          status: "pending",
        });
        chat.info.status = "waiting";
        this.emitInfo(chat);
        this.changed();
        return;
      }
      case "result": {
        chat.streaming = undefined;
        if (chat.info.persona) this.personaTurn(chat, now);
        this.upsert(chat, {
          kind: "result",
          id: `r-${now}`,
          at: now,
          durationMs: typeof msg.duration_ms === "number" ? msg.duration_ms : undefined,
          isError: msg.is_error === true || msg.subtype !== "success",
          text: typeof msg.result === "string" && msg.is_error ? msg.result : undefined,
        });
        this.closeOpenSteps(chat, now);
        this.noticeLimit(chat, msg);
        chat.info.status = "idle";
        // Claude Code says how large the window really is.
        const models = msg.modelUsage as Record<string, { contextWindow?: number }> | undefined;
        const reported = Math.max(0, ...Object.values(models ?? {}).map((m) => m.contextWindow ?? 0));
        if (reported && chat.info.context) chat.info.context = { ...chat.info.context, window: reported };
        // Someone watching the chat sees the answer arrive.
        chat.unseen = chat.listeners.size === 0;
        this.emitInfo(chat);
        this.changed();
        // The turn is over: what the user wrote meanwhile goes out now.
        if (chat.queue.length) this.next(chat);
        else this.onTurnEnd(chat.info.id, chat.info.cwd, editedThisTurn(chat.events));
        return;
      }
    }
  }

  /** Adds an event from outside the CLI's stream (the gate's check results). */
  addEvent(id: string, event: ChatEvent): void {
    const chat = this.chats.get(id);
    if (chat) this.upsert(chat, event);
  }

  /** The persona's words since the last user message go to its notebook; say what was kept. */
  private personaTurn(chat: Chat, now: number): void {
    let start = chat.events.length;
    while (start > 0 && chat.events[start - 1]?.kind !== "user") start--;
    const text = chat.events
      .slice(start)
      .map((e) => (e.kind === "text" ? e.text : ""))
      .join("\n");
    if (!text.includes("<notebook>")) return;
    const { saved, rejected } = this.onPersonaTurn({ ...chat.info }, text);
    if (saved)
      this.upsert(chat, {
        kind: "notice",
        id: `nb-${now}`,
        at: now,
        text: String(saved),
        tone: "neutral",
        code: "notebook",
      });
    if (rejected)
      this.upsert(chat, {
        kind: "notice",
        id: `nbr-${now}`,
        at: now,
        text: String(rejected),
        tone: "neutral",
        code: "notebookRejected",
      });
  }

  /** Live typing: text deltas grow one text event per content block. */
  private handleDelta(chat: Chat, event: Json | undefined, now: number): void {
    if (!event) return;
    if (event.type === "message_start") {
      const message = event.message as Json | undefined;
      chat.streaming = { messageId: String(message?.id ?? now), blocks: new Map() };
      return;
    }
    if (event.type !== "content_block_delta" || !chat.streaming) return;
    const delta = event.delta as Json | undefined;
    if (delta?.type !== "text_delta" || typeof delta.text !== "string") return;
    const index = Number(event.index ?? 0);
    const id = chat.streaming.blocks.get(index) ?? `t-${chat.streaming.messageId}-${index}`;
    chat.streaming.blocks.set(index, id);
    const existing = chat.index.get(id);
    const prev = existing !== undefined ? chat.events[existing] : undefined;
    this.upsert(chat, { kind: "text", id, at: now, text: (prev?.kind === "text" ? prev.text : "") + delta.text });
  }

  private upsert(chat: Chat, event: ChatEvent): void {
    const index = chat.index.get(event.id);
    if (index !== undefined) chat.events[index] = event;
    else {
      chat.index.set(event.id, chat.events.length);
      chat.events.push(event);
      if (chat.events.length > MAX_EVENTS) {
        chat.events.splice(0, chat.events.length - MAX_EVENTS);
        chat.index = new Map(chat.events.map((e, i) => [e.id, i]));
      }
    }
    chat.seq++;
    for (const listener of chat.listeners) listener({ op: "upsert", seq: chat.seq, event });
  }

  private emitInfo(chat: Chat): void {
    chat.seq++;
    for (const listener of chat.listeners) listener({ op: "info", seq: chat.seq, info: this.view(chat) });
  }

  /**
   * The same tool with the same input LOOP_REPEATS times among the last LOOP_WINDOW steps: the AI is
   * going round in circles (plan.md 16.3). Said once per step, as a notice in the chat.
   */
  private watchLoop(chat: Chat, tool: string, input: unknown, now: number): void {
    const step = `${tool} ${JSON.stringify(input ?? {})}`;
    chat.recentSteps = [...chat.recentSteps, step].slice(-LOOP_WINDOW);
    const repeats = chat.recentSteps.filter((s) => s === step).length;
    if (repeats < LOOP_REPEATS || chat.loopsSaid.has(step)) return;
    chat.loopsSaid.add(step);
    this.upsert(chat, { kind: "notice", id: `loop-${now}`, at: now, text: tool, tone: "danger", code: "loop" });
  }

  /**
   * The plan's usage limit ended the turn (plan.md 16.3): remember when it resets, from the
   * "|<epoch>" Claude Code adds to its message or else from the last limit reading.
   */
  private noticeLimit(chat: Chat, msg: Json): void {
    if (msg.is_error !== true && msg.subtype === "success") return;
    let text = typeof msg.result === "string" ? msg.result : "";
    const last = [...chat.events].reverse().find((e) => e.kind === "text" || e.kind === "user");
    if (last?.kind === "text") text += `\n${last.text}`;
    if (!LIMIT_REACHED.test(text)) return;
    const epoch = text.match(/\|(\d{10})\b/)?.[1];
    chat.info.limit = { resetsAt: epoch ? Number(epoch) * 1000 : chat.info.rateLimit?.fiveHourResetsAt };
  }

  /** Sends `text` a minute after the limit resets, if the chat is still waiting then. */
  resumeAtReset(id: string, text: string): void {
    const chat = this.chats.get(id);
    const resetsAt = chat?.info.limit?.resetsAt;
    if (!chat || !resetsAt || chat.info.status === "exited") return;
    clearTimeout(chat.resumeTimer);
    const at = Math.max(Date.now(), resetsAt + Chats.resumeMargin);
    chat.info.limit = { resetsAt, resumeAt: at };
    chat.resumeTimer = setTimeout(() => {
      chat.resumeTimer = undefined;
      if (chat.info.status !== "idle" || !chat.info.limit) return;
      this.deliver(chat, text.slice(0, 2000) || "Continue where you left off.", []);
    }, at - Date.now());
    this.emitInfo(chat);
    this.changed();
  }

  cancelResume(id: string): void {
    const chat = this.chats.get(id);
    if (!chat?.info.limit) return;
    clearTimeout(chat.resumeTimer);
    chat.resumeTimer = undefined;
    chat.info.limit = { resetsAt: chat.info.limit.resetsAt };
    this.emitInfo(chat);
    this.changed();
  }

  /** A turn that ended (or a process that stopped) leaves no step spinning forever: it was cut off. */
  private closeOpenSteps(chat: Chat, now: number): void {
    for (const event of chat.events)
      if (event.kind === "tool" && event.status === "running")
        this.upsert(chat, { ...event, status: "error", result: STEP_CUT, at: now });
  }

  private view(chat: Chat): ChatInfo {
    const pill = pillOf(chat);
    return { ...chat.info, ...(pill ? { pill } : {}) };
  }

  private changed(): void {
    this.bus.publish({ type: "chats", chats: this.list() });
  }
}

const KEEP_HISTORY = 200;
const LOOP_WINDOW = 10;
const LOOP_REPEATS = 3;

/**
 * Chats outlive the browser and Igrek itself (plan.md 16.5): every chat with a saved
 * session is written down, so any browser can continue it after a restart.
 */
export class ChatHistory {
  constructor(private readonly db: Database) {}

  record(chats: ChatInfo[], now = Date.now()): void {
    const upsert = this.db.query(
      `INSERT INTO chat_history (id, project_id, session_id, title, started_at, updated_at, queue)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, title = excluded.title,
         updated_at = excluded.updated_at, queue = excluded.queue`,
    );
    let wrote = false;
    for (const chat of chats) {
      if (!chat.sessionId) continue;
      // Images are not kept: only the text of a queued message survives a restart.
      const queue = (chat.queued ?? []).filter((q) => q.text).map((q) => ({ id: q.id, text: q.text, images: 0 }));
      upsert.run(chat.id, chat.projectId, chat.sessionId, chat.title, chat.startedAt, now, JSON.stringify(queue));
      wrote = true;
    }
    if (wrote)
      this.db
        .query(
          "DELETE FROM chat_history WHERE id NOT IN (SELECT id FROM chat_history ORDER BY updated_at DESC LIMIT ?)",
        )
        .run(KEEP_HISTORY);
  }

  /** Most recent first; chats still running are left out (they are in the live list). */
  recent(limit: number, live: Set<string> = new Set()): RecentChat[] {
    const rows = this.db
      .query(
        `SELECT h.*, p.name AS project_name FROM chat_history h LEFT JOIN projects p ON p.id = h.project_id
         ORDER BY h.updated_at DESC LIMIT ?`,
      )
      .all(limit + live.size) as HistoryRow[];
    return rows
      .filter((row) => !live.has(row.id))
      .slice(0, limit)
      .map(toRecent);
  }

  get(id: string): RecentChat | undefined {
    const row = this.db
      .query(
        `SELECT h.*, p.name AS project_name FROM chat_history h LEFT JOIN projects p ON p.id = h.project_id
         WHERE h.id = ?`,
      )
      .get(id) as HistoryRow | null;
    return row ? toRecent(row) : undefined;
  }

  /** The messages still queued in the last chat on this session, handed over once. */
  takeQueue(sessionId: string): QueuedMessage[] {
    const row = this.db
      .query("SELECT id, queue FROM chat_history WHERE session_id = ? AND queue != '[]' ORDER BY updated_at DESC")
      .get(sessionId) as { id: string; queue: string } | null;
    if (!row) return [];
    this.db.query("UPDATE chat_history SET queue = '[]' WHERE id = ?").run(row.id);
    return JSON.parse(row.queue) as QueuedMessage[];
  }

  forget(id: string): void {
    this.db.query("DELETE FROM chat_history WHERE id = ?").run(id);
  }
}

interface HistoryRow {
  id: string;
  project_id: string;
  project_name: string | null;
  session_id: string;
  title: string;
  started_at: number;
  updated_at: number;
}

function toRecent(row: HistoryRow): RecentChat {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? undefined,
    sessionId: row.session_id,
    title: row.title,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
  };
}
