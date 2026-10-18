import { type BoardTask, type CalendarItem, type FlowRun, sprintOf } from "@godeye/core";
import { Check, Diamond, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button, Card, field } from "../../components/ui";
import { cn } from "../../lib/cn";
import { calendarApi } from "../../lib/ops-api";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

const BAR: Record<string, string> = {
  todo: "bg-fg-subtle/40",
  doing: "bg-accent/70",
  review: "bg-warning/70",
  done: "bg-success/70",
  running: "bg-accent/70",
  needs_you: "bg-warning/70",
  ready: "bg-warning/70",
  merged: "bg-success/70",
  failed: "bg-danger/70",
};

/**
 * Roadmap (plan.md 13.2): milestones you set, the board's tasks and the team's runs on one
 * timeline (a simple Gantt), and the current two-week sprint with how much got done in the
 * last ones.
 */
export function Roadmap({ projectId, tasks, runs }: { projectId: string; tasks: BoardTask[]; runs: FlowRun[] }) {
  const { t, i18n } = useTranslation();
  const now = Date.now();
  // The window is fixed while the page is open: six weeks back, eight ahead.
  const [[from, to]] = useState(() => [now - 6 * WEEK, now + 8 * WEEK] as const);
  const [milestones, setMilestones] = useState<CalendarItem[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date(now + 14 * DAY).toISOString().slice(0, 10));
  const load = useCallback(
    () =>
      void calendarApi
        .items(from - 8 * WEEK, to + 16 * WEEK, projectId)
        .then((items) => setMilestones(items.filter((i) => i.kind === "milestone" || i.kind === "deadline")))
        .catch(() => undefined),
    [projectId, from, to],
  );
  useEffect(load, [load]);
  const x = (at: number) => `${Math.min(100, Math.max(0, ((at - from) / (to - from)) * 100))}%`;
  const width = (a: number, b: number) =>
    `${Math.max(0.8, ((Math.min(b, to) - Math.max(a, from)) / (to - from)) * 100)}%`;
  const weeks = useMemo(() => {
    const out: number[] = [];
    const monday = new Date(from);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    for (let at = monday.getTime(); at < to; at += WEEK) out.push(at);
    return out;
  }, [from, to]);
  const sprint = sprintOf(now);
  const pastSprints = [3, 2, 1].map((back) => sprintOf(now - back * 2 * WEEK));
  const doneIn = (s: { start: number; end: number }) =>
    tasks.filter((k) => k.status === "done" && k.updatedAt >= s.start && k.updatedAt <= s.end).length;
  const rows = [
    ...tasks.map((k) => ({
      id: `t${k.id}`,
      title: k.title,
      start: k.createdAt,
      end: k.status === "done" ? k.updatedAt : now,
      status: k.status,
      link: k.runId ? `/runs/${k.runId}` : undefined,
    })),
    ...runs
      .filter((r) => !r.taskId)
      .map((r) => ({
        id: `r${r.id}`,
        title: r.request.split("\n")[0] ?? "",
        start: r.createdAt,
        end: Math.max(r.updatedAt, r.createdAt + DAY / 4),
        status: r.status,
        link: `/runs/${r.id}`,
      })),
  ]
    .filter((r) => r.end >= from)
    .sort((a, b) => a.start - b.start)
    .slice(-30);
  const fmt = (at: number) => new Date(at).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <Card className="space-y-2 p-pad">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[13px] font-semibold">
              {t("roadmap.sprint", { start: fmt(sprint.start), end: fmt(sprint.end) })}
            </p>
            <span className="text-xs text-fg-muted">
              {t("roadmap.daysLeft", { count: Math.max(0, Math.ceil((sprint.end - now) / DAY)) })}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["todo", "doing", "review", "done"] as const).map((s) => (
              <div key={s} className="rounded-ui bg-bg-subtle p-2">
                <p className="text-lg font-semibold">
                  {s === "done" ? doneIn(sprint) : tasks.filter((k) => k.status === s).length}
                </p>
                <p className="text-[11px] text-fg-muted">
                  {s === "done" ? t("roadmap.doneThisSprint") : t(`board.col_${s}`)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            {t("roadmap.velocity", { list: pastSprints.map(doneIn).join(" → ") })}
          </p>
        </Card>
        <Card className="space-y-2 p-pad">
          <p className="text-[13px] font-semibold">{t("roadmap.milestones")}</p>
          <ul className="max-h-36 space-y-1 overflow-auto text-xs">
            {milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t("roadmap.toggle")}
                  onClick={() => void calendarApi.setDone(m.id, !m.done).then(load)}
                >
                  {m.done ? (
                    <Check size={13} className="text-success" aria-hidden="true" />
                  ) : (
                    <Diamond size={13} className={m.at < now ? "text-danger" : "text-accent"} aria-hidden="true" />
                  )}
                </button>
                <span className={cn("min-w-0 flex-1 truncate", m.done && "text-fg-subtle line-through")}>
                  {m.title}
                </span>
                <span className="text-fg-subtle">{fmt(m.at)}</span>
                <button
                  type="button"
                  aria-label={t("calendar.remove")}
                  onClick={() => void calendarApi.remove(m.id).then(load)}
                >
                  <Trash2 size={12} className="text-fg-subtle" aria-hidden="true" />
                </button>
              </li>
            ))}
            {!milestones.length && <li className="text-fg-subtle">{t("roadmap.noMilestones")}</li>}
          </ul>
          <form
            className="flex gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!title.trim()) return;
              await calendarApi.add({
                kind: "milestone",
                title,
                at: new Date(`${date}T12:00:00`).getTime(),
                projectId,
              });
              setTitle("");
              load();
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("roadmap.milestone")}
              aria-label={t("roadmap.milestone")}
              className={cn(field, "h-7 min-w-0 flex-1 text-xs")}
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label={t("calendar.time")}
              className={cn(field, "h-7 text-xs")}
            />
            <Button size="sm" type="submit" icon={Plus} aria-label={t("roadmap.add")} />
          </form>
        </Card>
      </div>
      <Card className="overflow-x-auto p-pad">
        <div className="min-w-[720px]">
          <div className="relative h-5 border-b border-border text-[10px] text-fg-subtle">
            {weeks.map((w) => (
              <span key={w} className="absolute top-0 -translate-x-1/2" style={{ left: x(w) }}>
                {fmt(w)}
              </span>
            ))}
          </div>
          <div className="relative">
            {weeks.map((w) => (
              <div key={w} className="absolute inset-y-0 border-s border-border/60" style={{ left: x(w) }} />
            ))}
            {[sprint.start, sprint.end].map((at) => (
              <div
                key={at}
                className="absolute inset-y-0 border-s border-dashed border-accent/60"
                style={{ left: x(at) }}
              />
            ))}
            <div className="absolute inset-y-0 border-s-2 border-danger/70" style={{ left: x(now) }} />
            <div className="relative h-7">
              {milestones
                .filter((m) => m.at >= from && m.at <= to)
                .map((m) => (
                  <span
                    key={m.id}
                    data-tip={`${m.title} · ${fmt(m.at)}`}
                    className="absolute top-1.5 -translate-x-1/2"
                    style={{ left: x(m.at) }}
                  >
                    <Diamond
                      size={14}
                      className={m.done ? "fill-success text-success" : "fill-accent text-accent"}
                      aria-label={m.title}
                    />
                  </span>
                ))}
            </div>
            {rows.map((r) => (
              <div key={r.id} className="relative h-6">
                {r.link ? (
                  <Link
                    to={r.link}
                    aria-label={r.title}
                    data-tip={`${r.title} · ${fmt(r.start)} → ${fmt(r.end)} · ${t(`roadmap.st_${r.status}`, { defaultValue: r.status })}`}
                    className={cn("absolute top-1 h-4 rounded", BAR[r.status] ?? "bg-fg-subtle/40")}
                    style={{ left: x(r.start), width: width(r.start, r.end) }}
                  />
                ) : (
                  <span
                    data-tip={`${r.title} · ${fmt(r.start)} → ${fmt(r.end)}`}
                    className={cn("absolute top-1 h-4 rounded", BAR[r.status] ?? "bg-fg-subtle/40")}
                    style={{ left: x(r.start), width: width(r.start, r.end) }}
                  />
                )}
                {/* The name next to the bar: short bars can't hold it. */}
                <span
                  className="pointer-events-none absolute top-1 ms-1 max-w-[40%] truncate text-[10.5px] leading-4 text-fg-muted"
                  style={{ left: `calc(${x(Math.min(r.end, to))} + 2px)` }}
                >
                  {r.title}
                </span>
              </div>
            ))}
            {!rows.length && <p className="py-4 text-center text-xs text-fg-subtle">{t("roadmap.empty")}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
