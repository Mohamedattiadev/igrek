import type { SessionHealth, SessionSummaryData } from "@godeye/core";
import { HeartPulse } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { useSettings } from "../lib/settings";
import { TeamText } from "./TeamText";
import { Badge, StatusDot } from "./ui";

const LEVEL_TONE = { good: "success", warn: "warning", bad: "danger" } as const;

export function HealthBadge({ health }: { health: SessionHealth }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // Simple mode only speaks up when there is something to do.
  if (settings.mode === "simple" && health.level === "good") return null;
  return (
    <span data-tip={`${t("health.title")}: ${t(`health.explain_${health.level}`)}`}>
      <Badge tone={LEVEL_TONE[health.level]}>
        <HeartPulse size={11} className="me-1" />
        {t(`health.${health.level}`)}
      </Badge>
    </span>
  );
}

export function ContextBar({ fill }: { fill: number }) {
  const percent = Math.round(fill * 100);
  const color = fill >= 0.8 ? "bg-danger" : fill >= 0.5 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
      <span className="w-9 text-end font-mono text-[11px] text-fg-muted">{percent}%</span>
    </div>
  );
}

export function ActiveDot({ active }: { active: boolean }) {
  return active ? <StatusDot tone="success" pulse /> : <StatusDot tone="neutral" />;
}

/** Picks the summary text in the UI language, falling back to English. */
export function useSummaryText(summary?: SessionSummaryData) {
  const { i18n } = useTranslation();
  if (!summary) return undefined;
  return summary.texts[i18n.language] ?? summary.texts.en ?? Object.values(summary.texts)[0];
}

/** A teammate's summary without your language is translated (plan.md 7.4); `authorId` marks it as theirs. */
export function SummaryView({ summary, authorId }: { summary: SessionSummaryData; authorId?: string }) {
  const { t, i18n } = useTranslation();
  const text = useSummaryText(summary);
  if (!text) return null;
  const theirs = authorId && !summary.texts[i18n.language] ? authorId : undefined;
  const show = (value: string) => (theirs ? <TeamText text={value} authorId={theirs} /> : value);
  const block = (title: string, items: string[], tone?: "warning") =>
    items.length > 0 && (
      <div>
        <h4 className={cn("mb-1.5 text-xs font-semibold", tone === "warning" ? "text-warning" : "text-fg-muted")}>
          {title}
        </h4>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-[13px] leading-relaxed">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
              <span>{show(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-4">
      {text.why && (
        <p className="text-[13px] leading-relaxed text-fg-muted">
          <span className="font-semibold text-fg">{t("session.why")}: </span>
          {show(text.why)}
        </p>
      )}
      {block(t("session.did"), text.did)}
      {block(t("session.left"), text.left)}
      {block(t("session.risks"), text.risks, "warning")}
    </div>
  );
}
