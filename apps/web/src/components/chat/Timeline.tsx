import type { TeamTimelineItem } from "@igrek/core";
import {
  Activity,
  GitCommitHorizontal,
  type LucideIcon,
  MessageSquare,
  SquareCheckBig,
  TerminalSquare,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { useCoalesced, useServerEvent } from "../../lib/live";
import { Badge, EmptyState, field } from "../ui";

const KIND: Record<TeamTimelineItem["kind"], LucideIcon> = {
  session: TerminalSquare,
  commit: GitCommitHorizontal,
  task: SquareCheckBig,
  message: MessageSquare,
};

const TONE = { todo: "neutral", doing: "accent", review: "warning", done: "success" } as const;

function linkOf(item: TeamTimelineItem): string | undefined {
  if (item.kind === "session") return `/p/${item.projectId}/s/${item.id.slice(2)}`;
  if (item.kind === "task") return `/p/${item.projectId}?tab=board&card=${item.id.slice(2)}`;
  if (item.kind === "message" && item.channelId) return `/chat?c=${encodeURIComponent(item.channelId)}`;
  return undefined;
}

function dayOf(at: number, language: string): string {
  return new Date(at).toLocaleDateString(language, { weekday: "long", day: "numeric", month: "long" });
}

function Row({ item }: { item: TeamTimelineItem }) {
  const { t } = useTranslation();
  const Icon = KIND[item.kind];
  const to = linkOf(item);
  const body = (
    <>
      <Icon size={15} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">
          <span className="font-semibold">{item.mine ? t("timeline.you") : item.who || t("timeline.someone")}</span>{" "}
          <span className="text-fg-muted">{t(`timeline.did_${item.kind}`)}</span>
        </span>
        <span className="block truncate text-[13px]">{item.title || t("timeline.untitled")}</span>
      </span>
      {item.status && <Badge tone={TONE[item.status]}>{t(`teamChat.status_${item.status}`)}</Badge>}
      <span className="hidden shrink-0 text-[11.5px] text-fg-subtle sm:block">{item.project}</span>
      <time className="shrink-0 text-[11.5px] text-fg-subtle" title={dateTime(item.at)}>
        {relativeTime(item.at)}
      </time>
    </>
  );
  const row = "flex items-start gap-3 rounded-ui px-3 py-2";
  return to ? (
    <Link to={to} className={cn(row, "hover:bg-bg-hover")}>
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}

/**
 * The team's timeline: what everyone did in the shared projects, day by day, with a filter per
 * person. Sessions, commits, cards and messages, so nobody has to ask "who is on what".
 */
export function TeamTimeline() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<TeamTimelineItem[]>();
  const [who, setWho] = useState<string>("");
  const load = useCallback(
    () =>
      void api
        .teamTimeline()
        .then(setItems)
        .catch(() => setItems([])),
    [],
  );
  useEffect(load, [load]);
  const soon = useCoalesced(load);
  useServerEvent("chat-changed", (m) => m.writing === undefined && !m.typing && soon());
  const people = [...new Set((items ?? []).filter((i) => !i.mine && i.who).map((i) => i.who))];
  const shown = (items ?? []).filter((i) => !who || (who === "me" ? i.mine : i.who === who));
  const days = [...new Set(shown.map((i) => dayOf(i.at, i18n.language)))];
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <Activity size={15} className="text-fg-subtle" aria-hidden="true" />
          {t("timeline.title")}
        </h1>
        <span className="hidden text-[12.5px] text-fg-subtle sm:block">{t("timeline.hint")}</span>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          aria-label={t("timeline.who")}
          className={cn(field, "ms-auto")}
        >
          <option value="">{t("timeline.everyone")}</option>
          <option value="me">{t("timeline.you")}</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {items && !shown.length && (
          <EmptyState icon={Activity} title={t("timeline.emptyTitle")} body={t("timeline.emptyBody")} />
        )}
        {days.map((day) => (
          <div key={day} className="mb-3">
            <p className="sticky top-0 bg-bg px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
              {day}
            </p>
            {shown
              .filter((i) => dayOf(i.at, i18n.language) === day)
              .map((i) => (
                <Row key={i.id} item={i} />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
