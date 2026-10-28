import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { basename } from "node:path";

/**
 * What Igrek's own AI jobs cost (plan.md 19.3): every summary, title, review, @ai answer and report
 * is written down with the tokens it used and where it ran: on Claude, on the local model, or not
 * at all because the same question was answered a moment ago. The Limits page shows the week, and
 * what was saved.
 */

export type JobSource = "claude" | "local" | "cache";

export interface JobUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Roughly four characters a token: enough to say what a job that did not reach Claude saved. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Which part of Igrek asked: the file that called, e.g. "summarizer" or "team-chat-routes". */
export function callerKind(stack = new Error().stack ?? ""): string {
  for (const line of stack.split("\n").slice(1)) {
    const file = line.match(/\(?((?:\/|[A-Z]:\\)[^():]+\.ts)/)?.[1];
    if (!file) continue;
    const name = basename(file, ".ts");
    if (name !== "ai-jobs" && name !== "summarizer") return name;
  }
  return "other";
}

export class AiJobs {
  constructor(private readonly db: Database) {}

  record(kind: string, model: string, source: JobSource, usage: JobUsage, at = Date.now()): void {
    this.db
      .query(
        `INSERT INTO ai_jobs (at, kind, model, source, input, output, cache_read, cache_write)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        at,
        kind.slice(0, 40),
        model.slice(0, 40),
        source,
        usage.input,
        usage.output,
        usage.cacheRead,
        usage.cacheWrite,
      );
  }

  /** Since a time: per kind, what reached Claude, and the tokens saved by the local model and repeats. */
  since(from: number): {
    kinds: { kind: string; jobs: number; tokens: number; local: number; cached: number }[];
    tokens: number;
    saved: number;
  } {
    const kinds = this.db
      .query(
        `SELECT kind, COUNT(*) AS jobs,
           SUM(CASE WHEN source = 'claude' THEN input + output + cache_write ELSE 0 END) AS tokens,
           SUM(CASE WHEN source = 'local' THEN 1 ELSE 0 END) AS local,
           SUM(CASE WHEN source = 'cache' THEN 1 ELSE 0 END) AS cached
         FROM ai_jobs WHERE at > ? GROUP BY kind ORDER BY tokens DESC`,
      )
      .all(from) as { kind: string; jobs: number; tokens: number; local: number; cached: number }[];
    const saved = this.db
      .query("SELECT COALESCE(SUM(input + output), 0) AS n FROM ai_jobs WHERE at > ? AND source != 'claude'")
      .get(from) as { n: number };
    return { kinds, tokens: kinds.reduce((n, k) => n + k.tokens, 0), saved: saved.n };
  }
}

/**
 * The same small question asked again within a day (a title, a summary of the same text, the
 * same classification) gets the same answer without asking Claude. Kept in memory only.
 */
export class AnswerCache {
  private answers = new Map<string, { at: number; text: string }>();

  constructor(
    private readonly ttl = 24 * 3_600_000,
    private readonly max = 300,
  ) {}

  key(model: string, prompt: string, args: string[]): string {
    return createHash("sha256")
      .update(`${model}\u0000${args.join("\u0000")}\u0000${prompt}`)
      .digest("hex");
  }

  get(key: string, now = Date.now()): string | undefined {
    const hit = this.answers.get(key);
    if (!hit) return undefined;
    if (now - hit.at > this.ttl) {
      this.answers.delete(key);
      return undefined;
    }
    return hit.text;
  }

  set(key: string, text: string, now = Date.now()): void {
    this.answers.delete(key);
    this.answers.set(key, { at: now, text });
    // The oldest answer goes first once there are too many.
    if (this.answers.size > this.max) this.answers.delete(this.answers.keys().next().value as string);
  }
}
