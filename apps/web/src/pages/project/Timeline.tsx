import type { Digest, TimelineEntry } from "@igrek/core";
import { CalendarDays, FileText, GitCommitHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";
import i18n from "../../lib/i18n";
import { useLiveData } from "../../lib/live";
import { SessionRow } from "./SessionRow";

function dayLabel(at: number): string {
  return new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(at);
}

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Sessions and commits grouped by day (plan.md 1.5). */
export function TimelineTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data } = useLiveData(
    () => api.timeline(projectId),
    [projectId],
    (ids) => ids.includes(projectId),
  );
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of data ?? []) {
    const key = dayKey(entry.at);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return (
    <div className="space-y-5">
      {[...groups.values()].map((entries) => (
        <section key={dayKey(entries[0]?.at ?? 0)}>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg-muted">
            <CalendarDays size={13} />
            {dayLabel(entries[0]?.at ?? 0)}
          </h3>
          <Card>
            <div className="divide-y divide-border">
              {entries.map((entry) =>
                entry.kind === "session" ? (
                  <SessionRow key={entry.session.id} session={entry.session} projectId={projectId} />
                ) : (
                  <div
                    key={entry.commit.hash}
                    data-nav-item
                    tabIndex={-1}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <GitCommitHorizontal size={14} className="shrink-0 text-fg-subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{entry.commit.subject}</p>
                      <p className="text-[11px] text-fg-subtle">
                        {t("project.commitBy", { author: entry.commit.author })} ·{" "}
                        <span className="font-mono">{entry.commit.hash}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-fg-subtle">
                      {new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(entry.at)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </Card>
        </section>
      ))}
    </div>
  );
}

function DigestView({ digest }: { digest: Digest }) {
  const { t, i18n: i } = useTranslation();
  const text = digest.texts[i.language] ?? digest.texts.en ?? Object.values(digest.texts)[0];
  if (!text) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold">{digest.title}</p>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-fg-subtle">
          {digest.period === "week" && <CalendarDays size={11} aria-hidden="true" />} {digest.day} ·{" "}
          {t("project.sessionsAndCommits", { sessions: digest.sessions, commits: digest.commits })}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-fg-muted">{text.summary}</p>
      {text.highlights.length > 0 && (
        <ul className="space-y-0.5">
          {text.highlights.map((h) => (
            <li key={h} className="flex gap-2 text-[13px]">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
              {h}
            </li>
          ))}
        </ul>
      )}
      {text.next.length > 0 && (
        <p className="text-xs text-fg-muted">
          <span className="font-semibold">{t("project.next")}: </span>
          {text.next.join(" · ")}
        </p>
      )}
    </div>
  );
}

function mondayOfThisWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Daily and weekly plain-language reports. */
export function ReportsCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"day" | "week">();
  const [error, setError] = useState<string>();
  const { data, reload } = useLiveData(
    () => api.digests(projectId),
    [projectId],
    (ids) => ids.includes(projectId),
  );
  const write = async (period: "day" | "week") => {
    setBusy(period);
    setError(undefined);
    try {
      await api.writeDigest(projectId, period, period === "week" ? mondayOfThisWeek() : undefined);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const latest = data?.slice(0, 2) ?? [];
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          <FileText size={13} />
          {t("project.reports")}
        </h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => write("day")} disabled={!!busy}>
            {busy === "day" ? t("project.writing") : t("project.today")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => write("week")} disabled={!!busy}>
            {busy === "week" ? t("project.writing") : t("project.week")}
          </Button>
        </div>
      </div>
      {latest.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("project.noReports")}</p>
      ) : (
        <div className="space-y-4 divide-y divide-border [&>*:not(:first-child)]:pt-4">
          {latest.map((digest) => (
            <DigestView key={`${digest.period}-${digest.day}`} digest={digest} />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}
