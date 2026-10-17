import { type TimeReport, workBlocks } from "@godeye/core";
import type { Store } from "./store";

const localDay = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Time tracking (plan.md 13.2), with nothing to start or stop: every message of every AI session
 * has a time; messages close together are one work block, a gap of 15 minutes ends it. Parallel
 * sessions in the same project count once. It measures time with the AI, not all your work.
 */
export function timeReport(store: Store, from: number, to: number): TimeReport {
  const rows = store.activityTimes(from, to);
  const byProject = new Map<string, { times: number[]; sessions: Set<string> }>();
  for (const r of rows) {
    const entry = byProject.get(r.project_id) ?? { times: [], sessions: new Set<string>() };
    entry.times.push(r.ts);
    entry.sessions.add(r.session_id);
    byProject.set(r.project_id, entry);
  }
  const days = new Map<string, Record<string, number>>();
  const totals: TimeReport["totals"] = [];
  for (const [projectId, { times, sessions }] of byProject) {
    let total = 0;
    for (const block of workBlocks(times)) {
      const minutes = (block.end - block.start) / 60_000;
      total += minutes;
      const day = localDay(block.start);
      const entry = days.get(day) ?? {};
      entry[projectId] = Math.round(((entry[projectId] ?? 0) + minutes) * 10) / 10;
      days.set(day, entry);
    }
    totals.push({ projectId, minutes: Math.round(total), sessions: sessions.size });
  }
  const out: TimeReport["days"] = [];
  for (let at = from; at <= to; at += 86_400_000) {
    const day = localDay(at);
    if (!out.some((d) => d.day === day)) out.push({ day, minutes: days.get(day) ?? {} });
  }
  return { from, to, days: out, totals: totals.sort((a, b) => b.minutes - a.minutes) };
}
