import { type ChatEvent, fixRequest, type Settings, type ToolResult } from "@igrek/core";

type Gate = Extract<ChatEvent, { kind: "gate" }>;

/** Runs the project's checks (typecheck, lint, tests) in a folder. */
export type RunChecks = (root: string) => Promise<ToolResult[]>;

export interface GateChats {
  addEvent(chatId: string, event: ChatEvent): void;
  send(chatId: string, text: string): void;
}

/** Automatic "fix it" messages in a row before the gate stops and leaves it to the user. */
const MAX_ROUNDS = 2;
const OUTPUT_TAIL = 2500;

/**
 * The gate point after an AI turn (plan.md 15.5). When a chat turn changed files, the project's
 * checks run; a command that passed before and fails now is a new problem the turn brought in.
 * It is shown in the chat with its output and, in "sendBack" mode, handed to the AI to fix (at
 * most MAX_ROUNDS times in a row). Problems that were already there do not hold the turn back:
 * the baseline is taken when the chat starts, before the AI changed anything (a ratchet).
 */
export class TurnGate {
  /** Per folder and command: whether it has passed since the baseline. */
  private last = new Map<string, boolean>();
  private busy = new Set<string>();
  private rounds = new Map<string, number>();
  /** Chats whose next turn answers the gate's own message. */
  private answering = new Set<string>();

  constructor(
    private readonly mode: () => Settings["turnGate"],
    private readonly chats: GateChats,
    private readonly run: RunChecks,
  ) {}

  /** A chat opened in this folder: remember how the checks stand before the AI touches anything. */
  async baseline(root: string): Promise<void> {
    if (this.mode() === "off" || this.busy.has(root) || this.known(root)) return;
    this.busy.add(root);
    try {
      this.remember(root, await this.run(root));
    } finally {
      this.busy.delete(root);
    }
  }

  async turnEnded(chatId: string, root: string, edited: string[]): Promise<void> {
    const mode = this.mode();
    const followUp = this.answering.delete(chatId);
    if (!followUp) this.rounds.delete(chatId);
    if (mode === "off" || !edited.length || this.busy.has(root)) return;
    const id = `gate-${Date.now()}`;
    this.chats.addEvent(chatId, { kind: "gate", id, at: Date.now(), status: "running", checks: [] });
    this.busy.add(root);
    let results: ToolResult[];
    try {
      results = await this.run(root);
    } finally {
      this.busy.delete(root);
    }
    const checks = results.map((r) => ({
      command: r.command,
      ok: r.ok,
      broke: !r.ok && this.last.get(this.key(root, r.command)) === true,
      output: r.ok ? undefined : r.output.slice(-OUTPUT_TAIL),
    }));
    this.remember(root, results);
    const broke = checks.filter((c) => c.broke);
    const status: Gate["status"] = !checks.length ? "none" : checks.every((c) => c.ok) ? "pass" : "fail";
    const round = this.rounds.get(chatId) ?? 0;
    const sendBack = mode === "sendBack" && broke.length > 0 && round < MAX_ROUNDS;
    this.chats.addEvent(chatId, { kind: "gate", id, at: Date.now(), status, checks, sentBack: sendBack });
    if (!sendBack) return;
    this.rounds.set(chatId, round + 1);
    this.answering.add(chatId);
    this.chats.send(chatId, fixRequest(broke));
  }

  private key(root: string, command: string): string {
    return `${root}\0${command}`;
  }

  private known(root: string): boolean {
    for (const key of this.last.keys()) if (key.startsWith(`${root}\0`)) return true;
    return false;
  }

  /** A pass is remembered; a failure never overwrites a known pass, so an unfixed break keeps counting. */
  private remember(root: string, results: ToolResult[]): void {
    for (const r of results) {
      const key = this.key(root, r.command);
      if (r.ok || !this.last.has(key)) this.last.set(key, r.ok);
    }
  }
}
