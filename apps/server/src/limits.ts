import type { Database } from "bun:sqlite";
import type { LimitForecast, LimitsOverview, RateLimitInfo } from "@godeye/core";
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
