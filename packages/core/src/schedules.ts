/** Scheduled work (plan.md Faz 9): say it once in plain words, it runs on time in its own copy. */

export type ScheduleWhen =
  | { kind: "once"; at: number }
  | {
      kind: "repeat";
      every: "hour" | "day" | "weekday" | "week" | "month";
      /** "09:00", local time. */
      time: string;
      /** 0 = Sunday … 6 = Saturday (for "week"). */
      weekday?: number;
      /** 1–28 (for "month"). */
      day?: number;
    };

export interface Schedule {
  id: string;
  projectId: string;
  title: string;
  /** What to do, as the team gets it. */
  request: string;
  /** Flow that runs it (task, check, deps, report, feature, fix, or the project's own). */
  flow: string;
  when: ScheduleWhen;
  /** "proposed": written from a sentence (or by an AI in chat) and waiting for your OK. */
  status: "proposed" | "active" | "paused" | "done";
  nextAt?: number;
  lastRunAt?: number;
  lastRunId?: string;
  /** Times it should have run while this computer was off; you decide whether to run it now. */
  missedAt?: number;
  /** Stop the run after this many minutes. */
  maxMinutes: number;
  /** Most steps each AI step may take. */
  maxTurns: number;
  /** The sentence it came from. */
  sentence?: string;
  /** "Every Friday 09:00, Project X: …" in the user's language. */
  summary?: string;
  createdAt: number;
}

export interface ScheduleTemplate {
  id: "nightly-check" | "weekly-deps" | "daily-report";
  flow: string;
  when: ScheduleWhen;
}

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  { id: "nightly-check", flow: "check", when: { kind: "repeat", every: "day", time: "02:00" } },
  { id: "weekly-deps", flow: "deps", when: { kind: "repeat", every: "week", time: "09:00", weekday: 5 } },
  { id: "daily-report", flow: "report", when: { kind: "repeat", every: "weekday", time: "08:30" } },
];

function at(base: Date, time: string): Date {
  const [h, m] = time.split(":").map((x) => Number(x));
  const d = new Date(base);
  d.setHours(Number.isFinite(h) ? (h as number) : 9, Number.isFinite(m) ? (m as number) : 0, 0, 0);
  return d;
}

/** The next time a schedule should run after `from` (local time). */
export function nextRun(when: ScheduleWhen, from: number): number | undefined {
  if (when.kind === "once") return when.at > from ? when.at : undefined;
  const now = new Date(from);
  if (when.every === "hour") {
    const [, m] = when.time.split(":").map(Number);
    const d = new Date(now);
    d.setMinutes(Number.isFinite(m) ? (m as number) : 0, 0, 0);
    if (d.getTime() <= from) d.setHours(d.getHours() + 1);
    return d.getTime();
  }
  for (let i = 0; i < 400; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const candidate = at(day, when.time);
    if (candidate.getTime() <= from) continue;
    const wd = candidate.getDay();
    if (when.every === "weekday" && (wd === 0 || wd === 6)) continue;
    if (when.every === "week" && wd !== (when.weekday ?? 1)) continue;
    if (when.every === "month" && candidate.getDate() !== (when.day ?? 1)) continue;
    return candidate.getTime();
  }
  return undefined;
}
