import type { Database } from "bun:sqlite";
import type { TaskStatus } from "@igrek/core";
import type { Board } from "./board";

/** The mark a card's chat carries ("[#a1b2c3d4e5]"), put there by "Start" on the card. */
export const taskMark = (id: string) => `[#${id}]`;

/** No summary of the chat says anything is left: the work is ready to be looked at. */
function nothingLeft(summary: string): boolean {
  try {
    const texts = Object.values((JSON.parse(summary) as { texts?: Record<string, { left?: unknown[] }> }).texts ?? {});
    return texts.length > 0 && texts.every((t) => !t.left?.length);
  } catch {
    return false;
  }
}

/**
 * The board follows the work (plan.md, 26 Oct 2026), so nobody has to drag cards:
 * - a chat started from a card ("Start", which writes its mark into the first message) moves it to Doing;
 * - when that chat's summary has nothing left to do, it moves to Review;
 * - a commit whose message carries the card's mark moves it to Done.
 * Only the computer the card is worked on moves it (it has the chat); teammates get the move by sync.
 * Dragging by hand still works and always wins: only the next step is ever taken, never a step back.
 */
export class BoardAuto {
  constructor(
    private readonly db: Database,
    private readonly board: Board,
    /** Told of every move, so the card's chat thread can say it (index.ts wires it to the team chat). */
    private readonly moved: (taskId: string, status: TaskStatus) => void = () => undefined,
  ) {}

  tick(now = Date.now()): number {
    const moves: { id: string; status: TaskStatus; session?: string }[] = [];
    for (const r of this.db
      .query(
        `SELECT t.id, s.id AS session FROM board_tasks t
         JOIN sessions s ON s.project_id = t.project_id AND s.updated_at >= t.created_at
         WHERE t.deleted = 0 AND t.status = 'todo' AND t.session_id IS NULL
           AND instr(s.first_prompt, '[#' || t.id || ']') > 0`,
      )
      .all() as { id: string; session: string }[])
      moves.push({ id: r.id, status: "doing", session: r.session });
    // A summary is written a while after the last message; ten quiet minutes means the chat paused.
    for (const r of this.db
      .query(
        `SELECT t.id, s.summary FROM board_tasks t JOIN sessions s ON s.id = t.session_id
         WHERE t.deleted = 0 AND t.status = 'doing' AND s.summary IS NOT NULL AND s.updated_at < ?`,
      )
      .all(now - 10 * 60_000) as { id: string; summary: string }[])
      if (nothingLeft(r.summary)) moves.push({ id: r.id, status: "review" });
    for (const r of this.db
      .query(
        `SELECT DISTINCT t.id FROM board_tasks t
         JOIN commits c ON c.project_id = t.project_id AND c.at >= t.created_at
         WHERE t.deleted = 0 AND t.status IN ('doing', 'review') AND t.session_id IS NOT NULL AND instr(c.subject, '[#' || t.id || ']') > 0`,
      )
      .all() as { id: string }[])
      moves.push({ id: r.id, status: "done" });
    for (const m of moves) this.apply(m.id, m.status, m.session);
    return moves.length;
  }

  private apply(id: string, status: TaskStatus, session?: string): void {
    if (this.board.track(id, status, session)) this.moved(id, status);
  }
}
