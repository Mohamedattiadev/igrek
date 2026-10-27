import type { TeamAuditEntry } from "@igrek/core";
import { Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Markdown } from "../../components/Markdown";
import { Badge, Button, field } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";

type Kind = "all" | "signin" | "failed" | "admin";
const PERIODS = { all: 0, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 } as const;
type Period = keyof typeof PERIODS;

/** Sign-ins, failures and the rest (admin work), so a failed sign-in stands out in red. */
function kindOf(action: string): Exclude<Kind, "all"> {
  if (/fail|denied|locked/.test(action)) return "failed";
  if (/^login|^logout|new-location|2fa/.test(action)) return "signin";
  return "admin";
}

const TONE = { failed: "danger", signin: "neutral", admin: "accent" } as const;

/** Ask the log a question in plain words; the answer comes from the log alone. */
function AskLog() {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    setAnswer(undefined);
    try {
      setAnswer((await api.askAudit(question)).answer);
    } catch (err) {
      setAnswer((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) void ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("audit.askHint")}
          aria-label={t("audit.ask")}
          className={cn(field, "min-w-0 flex-1")}
        />
        <Button usesModel type="submit" icon={Sparkles} disabled={busy || !question.trim()}>
          {busy ? t("audit.asking") : t("audit.ask")}
        </Button>
      </form>
      {answer && (
        <div className="rounded-ui border border-border bg-bg-subtle px-3 py-2 text-[13px]">
          <Markdown text={answer} className="prose-igrek" />
        </div>
      )}
    </div>
  );
}

/**
 * The hub's audit log (plan.md 18.6): searchable, filtered by person, kind and period, failures in
 * red, actions in words, and a question box that answers from the log.
 */
export function CompanyAudit({ entries, nameOf }: { entries: TeamAuditEntry[]; nameOf: (id?: string) => string }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [who, setWho] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [period, setPeriod] = useState<Period>("all");
  const people = [...new Set(entries.map((e) => e.userId ?? ""))].filter(Boolean);
  const since = PERIODS[period] ? Date.now() - PERIODS[period] : 0;
  const words = query.trim().toLowerCase();
  const shown = entries.filter(
    (e) =>
      e.at >= since &&
      (!who || e.userId === who) &&
      (kind === "all" || kindOf(e.action) === kind) &&
      (!words ||
        [nameOf(e.userId), e.action, t(`audit.action_${e.action}`, { defaultValue: e.action }), e.detail, e.ip]
          .join(" ")
          .toLowerCase()
          .includes(words)),
  );
  return (
    <div className="space-y-3">
      <AskLog />
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <Search size={13} className="absolute start-2 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("audit.search")}
            aria-label={t("audit.search")}
            className={cn(field, "w-full ps-8")}
          />
        </label>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("audit.who")} className={field}>
          <option value="">{t("audit.everyone")}</option>
          {people.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          aria-label={t("audit.kind")}
          className={field}
        >
          {(["all", "signin", "failed", "admin"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`audit.kind_${k}`)}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label={t("audit.period")}
          className={field}
        >
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <option key={p} value={p}>
              {t(`audit.period_${p}`)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[12px] text-fg-subtle">{t("audit.count", { count: shown.length, total: entries.length })}</p>
      <div className="max-h-96 overflow-auto rounded-ui border border-border">
        {shown.map((a) => (
          <div
            key={`${a.at}-${a.action}-${a.detail ?? ""}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border px-2.5 py-1.5 text-xs last:border-b-0"
          >
            <time className="w-24 shrink-0 text-fg-subtle" title={dateTime(a.at)}>
              {relativeTime(a.at)}
            </time>
            <span className="w-28 shrink-0 truncate font-medium">{nameOf(a.userId)}</span>
            <Badge tone={TONE[kindOf(a.action)]}>{t(`audit.action_${a.action}`, { defaultValue: a.action })}</Badge>
            <span className="min-w-0 flex-1 truncate text-fg-subtle">{a.detail}</span>
            {a.ip && <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{a.ip}</span>}
          </div>
        ))}
        {!shown.length && <p className="px-3 py-6 text-center text-[13px] text-fg-subtle">{t("audit.none")}</p>}
      </div>
    </div>
  );
}
