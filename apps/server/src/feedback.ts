import type { Database } from "bun:sqlite";
import { type Feedback, scrub } from "@igrek/core";
import type { AppErrors } from "./apperrors";
import type { Board } from "./board";
import type { Bus } from "./bus";

type Ask = (prompt: string) => Promise<string>;
const KINDS = ["bug", "feature", "praise", "question", "other"] as const;

/**
 * Feedback box (plan.md 13.5): a small box in your product sends what users write to Igrek
 * (same project key as errors). The PM persona's small model sorts each one (bug, feature,
 * praise, question), writes a one-line summary and the mood; a bug or wish becomes a board card
 * in one click. Contact details stay here; the model only sees the text, scrubbed.
 */
export class FeedbackBox {
  private rate = new Map<string, { minute: number; n: number }>();
  private queue: string[] = [];
  private busy = false;

  constructor(
    private readonly db: Database,
    private readonly errors: AppErrors,
    private readonly board: Board,
    private readonly bus: Bus,
    private readonly ask: Ask,
  ) {}

  private save(f: Feedback): void {
    const { id, projectId, at, ...data } = f;
    this.db
      .query(
        "INSERT INTO feedback (id, project_id, data, at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .run(id, projectId, JSON.stringify(data), at);
    this.bus.publish({ type: "ops-changed", what: "feedback" });
  }

  list(projectId: string): Feedback[] {
    return (
      this.db.query("SELECT * FROM feedback WHERE project_id = ? ORDER BY at DESC LIMIT 300").all(projectId) as {
        id: string;
        project_id: string;
        data: string;
        at: number;
      }[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Omit<Feedback, "id" | "projectId" | "at">),
      id: r.id,
      projectId: r.project_id,
      at: r.at,
    }));
  }

  get(id: string): Feedback | undefined {
    const r = this.db.query("SELECT * FROM feedback WHERE id = ?").get(id) as {
      id: string;
      project_id: string;
      data: string;
      at: number;
    } | null;
    return r
      ? {
          ...(JSON.parse(r.data) as Omit<Feedback, "id" | "projectId" | "at">),
          id: r.id,
          projectId: r.project_id,
          at: r.at,
        }
      : undefined;
  }

  ingest(key: string, body: unknown): boolean {
    const projectId = this.errors.projectForKey(key);
    if (!projectId) return false;
    const minute = Math.floor(Date.now() / 60_000);
    const r = this.rate.get(key);
    if (r && r.minute === minute && r.n >= 30) return false;
    this.rate.set(key, r && r.minute === minute ? { minute, n: r.n + 1 } : { minute, n: 1 });
    const input = (body ?? {}) as { text?: unknown; contact?: unknown; page?: unknown };
    const text = String(input.text ?? "")
      .trim()
      .slice(0, 4000);
    if (text.length < 2) return false;
    const f: Feedback = {
      id: crypto.randomUUID().slice(0, 12),
      projectId,
      text,
      ...(input.contact ? { contact: String(input.contact).slice(0, 200) } : {}),
      ...(input.page ? { page: String(input.page).split("?")[0]?.slice(0, 300) } : {}),
      at: Date.now(),
      status: "new",
    };
    this.save(f);
    this.queue.push(f.id);
    void this.sortQueued();
    return true;
  }

  /** Sorts waiting feedback a few at a time with the small model. */
  async sortQueued(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const ids = this.queue.splice(0, 10);
        const items = ids.map((id) => this.get(id)).filter((f): f is Feedback => !!f);
        if (!items.length) continue;
        try {
          const reply = await this.ask(
            [
              "You are the product manager. Sort each piece of user feedback below. For each, give: kind (bug | feature | praise | question | other), a one-line summary in English, sentiment (positive | neutral | negative).",
              'Answer with a JSON array in the same order: [{"kind":"…","summary":"…","sentiment":"…"}]',
              ...items.map((f, i) => `${i + 1}. ${scrub(f.text).slice(0, 1500)}`),
            ].join("\n"),
          );
          const start = reply.indexOf("[");
          const parsed =
            start >= 0
              ? (JSON.parse(reply.slice(start, reply.lastIndexOf("]") + 1)) as {
                  kind?: string;
                  summary?: string;
                  sentiment?: string;
                }[])
              : [];
          items.forEach((f, i) => {
            const p = parsed[i];
            if (!p) return;
            this.save({
              ...f,
              kind: KINDS.includes(p.kind as never) ? (p.kind as Feedback["kind"]) : "other",
              ...(p.summary ? { summary: String(p.summary).slice(0, 200) } : {}),
              ...(["positive", "neutral", "negative"].includes(String(p.sentiment))
                ? { sentiment: p.sentiment as Feedback["sentiment"] }
                : {}),
            });
          });
        } catch {
          // The limit or the network: they stay unsorted and can be sorted again later.
        }
      }
    } finally {
      this.busy = false;
    }
  }

  /** Feedback not sorted yet goes back into the queue. */
  resort(projectId: string): number {
    const ids = this.list(projectId)
      .filter((f) => !f.kind)
      .map((f) => f.id);
    this.queue.push(...ids);
    void this.sortQueued();
    return ids.length;
  }

  setStatus(id: string, status: Feedback["status"]): void {
    const f = this.get(id);
    if (!f) throw new Error("Not found");
    if (!["new", "planned", "done", "dismissed"].includes(status)) throw new Error("Unknown status");
    this.save({ ...f, status });
  }

  /** A bug or wish becomes a board card. */
  toTask(id: string): Feedback {
    const f = this.get(id);
    if (!f) throw new Error("Not found");
    const card = this.board.add({
      projectId: f.projectId,
      title: (f.summary ?? f.text).slice(0, 120),
      description: `A user wrote${f.page ? ` on ${f.page}` : ""}:\n\n> ${f.text.replace(/\n/g, "\n> ")}`,
      origin: "feedback",
    });
    const next = { ...f, status: "planned" as const, taskId: card.id };
    this.save(next);
    return next;
  }
}
