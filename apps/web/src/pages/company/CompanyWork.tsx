import type { BoardTask } from "@igrek/core";
import { FolderKanban, GitCommitHorizontal, TerminalSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { useServerEvent } from "../../lib/live";
import { TeamProgress } from "../project/TeamProgress";

type Work = Awaited<ReturnType<typeof api.teamWork>>;

/**
 * The company's work (plan.md 18.6): who is on what across every shared project, cards finished per
 * week, and this week's commits and AI sessions per person. Everyone sees it; it is for seeing the
 * work, not for ranking people.
 */
export function CompanyWork() {
  const { t } = useTranslation();
  const [work, setWork] = useState<Work>();
  const load = () =>
    void api
      .teamWork()
      .then(setWork)
      .catch(() => undefined);
  useEffect(load, []);
  useServerEvent("board-changed", load);
  if (!work) return null;
  if (!work.projects.length)
    return <EmptyState icon={FolderKanban} title={t("work.emptyTitle")} body={t("work.emptyBody")} />;
  const open = (projectId: string) =>
    work.tasks.filter((x: BoardTask) => x.projectId === projectId && x.status !== "done").length;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-[13px] text-fg-muted">{t("work.intro")}</p>
      <TeamProgress tasks={work.tasks} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("work.weekTitle")}</h3>
          <ul className="divide-y divide-border">
            {work.week.map((p) => (
              <li key={p.who || "-"} className="flex items-center gap-3 px-pad py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium">{p.who || work.me || t("team.you")}</span>
                <span className="inline-flex items-center gap-1 text-fg-muted" data-tip={t("work.commits")}>
                  <GitCommitHorizontal size={13} aria-hidden="true" />
                  {p.commits}
                </span>
                <span className="inline-flex items-center gap-1 text-fg-muted" data-tip={t("work.sessions")}>
                  <TerminalSquare size={13} aria-hidden="true" />
                  {p.sessions}
                </span>
              </li>
            ))}
            {!work.week.length && <li className="px-pad py-3 text-[13px] text-fg-subtle">{t("work.quiet")}</li>}
          </ul>
        </Card>
        <Card>
          <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("work.projectsTitle")}</h3>
          <ul className="divide-y divide-border">
            {work.projects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/p/${p.id}?tab=board`}
                  className="flex items-center gap-3 px-pad py-2 text-[13px] hover:bg-bg-hover"
                >
                  <FolderKanban size={14} className="text-fg-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="text-fg-muted">{t("work.openCards", { count: open(p.id) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
