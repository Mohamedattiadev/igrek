import type { Database } from "bun:sqlite";
import type { ImportEstimate, ImportStatus } from "@igrek/core";
import type { Bus } from "../bus";
import type { Summarizer } from "../summarizer";
import type { Insight } from "./index";

const SECONDS_PER_SESSION = 20;
const TRANSCRIPT_CAP = 16_000;

/**
 * "Scan the project" for an existing project (plan.md 5.4): summarizes past
 * sessions that have no summary yet (which also fills the project memory),
 * then scores it. The cost is shown first; nothing starts without a click.
 */
export class HistoryImport {
  private running = new Map<string, ImportStatus>();

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly summarizer: Summarizer,
    private readonly insight: Insight,
  ) {}

  private pendingSessions(projectId: string): { id: string; chars: number }[] {
    return this.db
      .query(
        `SELECT s.id, COALESCE(SUM(MIN(LENGTH(m.text), 1500)), 0) AS chars FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id AND m.kind != 'tool'
         WHERE s.project_id = ? AND s.summary IS NULL AND s.user_messages >= 2 AND s.author_id IS NULL
         GROUP BY s.id ORDER BY s.updated_at DESC`,
      )
      .all(projectId) as { id: string; chars: number }[];
  }

  estimate(projectId: string): ImportEstimate {
    const pending = this.pendingSessions(projectId);
    const tokens = pending.reduce((n, s) => n + Math.ceil(Math.min(s.chars, TRANSCRIPT_CAP) / 4) + 2500, 0);
    return { sessions: pending.length, tokens, seconds: pending.length * SECONDS_PER_SESSION, model: "haiku" };
  }

  status(projectId: string): ImportStatus | undefined {
    return this.running.get(projectId);
  }

  start(projectId: string): ImportStatus {
    const existing = this.running.get(projectId);
    if (existing?.running) return existing;
    const pending = this.pendingSessions(projectId).map((s) => s.id);
    const status: ImportStatus = { running: true, done: 0, total: pending.length, failed: 0, startedAt: Date.now() };
    this.running.set(projectId, status);
    void this.loop(projectId, pending, status);
    return status;
  }

  stop(projectId: string): void {
    const status = this.running.get(projectId);
    if (status) status.cancelled = true;
  }

  private publish(projectId: string): void {
    this.bus.publish({ type: "import-progress", projectId });
  }

  private async loop(projectId: string, ids: string[], status: ImportStatus): Promise<void> {
    for (const id of ids) {
      if (status.cancelled) break;
      // The background summarizer may be busy with one session; wait for it rather than fail.
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          await this.summarizer.summarize(id);
          break;
        } catch (err) {
          if (!/Another summary is running/.test((err as Error).message)) {
            status.failed++;
            break;
          }
          await Bun.sleep(3000);
        }
      }
      status.done++;
      this.publish(projectId);
    }
    status.running = false;
    status.finishedAt = Date.now();
    this.publish(projectId);
    await this.insight.scan(projectId).catch(() => undefined);
  }
}
