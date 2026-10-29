import { Briefcase, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "../components/Markdown";
import { Button, Card, EmptyState, field, PageHeader } from "../components/ui";
import { request } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";

type Report = { week: string; text: string; at: number };

/** The weekly CEO report (plan.md 13.5): all projects on one page, written on Monday mornings. */
export function WeeklyPage() {
  const { t } = useTranslation();
  const [weeks, setWeeks] = useState<string[]>([]);
  const [week, setWeek] = useState<string>();
  const [report, setReport] = useState<Report | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(
    (w?: string) =>
      void request<{ weeks: string[]; report: Report | null }>(`/api/weekly${w ? `?week=${w}` : ""}`)
        .then((r) => {
          setWeeks(r.weeks);
          const first = w ?? r.weeks[0];
          if (!w && first) {
            setWeek(first);
            void request<{ report: Report | null }>(`/api/weekly?week=${first}`).then((x) => setReport(x.report));
          } else setReport(r.report);
        })
        .catch(() => setReport(null)),
    [],
  );
  useEffect(() => load(), [load]);
  return (
    <>
      <PageHeader
        title={t("weekly.title")}
        actions={
          <div className="flex items-center gap-2">
            {weeks.length > 0 && (
              <select
                value={week}
                onChange={(e) => {
                  setWeek(e.target.value);
                  load(e.target.value);
                }}
                aria-label={t("weekly.week")}
                className={cn(field, "h-7 px-1.5 text-[12px]")}
              >
                {weeks.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              icon={RefreshCw}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  const r = await request<Report>("/api/weekly", { method: "POST", body: "{}" });
                  setWeek(r.week);
                  setReport(r);
                  load(r.week);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t("briefing.writing") : t("weekly.write")}
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-3xl space-y-3 p-6">
        <p className="text-[13px] text-fg-muted">{t("weekly.intro")}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
        {report ? (
          <Card className="p-pad">
            <Markdown text={report.text} className="prose-igrek" />
            <p className="mt-3 text-[11px] text-fg-subtle">
              {report.week} · {t("recap.written", { when: relativeTime(report.at) })}
            </p>
          </Card>
        ) : report === null ? (
          <EmptyState icon={Briefcase} title={t("weekly.emptyTitle")} body={t("weekly.emptyBody")} />
        ) : null}
      </div>
    </>
  );
}
