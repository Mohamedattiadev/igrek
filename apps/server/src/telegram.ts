import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ChatEvent, hidePrivate, type TelegramStatus } from "@igrek/core";
import type { Hono } from "hono";
import type { ChatOp } from "./chats";
import type { Sealer } from "./seal";

/**
 * The chief from a phone, through a Telegram bot the user makes with @BotFather (free). Igrek only
 * calls out to Telegram (long polling); nothing on this computer is opened to the internet. The bot
 * talks to one chat: the one that sent "/start <code>" with the code shown in Igrek. Everything sent
 * to Telegram passes its servers, so private details and .env secrets stay placeholders there.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const API = "https://api.telegram.org";
const FILE = "telegram.json";
/** Telegram's longest message is 4096 characters. */
const MAX_TEXT = 3900;

interface Saved {
  /** The bot's token, sealed with Igrek's vault key. */
  token?: string;
  bot?: string;
  chatId?: number;
  pairCode?: string;
}

interface ChiefLike {
  send: (text: string) => void;
  answer: (requestId: string, decision: "allow" | "deny", thread?: string) => void;
  listen: (listener: (op: ChatOp, thread: string) => void) => () => void;
  events: (thread?: string) => ChatEvent[];
  /** A thread's name for the phone: "" for the general one, the project's name for a project's. */
  threadName: (thread: string) => string;
}

interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
}

/** The AI's words since the last user message: what a turn answered. */
export function lastAnswer(events: ChatEvent[]): string {
  const texts: string[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event || event.kind === "user") break;
    if (event.kind === "text") texts.unshift(event.text);
  }
  return texts.join("\n\n").trim();
}

export class Telegram {
  private saved: Saved;
  private token?: string;
  private offset = 0;
  private polling?: AbortController;
  private error?: string;
  /** Approvals waiting, by the short number the phone answers with. */
  private approvals = new Map<string, { requestId: string; thread: string }>();
  private sent = new Set<string>();
  private unlisten?: () => void;

  constructor(
    private readonly dataDir: string,
    private readonly sealer: Sealer,
    private readonly chief: ChiefLike,
    private readonly privateValues: () => { name: string; value: string }[],
    private readonly get: Fetch = fetch,
  ) {
    this.saved = existsSync(join(dataDir, FILE))
      ? (JSON.parse(readFileSync(join(dataDir, FILE), "utf8")) as Saved)
      : {};
  }

  private store(): void {
    writeFileSync(join(this.dataDir, FILE), JSON.stringify(this.saved), { mode: 0o600 });
  }

