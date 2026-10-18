import type { Database } from "bun:sqlite";
import type { LimitForecast, LimitsOverview, MonthlyReport, RateLimitInfo } from "@igrek/core";
import type { Accounts } from "./accounts";

const DAY = 24 * 60 * 60_000;

/** Tokens that cost real work: fresh input, output, and what was written to the cache. */
const WEIGHT = "(u.input + u.output + u.cache_write)";

function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Pace inside the current 5-hour window: if usage keeps growing at the rate seen
 * in the snapshots, when does it hit 100%? Only answered when it would happen
 * before the window resets (plan.md 3.2).
 */
export function forecast(history: RateLimitInfo[], now = Date.now()): LimitForecast | undefined {
  const last = history.at(-1);
  if (!last?.fiveHour || !last.fiveHourResetsAt || last.fiveHourResetsAt < now) return undefined;
  const window = history.filter((h) => h.fiveHourResetsAt === last.fiveHourResetsAt && h.fiveHour !== undefined);
  const first = window[0];
  if (!first || first === last || last.at - first.at < 5 * 60_000) return undefined;
  const perMs = ((last.fiveHour ?? 0) - (first.fiveHour ?? 0)) / (last.at - first.at);
  if (perMs <= 0) return { perHour: 0 };
  const fullAt = last.at + (1 - last.fiveHour) / perMs;
  return { perHour: perMs * 3_600_000, fullAt: fullAt < last.fiveHourResetsAt ? fullAt : undefined };
}

export function limitsOverview(db: Database, accounts: Accounts, now = Date.now()): LimitsOverview {
  const since = now - 14 * DAY;
  const rows = db
    .query(
      `SELECT u.ts, u.project_id, ${WEIGHT} AS tokens, p.name AS project FROM usage u
       LEFT JOIN projects p ON p.id = u.project_id WHERE u.ts >= ?`,
    )
    .all(since) as { ts: number; project_id: string | null; tokens: number; project: string | null }[];

  const days = new Map<string, { day: string; total: number; byProject: Record<string, number> }>();
  for (let i = 13; i >= 0; i--) {
    const day = localDay(now - i * DAY);
    days.set(day, { day, total: 0, byProject: {} });
  }
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
  let total = 0;
  for (const row of rows) {
    const bucket = days.get(localDay(row.ts));
    if (bucket) {
      bucket.total += row.tokens;
      const name = row.project ?? "—";
      bucket.byProject[name] = (bucket.byProject[name] ?? 0) + row.tokens;
    }
    const hour = hours[new Date(row.ts).getHours()];
    if (hour) hour.tokens += row.tokens;
    total += row.tokens;
  }

  const projects = (
    db
      .query(
        `SELECT COALESCE(u.project_id, '') AS key, COALESCE(p.name, '—') AS label, SUM(${WEIGHT}) AS tokens
         FROM usage u LEFT JOIN projects p ON p.id = u.project_id WHERE u.ts >= ? GROUP BY u.project_id
         ORDER BY tokens DESC LIMIT 12`,
      )
      .all(since) as { key: string; label: string; tokens: number }[]
  ).filter((r) => r.tokens > 0);

  const models = (
    db
      .query(
        `SELECT COALESCE(u.model, '') AS key, COALESCE(u.model, '—') AS label, SUM(${WEIGHT}) AS tokens
         FROM usage u WHERE u.ts >= ? GROUP BY u.model ORDER BY tokens DESC LIMIT 8`,
      )
      .all(since) as { key: string; label: string; tokens: number }[]
  ).filter((r) => r.tokens > 0);

  // Sessions that ran as a persona (plan.md 1.4: by persona); label is the persona id, translated in the UI.
  const personas = (
    db
      .query(
        `SELECT ps.persona_id AS key, ps.persona_id AS label, SUM(${WEIGHT}) AS tokens
         FROM usage u JOIN persona_sessions ps ON ps.session_id = u.session_id WHERE u.ts >= ?
         GROUP BY ps.persona_id ORDER BY tokens DESC LIMIT 10`,
      )
      .all(since) as { key: string; label: string; tokens: number }[]
  ).filter((r) => r.tokens > 0);

  const sessions = db
    .query(
      `SELECT u.session_id AS key, COALESCE(s.title, s.first_prompt, u.session_id) AS label, s.project_id AS projectId,
              SUM(${WEIGHT}) AS tokens
       FROM usage u LEFT JOIN sessions s ON s.id = u.session_id WHERE u.ts >= ?
       GROUP BY u.session_id ORDER BY tokens DESC LIMIT 10`,
    )
    .all(since) as { key: string; label: string; projectId: string | null; tokens: number }[];

  return {
    accounts: accounts.list().map((account) => {
      const history = accounts.limitHistory(account.id, now - 7 * DAY);
      return { ...account, history, forecast: forecast(history, now) };
    }),
    days: [...days.values()],
    projects,
    models,
    personas,
    sessions: sessions.map((s) => ({ ...s, label: s.label.length > 80 ? `${s.label.slice(0, 80)}…` : s.label })),
    hours,
    total,
  };
}

