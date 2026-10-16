import { existsSync } from "node:fs";
import type { TerminalInfo, TerminalTool } from "@godeye/core";
import type { Bus, StopRegistry } from "./bus";
import { cleanEnv, loginShell } from "./env";

const SCROLLBACK_BYTES = 512 * 1024;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g");
/** Colours, cursor moves and window titles, plus carriage returns: what's left is the text. */
const ANSI_ALL = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]|${ESC}\\][^${BEL}]*${BEL}|\r`, "g");
/** Prompts that mean the AI is waiting for the user (approve, choose, confirm). */
const NEEDS_YOU =
  /(Do you want to|Would you like to|\(y\/n\)|\[y\/N\]|Allow (this|once)|❯ 1\. Yes|Press Enter to|Approve\?)/i;

interface Terminal {
  info: TerminalInfo;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  chunks: string[];
  size: number;
  tail: string;
  listeners: Set<(data: string) => void>;
}

export interface StartOptions {
  projectId: string;
  cwd: string;
  tool: TerminalTool;
  title?: string;
  /** Extra CLI arguments, e.g. ["--resume", id] or an opening prompt. */
  args?: string[];
  cols?: number;
  rows?: number;
  /** Extra environment, e.g. CLAUDE_CONFIG_DIR for the chosen account. */
  env?: Record<string, string>;
}

function commandFor(tool: TerminalTool): string[] {
  if (tool === "shell") return [loginShell(), "-l"];
  if (tool === "ssh") return ["ssh"];
  const bin = Bun.which(tool);
  if (!bin) throw new Error(`${tool} is not installed on this computer`);
  return [bin];
}

/**
 * Real terminals (PTY) for Claude Code, Codex or a shell, shown in the browser
 * (plan.md 2.1). They keep running when the page closes; reopening replays the
 * recent output so you pick up where you left off.
 */
export class Terminals {
  private terms = new Map<string, Terminal>();
  private statusTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly bus: Bus,
    private readonly stops: StopRegistry,
  ) {
    this.statusTimer = setInterval(() => this.refreshStatuses(), 1000);
  }

  list(): TerminalInfo[] {
    return [...this.terms.values()].map((t) => ({ ...t.info })).sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): TerminalInfo | undefined {
    const term = this.terms.get(id);
    return term ? { ...term.info } : undefined;
  }

  start(options: StartOptions): TerminalInfo {
    if (!existsSync(options.cwd)) throw new Error("Project folder not found");
    const id = crypto.randomUUID().slice(0, 8);
    const cmd = [...commandFor(options.tool), ...(options.args ?? [])];
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 32;
    const decoder = new TextDecoder();

    const term: Terminal = {
      info: {
        id,
        projectId: options.projectId,
        cwd: options.cwd,
        tool: options.tool,
        title: options.title ?? options.tool,
        startedAt: Date.now(),
        lastOutputAt: Date.now(),
        status: "running",
      },
      write: () => undefined,
      resize: () => undefined,
      kill: () => undefined,
      chunks: [],
      size: 0,
      tail: "",
      listeners: new Set(),
    };

    const proc = Bun.spawn(cmd, {
      cwd: options.cwd,
      env: cleanEnv({ ...options.env, TERM: "xterm-256color", COLORTERM: "truecolor", GODEYE_TERMINAL: id }),
      terminal: {
        cols,
        rows,
        data: (_t: unknown, bytes: Uint8Array) => this.output(term, decoder.decode(bytes, { stream: true })),
      },
    } as Parameters<typeof Bun.spawn>[1]);
    const pty = (proc as unknown as { terminal: { write(d: string): void; resize(c: number, r: number): void } })
      .terminal;

    term.write = (data) => pty.write(data);
    term.resize = (c, r) => pty.resize(Math.max(20, c), Math.max(5, r));
    // Interactive shells ignore SIGTERM; hang up like a closed terminal window, then force it.
    term.kill = () => {
      proc.kill("SIGHUP");
      setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
      }, 1000);
    };
    const unregister = this.stops.register(`terminal-${id}`, { label: term.info.title, stop: () => term.kill() });

    void proc.exited.then((code) => {
      unregister();
      term.info.status = "exited";
      term.info.exitCode = code;
      term.info.exitedAt = Date.now();
      this.output(term, `\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`);
      this.changed();
    });

    this.terms.set(id, term);
    this.changed();
    return { ...term.info };
  }

  /**
   * The latest error lines printed in this project's shell terminals (a failing
   * test, a crashed dev server), for the prompt enhancer. Plain text, no colours.
   */
  recentErrors(projectId: string): { title: string; text: string } | undefined {
    const terms = [...this.terms.values()]
      .filter((t) => t.info.projectId === projectId && t.info.tool === "shell")
      .sort((a, b) => b.info.lastOutputAt - a.info.lastOutputAt);
    for (const term of terms) {
      const text = term.chunks.join("").slice(-12_000).replace(ANSI_ALL, "");
      const lines = text.split("\n");
      let last = -1;
      for (let i = lines.length - 1; i >= 0; i--)
        if (
          /\b(error|failed|failure|exception|traceback|panic|cannot find|not found|ERR!|FAIL)\b/i.test(lines[i] ?? "")
        ) {
          last = i;
          break;
        }
      if (last < 0) continue;
      return {
        title: term.info.title,
        text: lines
          .slice(Math.max(0, last - 12), last + 6)
          .join("\n")
          .trim()
          .slice(0, 2000),
      };
    }
    return undefined;
  }

  /** Replays recent output, then streams new output to `listener`. Returns an unsubscribe. */
  attach(id: string, listener: (data: string) => void): (() => void) | undefined {
    const term = this.terms.get(id);
    if (!term) return undefined;
    const backlog = term.chunks.join("");
    if (backlog) listener(backlog);
    term.listeners.add(listener);
    return () => term.listeners.delete(listener);
  }

  input(id: string, data: string): void {
    const term = this.terms.get(id);
    if (!term || term.info.status === "exited") return;
    term.write(data);
    if (term.info.status === "attention") {
      term.info.status = "running";
      this.changed();
    }
  }

  resize(id: string, cols: number, rows: number): void {
    this.terms.get(id)?.resize(cols, rows);
  }

  /** Stops the process; an exited terminal is removed from the list. */
  close(id: string): void {
    const term = this.terms.get(id);
    if (!term) return;
    if (term.info.status === "exited") {
      this.terms.delete(id);
      this.changed();
    } else term.kill();
  }

  stopAll(): void {
    clearInterval(this.statusTimer);
    for (const term of this.terms.values()) term.kill();
  }

  private output(term: Terminal, data: string): void {
    if (!data) return;
    term.chunks.push(data);
    term.size += data.length;
    while (term.size > SCROLLBACK_BYTES && term.chunks.length > 1) term.size -= term.chunks.shift()?.length ?? 0;
    term.tail = (term.tail + data).slice(-600);
    term.info.lastOutputAt = Date.now();
    for (const listener of term.listeners) listener(data);
  }

  private refreshStatuses(): void {
    let changed = false;
    const now = Date.now();
    for (const term of this.terms.values()) {
      if (term.info.status === "exited") continue;
      // Strip escape codes before looking for "waiting for you" prompts.
      const plain = term.tail.replace(ANSI, "");
      const next = NEEDS_YOU.test(plain.slice(-300))
        ? "attention"
        : now - term.info.lastOutputAt < 1500
          ? "running"
          : "idle";
      if (next !== term.info.status) {
        term.info.status = next;
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  private changed(): void {
    this.bus.publish({ type: "terminals", terminals: this.list() });
  }
}
