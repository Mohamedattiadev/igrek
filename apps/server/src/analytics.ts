import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import type { AnalyticsSource, AnalyticsSummary } from "@godeye/core";
import type { AppErrors } from "./apperrors";
import type { Databases } from "./databases";

const DAY = 86_400_000;
const MAX_PER_MINUTE = 600;
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * Product analytics (plan.md 12), only what a PM needs to decide: how many users, how many come
 * back, which features they use. Events come from the app with the same project key as errors;
 * user ids are hashed with that key before they are stored, so no id is kept. Sign-ups can be
 * counted straight from a table in the project's database (read-only query, counts only).
 */
export class Analytics {
  private rate = new Map<string, { minute: number; n: number }>();

  constructor(
    private readonly db: Database,
    private readonly errors: AppErrors,
    private readonly databases: Databases,
    private readonly now: () => number = Date.now,
  ) {}

  /** One event or a batch: {event, user?} or {events: [{event, user?}]}. */
  ingest(key: string, body: unknown): boolean {
    const projectId = this.errors.projectForKey(key);
    if (!projectId) return false;
    const input = (body ?? {}) as { event?: unknown; user?: unknown; events?: { event?: unknown; user?: unknown }[] };
    const events = (Array.isArray(input.events) ? input.events : [input]).slice(0, 50);
    const minute = Math.floor(this.now() / 60_000);
    const r = this.rate.get(key);
    const n = r && r.minute === minute ? r.n : 0;
    if (n + events.length > MAX_PER_MINUTE) return false;
    this.rate.set(key, { minute, n: n + events.length });
    const today = day(this.now());
    let stored = 0;
    for (const e of events) {
      const name = String(e.event ?? "")
        .trim()
        .slice(0, 60);
      if (!/^[\w.:/ -]{1,60}$/.test(name)) continue;
      this.db
        .query(
          "INSERT INTO app_events_daily (project_id, day, event, count) VALUES (?, ?, ?, 1) ON CONFLICT DO UPDATE SET count = count + 1",
        )
        .run(projectId, today, name);
      if (e.user !== undefined && e.user !== null && String(e.user)) {
        const hash = createHash("sha256")
          .update(`${key}:${String(e.user)}`)
          .digest("hex")
          .slice(0, 20);
        this.db
          .query("INSERT OR IGNORE INTO app_users_daily (project_id, day, user_hash) VALUES (?, ?, ?)")
          .run(projectId, today, hash);
      }
      stored++;
    }
    // Keep about a year and a half of daily counts.
    if (Math.random() < 0.01) {
      const cutoff = day(this.now() - 550 * DAY);
      this.db.query("DELETE FROM app_events_daily WHERE day < ?").run(cutoff);
      this.db.query("DELETE FROM app_users_daily WHERE day < ?").run(cutoff);
    }
    return stored > 0;
  }

  source(projectId: string): AnalyticsSource | undefined {
    const row = this.db.query("SELECT data FROM analytics_sources WHERE project_id = ?").get(projectId) as {
      data: string;
    } | null;
    return row ? (JSON.parse(row.data) as AnalyticsSource) : undefined;
  }

  setSource(projectId: string, source: AnalyticsSource | null): void {
    if (!source) {
      this.db.query("DELETE FROM analytics_sources WHERE project_id = ?").run(projectId);
      return;
    }
    if (!/^[\w$.-]{1,64}$/.test(source.table) || !/^[\w$-]{1,64}$/.test(source.createdColumn))
      throw new Error("Unknown table or column");
    this.databases.get(source.connectionId);
    this.db
      .query(
        "INSERT INTO analytics_sources (project_id, data) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET data = excluded.data",
      )
      .run(projectId, JSON.stringify(source));
  }

