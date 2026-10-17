import type { Database } from "bun:sqlite";
import type { BoardTask, FlowRun, TaskStatus } from "@godeye/core";
import type { Bus } from "./bus";
import type { Flows } from "./flows";

const STATUSES: TaskStatus[] = ["todo", "doing", "review", "done"];

type Row = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  run_id: string | null;
  origin: string | null;
  ord: number;
  created_at: number;
  updated_at: number;
};

function toTask(r: Row): BoardTask {
  return {
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status,
    ...(r.run_id ? { runId: r.run_id } : {}),
    ...(r.origin ? { origin: r.origin } : {}),
    order: r.ord,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * The task board (plan.md Faz 8): To do → Doing → Review → Done. Moving a card to Doing starts
 * the team on it (the feature flow); when the run is ready the card moves to Review, and merging
 * it moves it to Done.
 */
export class Board {
  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly flows: Flows,
  ) {}

  list(projectId: string): BoardTask[] {
    return (
      this.db.query("SELECT * FROM board_tasks WHERE project_id = ? ORDER BY status, ord").all(projectId) as Row[]
    ).map(toTask);
  }

  get(id: string): BoardTask | undefined {
    const row = this.db.query("SELECT * FROM board_tasks WHERE id = ?").get(id) as Row | undefined;
    return row ? toTask(row) : undefined;
  }

  add(args: { projectId: string; title: string; description?: string; origin?: string }): BoardTask {
    const title = args.title.trim().slice(0, 200);
    if (!title) throw new Error("A card needs a title");
    const id = crypto.randomUUID().slice(0, 10);
    const now = Date.now();
    const last = this.db
      .query("SELECT MAX(ord) AS m FROM board_tasks WHERE project_id = ? AND status = 'todo'")
      .get(args.projectId) as {
      m: number | null;
    };
    this.db
      .query(
        "INSERT INTO board_tasks (id, project_id, title, description, status, origin, ord, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?, ?)",
      )
      .run(
        id,
        args.projectId,
        title,
        (args.description ?? "").slice(0, 4000),
        args.origin ?? null,
        (last.m ?? 0) + 1,
        now,
        now,
      );
    this.changed(args.projectId);
    return this.get(id) as BoardTask;
  }

  /** Cards from another tool keep their column, without starting the team (plan.md 13.6). */
  addImported(
    projectId: string,
    card: { title: string; description?: string; status: TaskStatus; origin: string },
  ): BoardTask {
    const task = this.add({ projectId, title: card.title, description: card.description, origin: card.origin });
    if (card.status !== "todo")
      this.db.query("UPDATE board_tasks SET status = ? WHERE id = ?").run(card.status, task.id);
    return this.get(task.id) as BoardTask;
  }

  update(id: string, patch: { title?: unknown; description?: unknown }): BoardTask | undefined {
    const task = this.get(id);
    if (!task) return undefined;
    this.db
      .query("UPDATE board_tasks SET title = ?, description = ?, updated_at = ? WHERE id = ?")
      .run(
        typeof patch.title === "string" && patch.title.trim() ? patch.title.trim().slice(0, 200) : task.title,
        typeof patch.description === "string" ? patch.description.slice(0, 4000) : task.description,
        Date.now(),
        id,
      );
    this.changed(task.projectId);
    return this.get(id);
  }

  /** Moving to Doing starts the team (unless a run is already going); back to To do stops it. */
  move(id: string, status: TaskStatus, order?: number, flow = "feature"): BoardTask {
    const task = this.get(id);
    if (!task) throw new Error("Card not found");
    if (!STATUSES.includes(status)) throw new Error("Unknown column");
    let runId = task.runId;
    const run = runId ? this.flows.get(runId) : undefined;
    if (status === "doing" && (!run || ["failed", "stopped", "discarded", "merged"].includes(run.status))) {
      runId = this.flows.start({
        projectId: task.projectId,
        flow,
        request: `${task.title}${task.description ? `\n\n${task.description}` : ""}`,
        taskId: task.id,
      }).id;
    }
    if (status === "todo" && run && ["running", "needs_you"].includes(run.status)) this.flows.stop(run.id);
    this.db
      .query("UPDATE board_tasks SET status = ?, ord = ?, run_id = ?, updated_at = ? WHERE id = ?")
      .run(status, order ?? task.order, runId ?? null, Date.now(), id);
    this.changed(task.projectId);
    return this.get(id) as BoardTask;
  }

  remove(id: string): void {
    const task = this.get(id);
    this.db.query("DELETE FROM board_tasks WHERE id = ?").run(id);
    if (task) this.changed(task.projectId);
  }

  /** Follows the team's run: ready (or waiting for you) → Review, merged → Done. */
  followRun(run: FlowRun): void {
    if (!run.taskId) return;
    const task = this.get(run.taskId);
    if (!task) return;
    const next: TaskStatus | undefined =
      run.status === "merged" || run.status === "done"
        ? "done"
        : run.status === "ready" || run.status === "needs_you"
          ? "review"
          : run.status === "running"
            ? "doing"
            : undefined;
    if (next && next !== task.status) {
      this.db.query("UPDATE board_tasks SET status = ?, updated_at = ? WHERE id = ?").run(next, Date.now(), task.id);
      this.changed(task.projectId);
    }
  }

  /** "Done" cards per persona-run, for the scorecard (plan.md 6.4). */
  doneCount(): number {
    return (this.db.query("SELECT COUNT(*) AS n FROM board_tasks WHERE status = 'done'").get() as { n: number }).n;
  }

  private changed(projectId: string): void {
    this.bus.publish({ type: "board-changed", projectId });
  }
}
