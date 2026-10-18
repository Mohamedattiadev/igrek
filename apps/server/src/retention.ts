import type { Database } from "bun:sqlite";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Flows } from "./flows";

const DAY = 86_400_000;

/** Bytes of a folder, without following links. */
function folderSize(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st) return 0;
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of readdirSync(path, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    total += e.isDirectory()
      ? folderSize(join(path, e.name))
      : (statSync(join(path, e.name), { throwIfNoEntry: false })?.size ?? 0);
  }
  return total;
}

export interface DiskUsage {
  total: number;
  parts: { key: string; bytes: number }[];
  sessions: number;
  messages: number;
  /** Sessions whose transcript copy could be dropped with the current setting. */
  prunable: number;
}

/**
 * Data retention (plan.md 13.6): what Igrek keeps on disk, and keeping it small. Only God
 * Eye's own copies are removed: old transcript copies (summaries and numbers stay; your AI
 * tools' own files are untouched, so a session can be read again), copies of finished team
 * runs, and old screenshots.
 */
export class Retention {
  constructor(
    private readonly db: Database,
    private readonly dataDir: string,
    private readonly flows: Flows,
    private readonly now: () => number = Date.now,
  ) {}

  usage(days: number): DiskUsage {
    const parts = [
      "igrek.db",
      "models",
      "worktrees",
      "backups",
      "library",
      "preview",
      "launch-shots",
      "testers",
      "env-backups",
      "trash",
      "plugins",
    ].map((key) => ({
      key,
      bytes:
        key === "igrek.db"
          ? folderSize(join(this.dataDir, key)) + folderSize(join(this.dataDir, `${key}-wal`))
          : folderSize(join(this.dataDir, key)),
    }));
    const count = (sql: string, ...args: (string | number)[]) => (this.db.query(sql).get(...args) as { n: number }).n;
    return {
      total: parts.reduce((s, p) => s + p.bytes, 0),
      parts: parts.filter((p) => p.bytes > 0).sort((a, b) => b.bytes - a.bytes),
      sessions: count("SELECT COUNT(*) AS n FROM sessions"),
      messages: count("SELECT COUNT(*) AS n FROM messages"),
      prunable: days ? this.oldSessions(days).length : 0,
    };
  }

  private oldSessions(days: number): string[] {
    const before = this.now() - days * DAY;
    return (
      this.db
        .query(
          `SELECT s.id FROM sessions s WHERE COALESCE(s.updated_at, s.started_at, 0) < ? AND s.summary IS NOT NULL
           AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id)`,
        )
        .all(before) as { id: string }[]
    ).map((r) => r.id);
  }

  /** Drops old transcript copies, leftover run copies and old screenshots; returns what it freed. */
  prune(days: number): { sessions: number; worktrees: number; shots: number; freed: number } {
    const before = this.usage(0).total;
    let sessions = 0;
    if (days > 0) {
      const ids = this.oldSessions(days);
      const del = this.db.query("DELETE FROM messages WHERE session_id = ?");
      this.db.transaction(() => {
        for (const id of ids) del.run(id);
      })();
      sessions = ids.length;
    }
    // Copies of team runs that are finished (merged, thrown away, done) are no longer needed.
    const live = new Set(
      this.flows
        .list()
        .filter((r) => ["running", "needs_you", "ready", "waiting_limit", "failed", "stopped"].includes(r.status))
        .map((r) => r.worktree?.path.split("/").pop() ?? ""),
    );
    let worktrees = 0;
    const wt = join(this.dataDir, "worktrees");
    if (existsSync(wt))
      for (const name of readdirSync(wt)) {
        if (live.has(name)) continue;
        const path = join(wt, name);
        const age = this.now() - (statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? this.now());
        if (age < DAY) continue;
        rmSync(path, { recursive: true, force: true });
        worktrees++;
      }
    let shots = 0;
    for (const folder of ["preview", "launch-shots"]) {
      const dir = join(this.dataDir, folder);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".png")) continue;
        const path = join(dir, name);
        if (this.now() - (statSync(path).mtimeMs ?? 0) > 30 * DAY) {
          rmSync(path, { force: true });
          shots++;
        }
      }
    }
    this.db.run("PRAGMA wal_checkpoint(TRUNCATE)");
    if (sessions) this.db.run("VACUUM");
    return { sessions, worktrees, shots, freed: Math.max(0, before - this.usage(0).total) };
  }
}
