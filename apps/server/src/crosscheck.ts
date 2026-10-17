import type { Database } from "bun:sqlite";
import type { Settings } from "@godeye/core";
import { type Bus, StopRegistry } from "./bus";
import { MODEL_FOR, runClaude } from "./summarizer";

type Ask = (prompt: string) => Promise<string>;

/**
 * Cross-person conflicts (plan.md 4.4): when a teammate's decision arrives, it is compared with your own
 * active decisions. A contradiction marks their item as a conflict; that change syncs back, so both of you see it.
 * Your own new decisions are already checked against everything (teammates' included) when a session is summarized.
 */
export class CrossCheck {
  private queue: { projectId: string; itemId: string }[] = [];
  private busy = false;

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly settings: () => Settings,
    runnerDir: string,
    private readonly ask: Ask = (prompt) => runClaude(prompt, runnerDir, new StopRegistry(), MODEL_FOR.ask),
  ) {}

  add(projectId: string, itemId: string): void {
    if (this.queue.some((q) => q.itemId === itemId)) return;
    this.queue.push({ projectId, itemId });
    void this.drain();
  }

  /** Resolves once the queue is empty (tests wait on it). */
  async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift())
        await this.check(next.projectId, next.itemId).catch(() => false);
    } finally {
      this.busy = false;
    }
  }

  async check(projectId: string, itemId: string): Promise<boolean> {
    // Background AI follows the same switch as automatic summaries.
    if (!this.settings().autoSummarize) return false;
    const item = this.db
      .query("SELECT id, text, author_name, status FROM memory_items WHERE id = ? AND project_id = ?")
      .get(itemId, projectId) as { id: string; text: string; author_name: string | null; status: string } | null;
    if (item?.status !== "active") return false;
    const mine = this.db
      .query(
        `SELECT id, text FROM memory_items WHERE project_id = ? AND author_id IS NULL AND status = 'active'
           AND section IN ('decision', 'convention') ORDER BY created_at DESC LIMIT 40`,
      )
      .all(projectId) as { id: string; text: string }[];
    if (!mine.length) return false;
    const reply = await this.ask(prompt(item.text, mine, this.settings().language));
    const parsed = parse(reply);
    const other = parsed?.contradicts ? mine.find((m) => m.id === parsed.contradicts) : undefined;
    if (!other) return false;
    this.db
      .query(
        "UPDATE memory_items SET status = 'conflict', conflict_with = ?, conflict_reason = ?, updated_at = ?, dirty = 1 WHERE id = ? AND status = 'active'",
      )
      .run(other.id, (parsed?.reason ?? "").trim().slice(0, 300), Date.now(), item.id);
    this.bus.publish({ type: "sessions-changed", projectIds: [projectId], sessionIds: [] });
    return true;
  }
}

function prompt(text: string, mine: { id: string; text: string }[], language: string): string {
  return [
    "A teammate recorded a new project decision. Check whether it directly contradicts one of the existing decisions below.",
    "Only a real contradiction counts: both cannot be true or followed at the same time. Different topics, refinements or additions are not contradictions.",
    "",
    `New decision: ${JSON.stringify(text)}`,
    "",
    "Existing decisions:",
    ...mine.map((m) => `- [${m.id}] ${JSON.stringify(m.text)}`),
    "",
    `Reply with JSON only: {"contradicts": "<id of the contradicted decision, or null>", "reason": "<one short sentence in language '${language}'>"}`,
  ].join("\n");
}

function parse(reply: string): { contradicts?: string | null; reason?: string } | undefined {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
