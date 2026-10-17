import type { Database } from "bun:sqlite";
import { type CalendarItem, nextRun } from "@godeye/core";
import { type BackupJobs, nextBackupAt } from "./backup-jobs";
import type { Monitors } from "./monitors";
import type { Schedules } from "./schedules";

const MAX_PER_SOURCE = 200;

/**
 * Calendar (plan.md 12): scheduled work and backups (when they will run), deploys and team runs
 * (when they happened), certificate and domain expiry, and your own deadlines and milestones.
 * Nothing is stored twice: everything except your own events is read from where it lives.
 */
export class Calendar {
  constructor(
    private readonly db: Database,
    private readonly schedules: Schedules,
    private readonly backups: BackupJobs,
    private readonly monitors: Monitors,
  ) {}

  items(from: number, to: number, projectId?: string): CalendarItem[] {
    const out: CalendarItem[] = [];
    const now = Date.now();
    for (const s of this.schedules.list()) {
      if (s.status !== "active" || (projectId && s.projectId !== projectId)) continue;
      let at = nextRun(s.when, Math.max(from, now) - 1);
      for (let n = 0; at !== undefined && at <= to && n < MAX_PER_SOURCE; n++) {
        if (at >= from)
          out.push({
            id: `schedule:${s.id}:${at}`,
            kind: "schedule",
            title: s.title,
            at,
            projectId: s.projectId,
            link: "/schedules",
          });
        at = nextRun(s.when, at + 60_000);
      }
    }
    for (const job of this.backups.list()) {
      if (projectId && job.projectId !== projectId) continue;
      let at = nextBackupAt(job, Math.max(from, now) - 1);
      for (let n = 0; at !== undefined && at <= to && n < MAX_PER_SOURCE; n++) {
        if (at >= from)
          out.push({
            id: `backup:${job.id}:${at}`,
            kind: "backup",
            title: job.name,
            at,
            ...(job.projectId ? { projectId: job.projectId } : {}),
            link: "/tools?tab=backups",
          });
        at = nextBackupAt(job, at + 60_000);
      }
    }
    const deploys = this.db
      .query(
        `SELECT d.id, d.project_id, d.at, d.exit_code, e.name AS env, p.name AS project FROM deploys d
         LEFT JOIN project_envs e ON e.id = d.env_id LEFT JOIN projects p ON p.id = d.project_id
         WHERE d.at BETWEEN ? AND ? ${projectId ? "AND d.project_id = ?" : ""} ORDER BY d.at LIMIT ?`,
      )
      .all(...[from, to, ...(projectId ? [projectId] : []), MAX_PER_SOURCE]) as {
      id: string;
      project_id: string;
      at: number;
      exit_code: number;
      env: string | null;
      project: string | null;
    }[];
    for (const d of deploys)
      out.push({
        id: `deploy:${d.id}`,
        kind: "deploy",
        title: `${d.project ?? ""} → ${d.env ?? ""}`,
        at: d.at,
        projectId: d.project_id,
        ok: d.exit_code === 0,
        link: `/p/${d.project_id}?tab=environments`,
      });
    const runs = this.db
      .query(
        `SELECT id, project_id, data, created_at FROM flow_runs WHERE created_at BETWEEN ? AND ? ${projectId ? "AND project_id = ?" : ""} ORDER BY created_at LIMIT ?`,
      )
      .all(...[from, to, ...(projectId ? [projectId] : []), MAX_PER_SOURCE]) as {
      id: string;
      project_id: string;
      data: string;
      created_at: number;
    }[];
    for (const r of runs) {
      const run = JSON.parse(r.data) as { request?: string; status?: string };
      out.push({
        id: `run:${r.id}`,
        kind: "run",
        title: (run.request ?? "").split("\n")[0]?.slice(0, 80) ?? "",
        at: r.created_at,
        projectId: r.project_id,
        ...(run.status === "merged" ? { ok: true } : run.status === "failed" ? { ok: false } : {}),
        link: `/runs/${r.id}`,
      });
    }
    for (const d of this.monitors.domains()) {
      if (projectId && d.projectId !== projectId) continue;
      if (d.certExpires && d.certExpires >= from && d.certExpires <= to)
        out.push({
          id: `cert:${d.id}`,
          kind: "cert",
          title: d.host,
          at: d.certExpires,
          ...(d.projectId ? { projectId: d.projectId } : {}),
          link: "/tools?tab=domains",
        });
      if (d.domainExpires && d.domainExpires >= from && d.domainExpires <= to)
        out.push({
          id: `domain:${d.id}`,
          kind: "domain",
          title: d.registrable ?? d.host,
          at: d.domainExpires,
          ...(d.projectId ? { projectId: d.projectId } : {}),
          link: "/tools?tab=domains",
        });
    }
    const own = this.db
      .query(
        `SELECT * FROM calendar_events WHERE at BETWEEN ? AND ? ${projectId ? "AND project_id = ?" : ""} ORDER BY at`,
      )
      .all(...[from, to, ...(projectId ? [projectId] : [])]) as {
      id: string;
      kind: CalendarItem["kind"];
      title: string;
      at: number;
      project_id: string | null;
    }[];
    for (const e of own)
      out.push({
        id: e.id,
        kind: e.kind,
        title: e.title,
        at: e.at,
        ...(e.project_id ? { projectId: e.project_id, link: `/p/${e.project_id}` } : {}),
        own: true,
      });
    return out.sort((a, b) => a.at - b.at);
  }

  add(input: { kind?: string; title?: string; at?: number; projectId?: string }): CalendarItem {
    const kind = ["deadline", "milestone", "note"].includes(String(input.kind))
      ? (input.kind as "deadline")
      : "deadline";
    const title = String(input.title ?? "")
      .trim()
      .slice(0, 140);
    if (!title) throw new Error("Write what it is");
    const at = Number(input.at);
    if (!Number.isFinite(at) || at <= 0) throw new Error("Pick a date");
    const id = `ev-${crypto.randomUUID().slice(0, 10)}`;
    this.db
      .query("INSERT INTO calendar_events (id, kind, title, at, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, kind, title, at, input.projectId || null, Date.now());
    return { id, kind, title, at, ...(input.projectId ? { projectId: input.projectId } : {}), own: true };
  }

  setDone(id: string, done: boolean): void {
    this.db.query("UPDATE calendar_events SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
  }

  remove(id: string): void {
    this.db.query("DELETE FROM calendar_events WHERE id = ?").run(id);
  }
}
