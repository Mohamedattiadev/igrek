import type { BoardTask, ProjectListItem, TaskStatus } from "@igrek/core";
import { ArrowRight, FolderKanban, SquareCheckBig } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Card, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("mine.title")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
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
                        className="flex items-center gap-3 px-pad py-2.5 hover:bg-bg-hover"
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
      </div>
    </div>
  );
}
