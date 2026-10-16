import { existsSync } from "node:fs";
import type { ChatEvent, ChatInfo, ChatMode, RateLimitInfo } from "@godeye/core";
import type { Bus, StopRegistry } from "./bus";
import { cleanEnv } from "./env";

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
  listeners: Set<(op: ChatOp) => void>;
  write: (message: unknown) => void;
  kill: () => void;
  /** Tools the user said "always allow" for in this chat. */
  alwaysAllow: Set<string>;
  /** Streaming state: which assistant message/block deltas belong to. */
  streaming?: { messageId: string; blocks: Map<number, string> };
}

export type ChatOp = { op: "upsert"; event: ChatEvent } | { op: "info"; info: ChatInfo };

export interface ChatStart {
  projectId: string;
  cwd: string;
  title?: string;
  model?: string;
  mode?: ChatMode;
  resume?: string;
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
 * The session is saved like any other, so it shows up in God Eye's history.
 */
export class Chats {
  private chats = new Map<string, Chat>();

  constructor(
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
    /** Path to the claude binary; injectable so tests never call the real one. */
    private readonly claudeBin: () => string | null = () => Bun.which("claude"),
  ) {}

  list(): ChatInfo[] {
    return [...this.chats.values()].map((c) => ({ ...c.info })).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): ChatInfo | undefined {
    const chat = this.chats.get(id);
    return chat ? { ...chat.info } : undefined;
  }

  start(options: ChatStart): ChatInfo {
    if (!existsSync(options.cwd)) throw new Error("Project folder not found");
    const claude = this.claudeBin();
    if (!claude) throw new Error("Claude Code is not installed on this computer");
    const id = crypto.randomUUID().slice(0, 8);
    const mode = options.mode ?? "normal";
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
      ...(options.model ? ["--model", options.model] : []),
      ...(options.resume ? ["--resume", options.resume] : []),
    ];
    const proc = Bun.spawn(args, {
      cwd: options.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: cleanEnv({ GODEYE_CHAT: id }),
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
      },
      events: [],
      index: new Map(),
      listeners: new Set(),
      write: (message) => {
        proc.stdin.write(`${JSON.stringify(message)}\n`);
        proc.stdin.flush();
      },
      kill: () => proc.kill(),
      alwaysAllow: new Set(),
    };
    this.chats.set(id, chat);
    const unregister = this.stops.register(`chat-${id}`, { label: chat.info.title, stop: () => proc.kill() });

    void this.readLines(proc.stdout, (line) => this.handle(chat, line));
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
      chat.info.status = "exited";
      chat.info.exitCode = code;
      this.emitInfo(chat);
      this.changed();
    });
    this.changed();
    return { ...chat.info };
  }

  attach(
    id: string,
    listener: (op: ChatOp) => void,
  ): { info: ChatInfo; events: ChatEvent[]; detach: () => void } | undefined {
    const chat = this.chats.get(id);
    if (!chat) return undefined;
    chat.listeners.add(listener);
    return { info: { ...chat.info }, events: [...chat.events], detach: () => chat.listeners.delete(listener) };
  }

  send(id: string, text: string, images: { mediaType: string; data: string }[] = []): void {
    const chat = this.chats.get(id);
    if (!chat || chat.info.status === "exited") throw new Error("This chat has ended");
    const content: Json[] = [
      ...images.map((image) => ({
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.data },
      })),
      ...(text ? [{ type: "text", text }] : []),
    ];
    if (content.length === 0) return;
    if (chat.info.title === "Chat" && text) chat.info.title = clip(text.replace(/\s+/g, " "), 60);
    this.upsert(chat, { kind: "user", id: `u-${Date.now()}`, at: Date.now(), text, images: images.length });
    chat.write({ type: "user", message: { role: "user", content } });
    chat.info.status = "working";
    this.emitInfo(chat);
    this.changed();
  }

  /** Answers a permission prompt. "always" also allows this tool for the rest of the chat. */
  answer(id: string, requestId: string, decision: "allow" | "deny" | "always", message?: string): void {
    const chat = this.chats.get(id);
    const index = chat?.index.get(`perm-${requestId}`);
    if (!chat || index === undefined) return;
    const event = chat.events[index];
    if (event?.kind !== "permission" || event.status !== "pending") return;
    if (decision === "always") chat.alwaysAllow.add(event.toolName);
    this.respond(chat, requestId, decision !== "deny", event.input, message);
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
    for (const chat of this.chats.values()) chat.kill();
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

  private async readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) onLine(line);
        newline = buffer.indexOf("\n");
      }
    }
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
        blocks.forEach((block, i) => {
          if (block.type === "text" && typeof block.text === "string") {
            const id =
              chat.streaming?.messageId === messageId
                ? (chat.streaming.blocks.get(i) ?? `t-${messageId}-${i}`)
                : `t-${messageId}-${i}`;
            this.upsert(chat, { kind: "text", id, at: now, text: block.text });
          } else if (block.type === "tool_use") {
            this.upsert(chat, {
              kind: "tool",
              id: String(block.id),
              at: now,
              name: String(block.name ?? "tool"),
              input: block.input,
              status: "running",
            });
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
        if (chat.alwaysAllow.has(toolName)) {
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
          status: "pending",
        });
        chat.info.status = "waiting";
        this.emitInfo(chat);
        this.changed();
        return;
      }
      case "result": {
        chat.streaming = undefined;
        this.upsert(chat, {
          kind: "result",
          id: `r-${now}`,
          at: now,
          durationMs: typeof msg.duration_ms === "number" ? msg.duration_ms : undefined,
          isError: msg.is_error === true || msg.subtype !== "success",
          text: typeof msg.result === "string" && msg.is_error ? msg.result : undefined,
        });
        chat.info.status = "idle";
        this.emitInfo(chat);
        this.changed();
        return;
      }
    }
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
    for (const listener of chat.listeners) listener({ op: "upsert", event });
  }

  private emitInfo(chat: Chat): void {
    for (const listener of chat.listeners) listener({ op: "info", info: { ...chat.info } });
  }

  private changed(): void {
    this.bus.publish({ type: "chats", chats: this.list() });
  }
}
