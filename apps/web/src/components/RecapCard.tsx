import type { DayRecap } from "@igrek/core";
import { ChevronDown, ChevronRight, Moon, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { request } from "../lib/api";
import { relativeTime } from "../lib/format";
import { duration } from "../pages/tools/Time";
import { LazyMarkdown as Markdown } from "./LazyMarkdown";
import { Button, Card } from "./ui";

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The evening recap (plan.md 13.2 "Gün sonu özeti"): what we did today, per project, in plain
 * words with the numbers next to it. Written by itself after 21:00; earlier days stay readable.
 */
export function RecapCard() {
  const { t, i18n } = useTranslation();
  const today = localDay(new Date());
  const [day, setDay] = useState(today);
  const [days, setDays] = useState<string[]>([]);
  const [data, setData] = useState<{ recap: DayRecap | null; stats: DayRecap["stats"] }>();
  const [open, setOpen] = useState(() => new Date().getHours() >= 17);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    request<{ recap: DayRecap | null; stats: DayRecap["stats"] }>(`/api/recap?day=${day}`)
      .then(setData)
      .catch(() => undefined);
    request<string[]>("/api/recaps")
      .then(setDays)
      .catch(() => undefined);
  }, [day]);
  useEffect(load, [load]);
  const write = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const recap = await request<DayRecap>("/api/recap", {
        method: "POST",
        body: JSON.stringify({ day, language: i18n.language }),
      });
      setData({ recap, stats: recap.stats });
      setOpen(true);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stats = data?.recap?.stats ?? data?.stats;
  const choices = [...new Set([today, localDay(new Date(Date.now() - 86_400_000)), ...days])].sort().reverse();
  // Quiet days don't need a card at all, unless you are looking back.
  if (day === today && stats && !stats.projects.length && !data?.recap) return null;
  return (
    <Card className="p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          {open ? (
            <ChevronDown size={14} className="text-fg-subtle" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="text-fg-subtle" aria-hidden="true" />
          )}
          <Moon size={15} className="text-accent" aria-hidden="true" />
          <span className="text-[13px] font-semibold">{t("recap.title")}</span>
          {stats && stats.projects.length > 0 && (
            <span className="min-w-0 truncate text-xs text-fg-muted">
              {t("recap.numbers", {
                projects: stats.projects.length,
                commits: stats.commits,
                time: duration(stats.minutes, t),
              })}
            </span>
          )}
        </button>
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label={t("recap.day")}
          className="h-7 rounded-ui border border-border bg-bg px-1.5 text-xs"
        >
          {choices.map((d) => (
            <option key={d} value={d}>
              {d === today
                ? t("recap.today")
                : new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          disabled={busy || !stats?.projects.length}
          onClick={() => void write()}
        >
          {busy ? t("briefing.writing") : data?.recap ? t("briefing.again") : t("briefing.write")}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {open && (
        <div className="mt-3 space-y-3 text-[13px]">
          {stats && stats.projects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stats.projects.map((p) => (
                <span
                  key={p.projectId}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-muted"
                >
                  <span className="font-medium text-fg">{p.name}</span> · {duration(p.minutes, t)} ·{" "}
                  {t("recap.commits", { count: p.commits })}
                  {p.merged > 0 && ` · ${t("recap.merged", { count: p.merged })}`}
                </span>
              ))}
            </div>
          )}
          {data?.recap ? (
            <>
              <Markdown text={data.recap.text} className="prose-igrek" />
              <p className="text-[11px] text-fg-subtle">{t("recap.written", { when: relativeTime(data.recap.at) })}</p>
            </>
          ) : stats?.projects.length ? (
            <p className="text-xs text-fg-muted">{day === today ? t("recap.notYet") : t("recap.notWritten")}</p>
          ) : (
            <p className="text-xs text-fg-muted">{t("recap.quiet")}</p>
          )}
        </div>
      )}
    </Card>
  );
}