  private async users(source: AnalyticsSource): Promise<NonNullable<AnalyticsSummary["users"]>> {
    const conn = this.databases.get(source.connectionId);
    const q = (s: string) => (conn.kind === "mysql" ? `\`${s}\`` : `"${s}"`);
    const t = source.table.split(".").map(q).join(".");
    const c = q(source.createdColumn);
    const now = this.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    // Plain counts; one query each so they work the same on SQLite, PostgreSQL and MySQL.
    const count = async (where: string) => {
      const r = await this.databases.query(conn.id, `SELECT count(*) AS n FROM ${t}${where ? ` WHERE ${where}` : ""}`);
      return Number(r.rows[0]?.[0] ?? 0);
    };
    try {
      // Times can be stored as text (ISO, "2026-10-01 12:00:00") or as numbers (seconds or milliseconds).
      const sample = (await this.databases.query(conn.id, `SELECT ${c} FROM ${t} WHERE ${c} IS NOT NULL LIMIT 1`))
        .rows[0]?.[0];
      const numeric = typeof sample === "number" || (typeof sample === "string" && /^\d{9,13}$/.test(sample));
      const scale = numeric && Number(sample) < 1e11 ? 1000 : 1;
      const between = (from: number, to: number) =>
        numeric
          ? `${c} >= ${Math.floor(from / scale)} AND ${c} < ${Math.floor(to / scale)}`
          : `${c} >= '${iso(from)}' AND ${c} < '${iso(to)}'`;
      const [total, last7, previous7] = await Promise.all([
        count(""),
        count(between(now - 7 * DAY, now + DAY)),
        count(between(now - 14 * DAY, now - 7 * DAY)),
      ]);
      const weekly: { week: string; count: number }[] = [];
      for (let w = 7; w >= 0; w--) {
        const to = now - w * 7 * DAY;
        weekly.push({ week: day(to - 7 * DAY), count: await count(between(to - 7 * DAY, to)) });
      }
      return { total, last7, previous7, weekly };
    } catch (err) {
      return { total: 0, last7: 0, previous7: 0, weekly: [], error: (err as Error).message.slice(0, 200) };
    }
  }

  async summary(projectId: string): Promise<AnalyticsSummary> {
    const now = this.now();
    const since = (days: number) => day(now - days * DAY);
    const distinct = (from: string) =>
      (
        this.db
          .query("SELECT count(DISTINCT user_hash) AS n FROM app_users_daily WHERE project_id = ? AND day >= ?")
          .get(projectId, from) as {
          n: number;
        }
      ).n;
    const daily = this.db
      .query(
        "SELECT day, count(*) AS users FROM app_users_daily WHERE project_id = ? AND day >= ? GROUP BY day ORDER BY day",
      )
      .all(projectId, since(29)) as { day: string; users: number }[];
    const anyUsers =
      (this.db.query("SELECT 1 FROM app_users_daily WHERE project_id = ? LIMIT 1").get(projectId) as unknown) !== null;
    const sum = (from: string, to: string) =>
      new Map(
        (
          this.db
            .query(
              "SELECT event, sum(count) AS n FROM app_events_daily WHERE project_id = ? AND day >= ? AND day < ? GROUP BY event",
            )
            .all(projectId, from, to) as { event: string; n: number }[]
        ).map((r) => [r.event, r.n]),
      );
    const tomorrow = day(now + DAY);
    const last = sum(since(6), tomorrow);
    const prev = sum(since(13), since(6));
    const events = [...new Set([...last.keys(), ...prev.keys()])]
      .map((event) => ({ event, last7: last.get(event) ?? 0, previous7: prev.get(event) ?? 0 }))
      .sort((a, b) => b.last7 - a.last7)
      .slice(0, 20);
    const source = this.source(projectId);
    return {
      ...(source ? { source, users: await this.users(source) } : {}),
      ...(anyUsers
        ? { active: { day: distinct(since(0)), week: distinct(since(6)), month: distinct(since(29)), daily } }
        : {}),
      events,
    };
  }

  /** What the PM persona gets: numbers only, no user data. */
  draft(s: AnalyticsSummary, projectName: string): string {
    const lines = [`Product numbers for "${projectName}":`];
    if (s.users && !s.users.error)
      lines.push(
        `- Users in the database: ${s.users.total}; new in the last 7 days: ${s.users.last7} (previous 7 days: ${s.users.previous7})`,
        `- New users per week (oldest first): ${s.users.weekly.map((w) => w.count).join(", ")}`,
      );
    if (s.active)
      lines.push(`- Active users: today ${s.active.day}, last 7 days ${s.active.week}, last 30 days ${s.active.month}`);
    if (s.events.length) {
      lines.push("- Most used features (last 7 days, previous 7 days):");
      for (const e of s.events.slice(0, 12)) lines.push(`  - ${e.event}: ${e.last7} (${e.previous7})`);
    }
    return lines.join("\n");
  }
}
