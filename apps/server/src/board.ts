import type { Database } from "bun:sqlite";
import type { BoardTask, FlowRun, TaskStatus } from "@igrek/core";
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
  assignee_kind: "person" | "persona" | null;
  assignee_id: string | null;
  assignee_name: string | null;
  claimed_by: string | null;
  claimed_name: string | null;
  author_name: string | null;
  deleted: number;
};

/** A card as it travels to teammates: no run id (the run lives on the computer that started it). */
export interface SharedTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
  assignee?: BoardTask["assignee"];
  claimedBy?: BoardTask["claimedBy"];
  deleted: boolean;
}

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
    ...(r.assignee_kind && r.assignee_id
      ? { assignee: { kind: r.assignee_kind, id: r.assignee_id, name: r.assignee_name ?? r.assignee_id } }
      : {}),
    ...(r.claimed_by ? { claimedBy: { id: r.claimed_by, name: r.claimed_name ?? r.claimed_by } } : {}),
    ...(r.author_name ? { author: r.author_name } : {}),
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
      this.db
        .query(
          "SELECT id, project_id, title, description, status, run_id, origin, ord, created_at, updated_at, assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted FROM board_tasks WHERE project_id = ? AND deleted = 0 ORDER BY status, ord",
        )
        .all(projectId) as Row[]
    ).map(toTask);
  }

  /** Every card of the given projects, for the company's view of who is on what. */
  listMany(projectIds: string[]): BoardTask[] {
    return (
      this.db
        .query(
          `SELECT id, project_id, title, description, status, run_id, origin, ord, created_at, updated_at, assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted FROM board_tasks
           WHERE project_id IN (SELECT value FROM json_each(?)) AND deleted = 0 ORDER BY updated_at DESC LIMIT 2000`,
        )
        .all(JSON.stringify(projectIds)) as Row[]
    ).map(toTask);
  }

  /** Cards for me, on every project: given to me or taken by me, not done yet. */
  mine(memberId: string): BoardTask[] {
    return (
      this.db
        .query(
          `SELECT id, project_id, title, description, status, run_id, origin, ord, created_at, updated_at, assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted FROM board_tasks
           WHERE deleted = 0 AND status != 'done' AND ((assignee_kind = 'person' AND assignee_id = ?) OR claimed_by = ?)
           ORDER BY updated_at DESC LIMIT 100`,
        )
        .all(memberId, memberId) as Row[]
    ).map(toTask);
  }

  get(id: string): BoardTask | undefined {
    const row = this.db
      .query(
        "SELECT id, project_id, title, description, status, run_id, origin, ord, created_at, updated_at, assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted FROM board_tasks WHERE id = ?",
      )
      .get(id) as Row | undefined;
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
      this.db.query("UPDATE board_tasks SET status = ?, dirty = 1 WHERE id = ?").run(card.status, task.id);
    return this.get(task.id) as BoardTask;
  }

  update(id: string, patch: { title?: unknown; description?: unknown }): BoardTask | undefined {
    const task = this.get(id);
    if (!task) return undefined;
    this.db
      .query("UPDATE board_tasks SET title = ?, description = ?, updated_at = ?, dirty = 1 WHERE id = ?")
      .run(
        typeof patch.title === "string" && patch.title.trim() ? patch.title.trim().slice(0, 200) : task.title,
        typeof patch.description === "string" ? patch.description.slice(0, 4000) : task.description,
        Date.now(),
        id,
      );
    this.changed(task.projectId);
    return this.get(id);
  }

  /** A card given to a persona that is a team bot goes to that bot (bots.ts); set at startup. */
  startByBot?: (task: BoardTask) => string | undefined;

  /** Moving to Doing starts the team (unless a run is already going); back to To do stops it. */
  move(id: string, status: TaskStatus, order?: number, flow = "feature"): BoardTask {
    const task = this.get(id);
    if (!task) throw new Error("Card not found");
    if (!STATUSES.includes(status)) throw new Error("Unknown column");
    let runId = task.runId;
    const run = runId ? this.flows.get(runId) : undefined;
    if (status === "doing" && (!run || ["failed", "stopped", "discarded", "merged"].includes(run.status))) {
      runId =
        this.startByBot?.(task) ??
        this.flows.start({
          projectId: task.projectId,
          flow,
          request: `${task.title}${task.description ? `\n\n${task.description}` : ""}`,
          taskId: task.id,
          // A card given to a persona is worked on as that persona.
          ...(task.assignee?.kind === "persona" ? { persona: task.assignee.id } : {}),
        }).id;
    }
    if (status === "todo" && run && ["running", "needs_you"].includes(run.status)) this.flows.stop(run.id);
    this.db
      .query("UPDATE board_tasks SET status = ?, ord = ?, run_id = ?, updated_at = ?, dirty = 1 WHERE id = ?")
      .run(status, order ?? task.order, runId ?? null, Date.now(), id);
    this.changed(task.projectId);
    return this.get(id) as BoardTask;
  }

  /**
   * A card a person works on moves with their work (board-auto.ts): no team of experts is started,
   * unlike move(). The session it is worked in is remembered here only; it lives on this computer.
   */
  track(id: string, status: TaskStatus, sessionId?: string): BoardTask | undefined {
    const task = this.get(id);
    if (!task || !STATUSES.includes(status)) return undefined;
    this.db
      .query(
        "UPDATE board_tasks SET status = ?, session_id = COALESCE(?, session_id), updated_at = ?, dirty = 1 WHERE id = ?",
      )
      .run(status, sessionId ?? null, Date.now(), id);
    this.changed(task.projectId);
    return this.get(id);
  }

  /** Kept as a marker so the removal reaches teammates too. */
  remove(id: string): void {
    const task = this.get(id);
    this.db.query("UPDATE board_tasks SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?").run(Date.now(), id);
    if (task) this.changed(task.projectId);
  }

  /** Who the card is for: a teammate or a persona; null clears it. */
  assign(id: string, assignee: BoardTask["assignee"] | null): BoardTask {
    const task = this.get(id);
    if (!task) throw new Error("Card not found");
    this.db
      .query(
        "UPDATE board_tasks SET assignee_kind = ?, assignee_id = ?, assignee_name = ?, updated_at = ?, dirty = 1 WHERE id = ?",
      )
      .run(assignee?.kind ?? null, assignee?.id ?? null, assignee?.name.slice(0, 80) ?? null, Date.now(), id);
    this.changed(task.projectId);
    return this.get(id) as BoardTask;
  }

  /** "I'm taking this": refused when someone else already took it; null lets it go. */
  claim(id: string, who: { id: string; name: string } | null): BoardTask {
    const task = this.get(id);
    if (!task) throw new Error("Card not found");
    if (who && task.claimedBy && task.claimedBy.id !== who.id)
      throw new Error(`${task.claimedBy.name} already took this card`);
    this.db
      .query("UPDATE board_tasks SET claimed_by = ?, claimed_name = ?, updated_at = ?, dirty = 1 WHERE id = ?")
      .run(who?.id ?? null, who?.name.slice(0, 80) ?? null, Date.now(), id);
    this.changed(task.projectId);
    return this.get(id) as BoardTask;
  }

  // ---- team sync -----------------------------------------------------------------------

  /**
   * Cards changed here that teammates have not received yet. In a project you only receive,
   * only your edits to teammates' cards go out, never cards of your own.
   */
  unsent(projectId: string, teammatesOnly = false): SharedTask[] {
    return (
      this.db
        .query(
          "SELECT id, project_id, title, description, status, run_id, origin, ord, created_at, updated_at, assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted FROM board_tasks WHERE project_id = ? AND dirty = 1 AND (? = 0 OR author_name IS NOT NULL) LIMIT 50",
        )
        .all(projectId, teammatesOnly ? 1 : 0) as Row[]
    ).map((r) => {
      const task = toTask(r);
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        order: task.order,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        ...(task.assignee ? { assignee: task.assignee } : {}),
        ...(task.claimedBy ? { claimedBy: task.claimedBy } : {}),
        deleted: r.deleted === 1,
      };
    });
  }

  markSent(id: string, updatedAt: number): void {
    this.db.query("UPDATE board_tasks SET dirty = 0 WHERE id = ? AND updated_at = ?").run(id, updatedAt);
  }

  /** A teammate's card: the newer version wins; their runs stay on their computer. */
  applyRemote(projectId: string, value: Record<string, unknown>, author: string): void {
    const id = String(value.id ?? "");
    const at = Number(value.updatedAt ?? 0);
    const status = STATUSES.find((s) => s === value.status);
    if (!id || !status) return;
    const existing = this.db.query("SELECT updated_at FROM board_tasks WHERE id = ?").get(id) as {
      updated_at: number;
    } | null;
    if (existing && existing.updated_at >= at) return;
    const assignee = value.assignee as BoardTask["assignee"] | undefined;
    const claimed = value.claimedBy as BoardTask["claimedBy"] | undefined;
    this.db
      .query(
        `INSERT INTO board_tasks (id, project_id, title, description, status, ord, created_at, updated_at,
           assignee_kind, assignee_id, assignee_name, claimed_by, claimed_name, author_name, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, status = excluded.status,
           ord = excluded.ord, updated_at = excluded.updated_at, assignee_kind = excluded.assignee_kind,
           assignee_id = excluded.assignee_id, assignee_name = excluded.assignee_name, claimed_by = excluded.claimed_by,
           claimed_name = excluded.claimed_name, deleted = excluded.deleted, dirty = 0`,
      )
      .run(
        id,
        projectId,
        String(value.title ?? "").slice(0, 200),
        String(value.description ?? "").slice(0, 4000),
        status,
        Number(value.order ?? 0),
        Number(value.createdAt ?? at),
        at,
        assignee?.kind === "person" || assignee?.kind === "persona" ? assignee.kind : null,
        assignee ? String(assignee.id).slice(0, 80) : null,
        assignee ? String(assignee.name).slice(0, 80) : null,
        claimed ? String(claimed.id).slice(0, 80) : null,
        claimed ? String(claimed.name).slice(0, 80) : null,
        author.slice(0, 80),
        value.deleted ? 1 : 0,
      );
    this.changed(projectId);
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
      this.db
        .query("UPDATE board_tasks SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?")
        .run(next, Date.now(), task.id);
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