/** Accounts at or above 80% of their 5-hour or weekly limit, for warnings. */
export function limitAlerts(
  accounts: Accounts,
  now = Date.now(),
): { accountId: string; label: string; window: "fiveHour" | "week"; value: number; resetsAt?: number }[] {
  const alerts: { accountId: string; label: string; window: "fiveHour" | "week"; value: number; resetsAt?: number }[] =
    [];
  for (const account of accounts.list()) {
    const limit = account.rateLimit;
    if (!limit) continue;
    if ((limit.fiveHour ?? 0) >= 0.8 && (limit.fiveHourResetsAt ?? 0) > now) {
      alerts.push({
        accountId: account.id,
        label: account.label,
        window: "fiveHour",
        value: limit.fiveHour ?? 0,
        resetsAt: limit.fiveHourResetsAt,
      });
    }
    if ((limit.week ?? 0) >= 0.8 && (limit.weekResetsAt ?? 0) > now) {
      alerts.push({
        accountId: account.id,
        label: account.label,
        window: "week",
        value: limit.week ?? 0,
        resetsAt: limit.weekResetsAt,
      });
    }
  }
  return alerts;
}

/** Month-by-month totals for the report (plan.md 3.2): tokens per month, split by model and project. */
export function monthlyReport(db: Database, months = 6, now = Date.now()): MonthlyReport[] {
  const start = new Date(now);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const rows = db
    .query(
      `SELECT strftime('%Y-%m', u.ts / 1000, 'unixepoch') AS month, u.model, u.project_id, p.name AS project,
              SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read, SUM(u.cache_write) AS cache_write,
              COUNT(DISTINCT u.session_id) AS sessions
       FROM usage u LEFT JOIN projects p ON p.id = u.project_id
       WHERE u.ts >= ? GROUP BY month, u.model, u.project_id`,
    )
    .all(start.getTime()) as {
    month: string;
    model: string | null;
    project_id: string | null;
    project: string | null;
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    sessions: number;
  }[];
  const byMonth = new Map<string, MonthlyReport>();
  for (const r of rows) {
    let m = byMonth.get(r.month);
    if (!m) {
      m = { month: r.month, tokens: 0, input: 0, output: 0, cacheRead: 0, sessions: 0, models: {}, projects: [] };
      byMonth.set(r.month, m);
    }
    const tokens = r.input + r.output + r.cache_read + r.cache_write;
    m.tokens += tokens;
    m.input += r.input;
    m.output += r.output;
    m.cacheRead += r.cache_read;
    m.sessions += r.sessions;
    const model = r.model ?? "unknown";
    m.models[model] = (m.models[model] ?? 0) + tokens;
    const existing = m.projects.find((p) => p.id === (r.project_id ?? ""));
    if (existing) existing.tokens += tokens;
    else m.projects.push({ id: r.project_id ?? "", name: r.project ?? "—", tokens });
  }
  for (const m of byMonth.values()) m.projects = m.projects.sort((a, b) => b.tokens - a.tokens).slice(0, 8);
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}
