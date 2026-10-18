import type { ChatEvent, ChatInfo } from "@igrek/core";
import type { ChatOp } from "./chats";

type Snapshot = { info: ChatInfo; events: ChatEvent[]; seq: number };

/** Ops are gathered this long and sent as one message: a streaming answer changes many times a second. */
const FLUSH_MS = 40;
/** Above this many unsent bytes the browser is not keeping up: stop sending ops. */
const HIGH_WATER = 1024 * 1024;
/** Below this the socket has drained enough to catch the browser up with one snapshot. */
const LOW_WATER = 64 * 1024;

/**
 * The live stream of one chat to one browser (plan.md 16.3 #19). Changes to the same event are
 * merged (only its newest version is sent), everything waits up to FLUSH_MS and goes as one
 * `batch` carrying the newest sequence number. When the socket backs up, ops stop and the next
 * drain sends a full `init` snapshot instead of the backlog, so a slow tab never grows memory
 * on the server and never shows a half-applied state.
 */
export class ChatStream {
  private events = new Map<string, ChatEvent>();
  private info?: ChatInfo;
  private seq = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private behind = false;

  constructor(
    private readonly send: (data: string) => void,
    private readonly buffered: () => number,
    private readonly snapshot: () => Snapshot | undefined,
  ) {}

  start(first: Snapshot): void {
    this.sendInit(first);
  }

  push(op: ChatOp): void {
    this.seq = Math.max(this.seq, op.seq);
    if (this.behind) return;
    if (op.op === "info") this.info = op.info;
    else this.events.set(op.event.id, op.event);
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.behind || (!this.info && this.events.size === 0)) return;
    const ops: ({ op: "upsert"; event: ChatEvent } | { op: "info"; info: ChatInfo })[] = [
      ...[...this.events.values()].map((event) => ({ op: "upsert" as const, event })),
      ...(this.info ? [{ op: "info" as const, info: this.info }] : []),
    ];
    this.events.clear();
    this.info = undefined;
    this.send(JSON.stringify({ op: "batch", seq: this.seq, ops }));
    if (this.buffered() > HIGH_WATER) this.behind = true;
  }

  /** The socket sent some of its backlog (Bun's `drain`). */
  drain(): void {
    if (!this.behind || this.buffered() > LOW_WATER) return;
    const now = this.snapshot();
    if (!now) return;
    this.behind = false;
    this.sendInit(now);
  }

  close(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private sendInit(now: Snapshot): void {
    this.events.clear();
    this.info = undefined;
    this.seq = Math.max(this.seq, now.seq);
    this.send(JSON.stringify({ op: "init", seq: now.seq, info: now.info, events: now.events }));
  }
}
