import type { Database } from "bun:sqlite";
import {
  histogramQuantile,
  normalizeRoute,
  type PageVitals,
  PERF_BUCKETS,
  type RoutePerf,
  VITALS,
  type VitalName,
  vitalOf,
} from "@godeye/core";
import type { AppErrors } from "./apperrors";

const DAY = 86_400_000;
const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * Simple performance monitoring (plan.md 13.4): the app's server times each request and sends
 * {route, ms, status} with the project's key (a middleware of a few lines). Stored per endpoint
 * and day as a small histogram, so p50 and p95 are known without keeping every request.
 */
export class Perf {
  private rate = new Map<string, { minute: number; n: number }>();

  constructor(
    private readonly db: Database,
    private readonly errors: AppErrors,
    private readonly now: () => number = Date.now,
  ) {}

  ingest(key: string, body: unknown): boolean {
    const projectId = this.errors.projectForKey(key);
    if (!projectId) return false;
    const input = (body ?? {}) as {
      route?: unknown;
      method?: unknown;
      ms?: unknown;
      status?: unknown;
      events?: unknown[];
    };
    const events = (Array.isArray(input.events) ? input.events : [input]).slice(0, 200) as (typeof input)[];
    const minute = Math.floor(this.now() / 60_000);
    const r = this.rate.get(key);
    const n = r && r.minute === minute ? r.n : 0;
    if (n + events.length > 6000) return false;
    this.rate.set(key, { minute, n: n + events.length });
    const today = day(this.now());
    let stored = 0;
    for (const e of events) {
      const ms = Number(e.ms);
      if (!Number.isFinite(ms) || ms < 0 || ms > 600_000) continue;
      const method = /^[A-Z]{3,7}$/.test(String(e.method ?? "")) ? `${e.method} ` : "";
      const route = `${method}${normalizeRoute(String(e.route ?? "/"))}`;
      const bucket = PERF_BUCKETS.findIndex((b) => ms <= b);
      const row = this.db
        .query("SELECT buckets FROM app_perf WHERE project_id = ? AND day = ? AND route = ?")
        .get(projectId, today, route) as {
        buckets: string;
      } | null;
      const buckets = row ? (JSON.parse(row.buckets) as number[]) : PERF_BUCKETS.map(() => 0);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      this.db
        .query(
          `INSERT INTO app_perf (project_id, day, route, count, total_ms, errors, buckets) VALUES (?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT DO UPDATE SET count = count + 1, total_ms = total_ms + excluded.total_ms, errors = errors + excluded.errors, buckets = excluded.buckets`,
        )
        .run(projectId, today, route, ms, Number(e.status) >= 500 ? 1 : 0, JSON.stringify(buckets));
      stored++;
    }
    return stored > 0;
  }

  /** Endpoints over the last `days`, slowest (p95) first, with the period before for comparison. */
  summary(projectId: string, days = 7): RoutePerf[] {
    const rows = (from: number, to: number) =>
      this.db
        .query(
          "SELECT route, count, total_ms, errors, buckets FROM app_perf WHERE project_id = ? AND day >= ? AND day < ?",
        )
        .all(projectId, day(from), day(to)) as {
        route: string;
        count: number;
        total_ms: number;
        errors: number;
        buckets: string;
      }[];
    const fold = (list: ReturnType<typeof rows>) => {
      const out = new Map<string, { count: number; total: number; errors: number; buckets: number[] }>();
      for (const r of list) {
        const e = out.get(r.route) ?? { count: 0, total: 0, errors: 0, buckets: PERF_BUCKETS.map(() => 0) };
        e.count += r.count;
        e.total += r.total_ms;
        e.errors += r.errors;
        (JSON.parse(r.buckets) as number[]).forEach((n, i) => {
          e.buckets[i] = (e.buckets[i] ?? 0) + n;
        });
        out.set(r.route, e);
      }
      return out;
    };
    const now = this.now();
    const current = fold(rows(now - (days - 1) * DAY, now + DAY));
    const before = fold(rows(now - (2 * days - 1) * DAY, now - (days - 1) * DAY));
    return [...current]
      .map(([route, e]) => ({
        route,
        count: e.count,
        p50: histogramQuantile(e.buckets, 0.5),
        p95: histogramQuantile(e.buckets, 0.95),
        avg: Math.round(e.total / e.count),
        errors: e.errors,
        ...(before.get(route) ? { previousP95: histogramQuantile(before.get(route)?.buckets ?? [], 0.95) } : {}),
      }))
      .sort((a, b) => b.p95 - a.p95 || b.count - a.count)
      .slice(0, 50);
  }

  /** One page view's vitals from the browser SDK: LCP and INP in ms, CLS as a plain number. */
  ingestVitals(key: string, body: unknown): boolean {
    const projectId = this.errors.projectForKey(key);
    if (!projectId) return false;
    const input = (body ?? {}) as Record<string, unknown>;
    const page = normalizeRoute(String(input.page ?? "/")).slice(0, 200);
    const today = day(this.now());
    const existing = new Map(
      (
        this.db
          .query("SELECT metric, buckets FROM app_vitals WHERE project_id = ? AND day = ? AND page = ?")
          .all(projectId, today, page) as { metric: string; buckets: string }[]
      ).map((r) => [r.metric, JSON.parse(r.buckets) as number[]]),
    );
    let stored = 0;
    for (const name of Object.keys(VITALS) as VitalName[]) {
      const raw = Number(input[name]);
      const value = name === "cls" ? raw * 1000 : raw;
      // No layout shift at all (CLS 0) is the best result; LCP or INP of 0 means it was not measured.
      if (!Number.isFinite(value) || value < 0 || (value === 0 && name !== "cls") || value > 600_000) continue;
      const edges = VITALS[name].buckets;
      const buckets = existing.get(name) ?? edges.map(() => 0);
      const i = edges.findIndex((edge) => value <= edge);
      buckets[i] = (buckets[i] ?? 0) + 1;
      this.db
        .query(
          `INSERT INTO app_vitals (project_id, day, page, metric, buckets) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT DO UPDATE SET buckets = excluded.buckets`,
        )
        .run(projectId, today, page, name, JSON.stringify(buckets));
      stored++;
    }
    return stored > 0;
  }

  /** Pages with the most visits over the last `days`, each metric at its 75th percentile. */
  vitals(projectId: string, days = 28): PageVitals[] {
    const rows = this.db
      .query("SELECT page, metric, buckets FROM app_vitals WHERE project_id = ? AND day >= ?")
      .all(projectId, day(this.now() - (days - 1) * DAY)) as { page: string; metric: VitalName; buckets: string }[];
    const sums = new Map<string, Partial<Record<VitalName, number[]>>>();
    for (const r of rows) {
      if (!(r.metric in VITALS)) continue;
      const page = sums.get(r.page) ?? {};
      const add = JSON.parse(r.buckets) as number[];
      page[r.metric] = add.map((n, i) => n + (page[r.metric]?.[i] ?? 0));
      sums.set(r.page, page);
    }
    return [...sums]
      .map(([page, m]) => ({
        page,
        ...(m.lcp ? { lcp: vitalOf("lcp", m.lcp) } : {}),
        ...(m.inp ? { inp: vitalOf("inp", m.inp) } : {}),
        ...(m.cls ? { cls: vitalOf("cls", m.cls) } : {}),
      }))
      .sort((a, b) => (b.lcp?.samples ?? 0) - (a.lcp?.samples ?? 0))
      .slice(0, 20);
  }
}
