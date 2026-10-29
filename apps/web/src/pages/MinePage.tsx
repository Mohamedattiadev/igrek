import type { BoardTask, ProjectListItem, TaskStatus } from "@igrek/core";
import { ArrowRight, FolderKanban, SquareCheckBig } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Markdown } from "../components/Markdown";
import { Badge, Card, EmptyState, PageHeader, Panel } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { dateTime, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

const TONE: Record<TaskStatus, "neutral" | "accent" | "warning" | "success"> = {
  todo: "neutral",
  doing: "accent",
  review: "warning",
  done: "success",
};

/**
 * Everything on my plate, on every project (plan.md 18.2): cards given to me or taken by me and not
 * done yet. Each one opens on its project's board, so no going through Projects first.
 */
export function MinePage() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<BoardTask[]>();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [focus, setFocus] = useState<string>();
  const load = useCallback(() => {
    void api
      .myCards()
      .then(setCards)
      .catch(() => setCards([]));
    void api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useServerEvent("board-changed", load);
  const byProject = [...new Set((cards ?? []).map((c) => c.projectId))];
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const shown = (cards ?? []).find((c) => c.id === focus) ?? cards?.[0];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("mine.title")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The list, and beside it a card that stays put and shows the one pointed at in full
            (a user wanted what it is, who gave it and how long it has waited without opening it). */}
        <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <p className="text-[13px] text-fg-muted">{t("mine.intro")}</p>
            {cards && !cards.length && (
              <EmptyState icon={SquareCheckBig} title={t("mine.emptyTitle")} body={t("mine.emptyBody")} />
            )}
            {byProject.map((projectId) => (
              <Card key={projectId}>
                <Link
                  to={`/p/${projectId}?tab=board`}
                  className="flex items-center gap-2 border-b border-border px-pad py-2 text-[13px] font-semibold hover:text-accent"
                >
                  <FolderKanban size={14} className="text-fg-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{name(projectId)}</span>
                  <span className="text-[12px] font-normal text-fg-subtle">{t("mine.openBoard")}</span>
                  <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
                </Link>
                <ul className="divide-y divide-border">
                  {(cards ?? [])
                    .filter((c) => c.projectId === projectId)
                    .map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/p/${projectId}?tab=board&card=${c.id}`}
                          onMouseEnter={() => setFocus(c.id)}
                          onFocus={() => setFocus(c.id)}
                          className={cn(
                            "flex items-center gap-3 px-pad py-2.5 hover:bg-bg-hover",
                            shown?.id === c.id && "bg-bg-hover",
                          )}
                        >
                          <SquareCheckBig size={14} className="shrink-0 text-accent" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.title}</span>
                          <Badge tone={TONE[c.status]}>{t(`board.col_${c.status}`)}</Badge>
                          <span className="hidden shrink-0 text-[11.5px] text-fg-subtle sm:block">
                            {relativeTime(c.updatedAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </Card>
            ))}
          </div>
          {shown && <CardDetail card={shown} project={name(shown.projectId)} />}
        </div>
      </div>
    </div>
  );
}

/** One card in full, in the column on the right: what, from whom, since when, where. */
function CardDetail({ card, project }: { card: BoardTask; project: string }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t("mine.detailProject"), project],
    [t("mine.detailFrom"), card.author ?? t("mine.detailFromBoard")],
    [t("mine.detailGiven"), `${dateTime(card.createdAt)} (${relativeTime(card.createdAt)})`],
    [t("mine.detailChanged"), relativeTime(card.updatedAt)],
    ...(card.claimedBy ? [[t("mine.detailTaken"), card.claimedBy.name] as [string, string]] : []),
    ...(card.origin ? [[t("mine.detailOrigin"), card.origin] as [string, string]] : []),
  ];
  return (
    <aside className="lg:sticky lg:top-0 lg:self-start">
      <Panel
        icon={SquareCheckBig}
        title={card.title}
        action={<Badge tone={TONE[card.status]}>{t(`board.col_${card.status}`)}</Badge>}
      >
        {card.description ? (
          <Markdown text={card.description} className="prose-igrek max-h-64 overflow-y-auto text-[13px]" />
        ) : (
          <p className="text-[12.5px] text-fg-subtle">{t("mine.detailNoText")}</p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border pt-2 text-[12px]">
          {rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-fg-subtle">{k}</dt>
              <dd className="min-w-0 truncate">{v}</dd>
            </Fragment>
          ))}
        </dl>
        <Link
          to={`/p/${card.projectId}?tab=board&card=${card.id}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
        >
          {t("mine.openCard")} <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
        </Link>
      </Panel>
    </aside>
  );
}
