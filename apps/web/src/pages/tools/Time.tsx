import type { TimeReport } from "@igrek/core";
import type { TFunction } from "i18next";
import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState, Segmented } from "../../components/ui";
import { useProjects } from "../../lib/live";
import { timeApi } from "../../lib/ops-api";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function duration(minutes: number, t: TFunction): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? t("time.hm", { h, m }) : t("time.m", { m });
}

function range(view: "week" | "last" | "month"): [number, number] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  if (view === "week") return [monday.getTime(), now.getTime()];
  if (view === "last") return [monday.getTime() - 7 * 86_400_000, monday.getTime() - 1];
  return [now.getTime() - 29 * 86_400_000, now.getTime()];
}

/** Time tracking (plan.md 13.2): where the hours with the AI went, per project and day. */
export function TimeTab() {
  const { t, i18n } = useTranslation();
  const projects = useProjects();
  const [view, setView] = useState<"week" | "last" | "month">("week");
  const [report, setReport] = useState<TimeReport>();
  useEffect(() => {
    const [from, to] = range(view);
    timeApi
      .report(from, to)
      .then(setReport)
      .catch(() => undefined);
  }, [view]);
  const color = useMemo(
    () => new Map((report?.totals ?? []).map((x, i) => [x.projectId, COLORS[i % COLORS.length] as string])),
    [report],
  );
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const total = (report?.totals ?? []).reduce((s, x) => s + x.minutes, 0);
  const maxDay = Math.max(30, ...(report?.days ?? []).map((d) => Object.values(d.minutes).reduce((a, b) => a + b, 0)));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("time.intro")}</p>
        <Segmented
          label={t("time.range")}
          value={view}
          onChange={setView}
          options={[
            { value: "week", label: t("time.week") },
            { value: "last", label: t("time.lastWeek") },
            { value: "month", label: t("time.month") },
          ]}
        />
      </div>
      {report && !report.totals.length ? (
        <EmptyState icon={Clock} title={t("time.emptyTitle")} body={t("time.emptyBody")} />
      ) : report ? (
        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <Card className="p-pad">
            <p className="mb-2 text-xs text-fg-muted">{t("time.total", { time: duration(total, t) })}</p>
            <div className="flex h-44 items-end gap-1" role="img" aria-label={t("time.chart")}>
              {report.days.map((d) => {
                const sum = Object.values(d.minutes).reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={d.day}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    data-tip={`${d.day}: ${duration(sum, t)}`}
                  >
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                      style={{ height: `${(sum / maxDay) * 150}px` }}
                    >
                      {Object.entries(d.minutes).map(([pid, m]) => (
                        <div
                          key={pid}
                          style={{ height: `${(m / Math.max(sum, 1)) * 100}%`, background: color.get(pid) }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-fg-subtle">
                      {new Date(`${d.day}T12:00:00`).toLocaleDateString(
                        i18n.language,
                        report.days.length > 8 ? { day: "numeric" } : { weekday: "short" },
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="space-y-1.5 p-pad text-[13px]">
            {report.totals.map((x) => (
              <div key={x.projectId} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color.get(x.projectId) }} />
                <span className="min-w-0 flex-1 truncate">{name(x.projectId)}</span>
                <span className="text-fg-muted">{duration(x.minutes, t)}</span>
              </div>
            ))}
            <p className="pt-2 text-[11px] text-fg-subtle">{t("time.how")}</p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
