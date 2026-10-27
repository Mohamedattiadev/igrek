import type { BoardTask, TaskStatus } from "@igrek/core";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui";
import { cn } from "../../lib/cn";

const WEEK = 7 * 86_400_000;
/** Done first, so the bars grow from what is finished; the board's own column colours. */
const ORDER: TaskStatus[] = ["done", "review", "doing", "todo"];
const FILL: Record<TaskStatus, string> = {
  done: "bg-success",
  review: "bg-warning",
  doing: "bg-accent",
  todo: "bg-fg-subtle/40",
};

/** Whose card it is: who took it, else who it was given to. */
const ownerOf = (task: BoardTask) => task.claimedBy?.name ?? task.assignee?.name ?? "";

/**
 * Who did what (plan.md 18.2): one bar per person, split by where their cards are, and the cards
 * finished each of the last eight weeks. Every number is on hover and written beside the bar.
 */
export function TeamProgress({ tasks }: { tasks: BoardTask[] }) {
  const { t } = useTranslation();
  const people = [...new Set(tasks.map(ownerOf))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const rows = people.map((name) => {
    const theirs = tasks.filter((x) => ownerOf(x) === name);
    return {
      name,
      total: theirs.length,
      by: Object.fromEntries(ORDER.map((s) => [s, theirs.filter((x) => x.status === s).length])),
    };
  });
  const widest = Math.max(1, ...rows.map((r) => r.total));
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - (7 - i) * WEEK;
    return {
      end,
      done: tasks.filter((x) => x.status === "done" && x.updatedAt > end - WEEK && x.updatedAt <= end).length,
    };
  });
  const tallest = Math.max(1, ...weeks.map((w) => w.done));
  if (!tasks.length) return null;
  return (
    <Card className="grid gap-5 p-pad md:grid-cols-[1fr_240px]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-semibold">{t("progress.whoTitle")}</h3>
          <ul className="flex flex-wrap gap-3 text-[11px] text-fg-muted">
            {ORDER.map((s) => (
              <li key={s} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", FILL[s])} aria-hidden="true" />
                {t(`board.col_${s}`)}
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name || "-"} className="flex items-center gap-2 text-[12px]">
              <span className="w-28 shrink-0 truncate font-medium">{r.name || t("progress.nobody")}</span>
              <span className="min-w-0 flex-1">
                <span className="flex h-3 gap-0.5" style={{ width: `${(r.total / widest) * 100}%` }}>
                  {ORDER.filter((s) => r.by[s]).map((s) => (
                    <span
                      key={s}
                      data-tip={`${t(`board.col_${s}`)}: ${r.by[s]}`}
                      className={cn("h-full rounded-sm", FILL[s])}
                      style={{ flexGrow: r.by[s] }}
                    />
                  ))}
                </span>
              </span>
              <span className="ms-auto whitespace-nowrap text-[11.5px] text-fg-muted">
                {t("progress.doneOf", { done: r.by.done, total: r.total })}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold">{t("progress.weeksTitle")}</h3>
        <div className="flex h-24 items-end gap-1.5 border-b border-border">
          {weeks.map((w, i) => (
            <span
              key={w.end}
              data-tip={t("progress.weekTip", { count: w.done, weeks: 7 - i })}
              className="flex h-full flex-1 items-end"
            >
              <span
                className={cn("w-full rounded-t", w.done ? "bg-accent" : "bg-border")}
                style={{ height: w.done ? `${(w.done / tallest) * 100}%` : "2px" }}
              />
            </span>
          ))}
        </div>
        <p className="flex justify-between text-[10.5px] text-fg-subtle">
          <span>{t("progress.weeksAgo", { count: 7 })}</span>
          <span>{t("progress.thisWeek")}</span>
        </p>
      </div>
    </Card>
  );
}