  status(): TelegramStatus {
    return {
      configured: Boolean(this.saved.token),
      ...(this.saved.bot ? { bot: this.saved.bot } : {}),
      paired: this.saved.chatId !== undefined,
      ...(this.saved.token && this.saved.chatId === undefined && this.saved.pairCode
        ? { pairCode: this.saved.pairCode }
        : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }

  private async call<T>(token: string, method: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.get(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!data.ok) throw new Error(data.description ?? `Telegram answered ${res.status}`);
    return data.result as T;
  }

  /** A bot token from @BotFather: checked with Telegram, kept sealed, and a pairing code made. */
  async configure(token: string): Promise<TelegramStatus> {
    const clean = token.trim();
    if (!/^\d{5,15}:[\w-]{30,60}$/.test(clean)) throw new Error("This is not a bot token from @BotFather");
    const me = await this.call<{ username?: string }>(clean, "getMe", {});
    this.stop();
    this.saved = {
      token: await this.sealer.seal(clean, "telegram"),
      bot: me.username,
      pairCode: String(100000 + ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900000)),
    };
    this.store();
    await this.start();
    return this.status();
  }

  disconnect(): void {
    this.stop();
    this.saved = {};
    this.token = undefined;
    rmSync(join(this.dataDir, FILE), { force: true });
  }

  async start(): Promise<void> {
    if (!this.saved.token || this.polling) return;
    try {
      this.token = await this.sealer.open(this.saved.token, "telegram");
    } catch {
      this.error = "The saved token could not be opened; connect the bot again";
      return;
    }
    this.unlisten ??= this.chief.listen((op, thread) => this.onChief(op, thread));
    const controller = new AbortController();
    this.polling = controller;
    void this.loop(controller);
  }

  stop(): void {
    this.polling?.abort();
    this.polling = undefined;
  }

  private async loop(controller: AbortController): Promise<void> {
    while (!controller.signal.aborted && this.token) {
      try {
        const updates = await this.call<Update[]>(
          this.token,
          "getUpdates",
          { offset: this.offset, timeout: 30, allowed_updates: ["message"] },
          controller.signal,
        );
        this.error = undefined;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handle(update);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        this.error = (err as Error).message;
        await Bun.sleep(15_000);
      }
    }
  }

  /** One message from Telegram: pairing, an approval, or something for the chief. */
  async handle(update: Update): Promise<void> {
    const chatId = update.message?.chat.id;
    const text = update.message?.text?.trim() ?? "";
    if (chatId === undefined || !text) return;
    if (this.saved.chatId === undefined) {
      // Only the chat that knows the code shown in Igrek; anyone else gets no answer at all.
      if (this.saved.pairCode && text === `/start ${this.saved.pairCode}`) {
        this.saved.chatId = chatId;
        this.saved.pairCode = undefined;
        this.store();
        await this.say("Paired with Igrek. Write to the chief here.");
      }
      return;
    }
    if (chatId !== this.saved.chatId) return;
    const decision = text.match(/^\/(allow|deny)_?(\d+)$/);
    if (decision) {
      const waiting = this.approvals.get(decision[2] ?? "");
      if (!waiting) return this.say("That approval is no longer waiting.");
      this.approvals.delete(decision[2] ?? "");
      this.chief.answer(waiting.requestId, decision[1] === "allow" ? "allow" : "deny", waiting.thread);
      return;
    }
    if (text === "/start") return;
    // "@asistan ..." is for the company's coordinator bot (plan.md 20.7), everything else for the chief.
    if (await this.toCompany?.(text)) return;
    this.chief.send(text);
  }

  /** Hands a message to the company's bot when it is meant for it; set by the server at startup. */
  toCompany?: (text: string) => Promise<boolean>;

  /** Something the company's bot says to this person, sent to the phone. */
  tell(text: string): void {
    if (this.saved.chatId !== undefined) void this.say(text);
  }

  /**
   * What the chief does in any of its threads, told to the phone: answers, approvals it waits for,
   * results of runs. A project thread's messages start with the project's name.
   */
  private onChief(op: ChatOp, thread: string): void {
    if (op.op !== "upsert" || this.saved.chatId === undefined) return;
    const event = op.event;
    if (this.sent.has(event.id)) return;
    const name = this.chief.threadName(thread);
    const from = name ? `[${name}] ` : "";
    if (event.kind === "result") {
      this.sent.add(event.id);
      const answer = lastAnswer(this.chief.events(thread));
      if (answer) void this.say(`${from}${answer}`);
    } else if (event.kind === "permission" && event.status === "pending") {
      this.sent.add(event.id);
      const n = String(this.approvals.size + 1);
      this.approvals.set(n, { requestId: event.requestId, thread });
      const what = JSON.stringify(event.input ?? {}).slice(0, 600);
      void this.say(`${from}The chief asks to use ${event.toolName}:\n${what}\n\n/allow_${n} or /deny_${n}`);
    } else if (event.kind === "notice" && event.code === "run") {
      this.sent.add(event.id);
      const [, status, project, changed] = event.text.split("|");
      void this.say(`Run in ${project}: ${status}, ${changed} files changed. Open Igrek to see it and approve.`);
    }
  }

  /** Sends to the paired chat, private details hidden: Telegram's servers see this text. */
  private async say(text: string): Promise<void> {
    if (!this.token || this.saved.chatId === undefined) return;
    const safe = hidePrivate(text, this.privateValues()).text;
    for (let i = 0; i < safe.length; i += MAX_TEXT)
      await this.call(this.token, "sendMessage", {
        chat_id: this.saved.chatId,
        text: safe.slice(i, i + MAX_TEXT),
      }).catch((err: Error) => {
        this.error = err.message;
      });
  }
}

export function registerTelegramRoutes(app: Hono, telegram: Telegram): void {
  app.get("/api/telegram", (c) => c.json(telegram.status()));
  app.put("/api/telegram", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
    try {
      return c.json(await telegram.configure(String(body.token ?? "")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.delete("/api/telegram", (c) => {
    telegram.disconnect();
    return c.json(telegram.status());
  });
}
