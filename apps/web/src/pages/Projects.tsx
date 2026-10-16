import type { ProjectListItem } from "@godeye/core";
import { ArrowDown, ArrowUp, FolderKanban, GitBranch, Search, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { ActiveDot, HealthBadge, useSummaryText } from "../components/work";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useIndexStatus, useLiveData } from "../lib/live";

function ProjectCard({ project }: { project: ProjectListItem }) {
  const { t } = useTranslation();
  const summary = useSummaryText(project.lastSummary);
  const git = project.git;
  return (
    <Link
      to={`/p/${project.id}`}
      data-nav-item
      className="group block rounded-ui border border-border bg-bg p-pad transition-colors hover:border-border-strong hover:bg-bg-subtle"
    >
      <div className="flex items-center gap-2">
        <ActiveDot active={project.activeSessions > 0} />
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{project.name}</h3>
        {project.health && <HealthBadge health={project.health} />}
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle">{project.path}</p>

      <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed text-fg-muted">
        {summary?.did[0] ?? project.lastSummary?.title ?? t("project.noSummary")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-subtle">
        {git?.branch ? (
          <Badge>
            <GitBranch size={11} className="me-1" />
            {git.branch}
          </Badge>
        ) : (
          <Badge>{t("projects.noGit")}</Badge>
        )}
        {git && git.changed > 0 && <Badge tone="warning">{t("projects.changes", { count: git.changed })}</Badge>}
        {git && git.ahead > 0 && (
          <Badge tone="accent">
            <ArrowUp size={10} className="me-0.5" />
            {git.ahead}
          </Badge>
        )}
        {git && git.behind > 0 && (
          <Badge tone="warning">
            <ArrowDown size={10} className="me-0.5" />
            {git.behind}
          </Badge>
        )}
        <span className="ms-auto">
          {project.activeSessions > 0
            ? t("projects.active", { count: project.activeSessions })
            : t("projects.sessions", { count: project.sessionCount })}
          {project.lastActivity > 0 && ` · ${relativeTime(project.lastActivity)}`}
        </span>
      </div>
    </Link>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const { data: projects } = useLiveData(() => api.projects(), []);
  const status = useIndexStatus();

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (projects ?? []).filter(
      (p) => (showHidden || !p.hidden) && (!q || `${p.name} ${p.path}`.toLowerCase().includes(q)),
    );
  }, [projects, filter, showHidden]);
  const hiddenCount = (projects ?? []).filter((p) => p.hidden).length;

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        actions={
          projects && projects.length > 0 ? (
            <label className="flex h-7 w-56 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2">
              <Search size={13} className="text-fg-subtle" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t("projects.filter")}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
              />
            </label>
          ) : undefined
        }
      />
      {status?.running && (
        <div className="border-b border-border bg-accent-soft px-6 py-2 text-xs text-accent">
          {t("projects.indexing", { done: status.filesDone, total: status.filesTotal })}
        </div>
      )}
      {projects && projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t("projects.emptyTitle")}
          body={t("projects.emptyBody")}
          action={
            <Button icon={Settings} onClick={() => navigate("/settings")}>
              {t("projects.emptyAction")}
            </Button>
          }
        />
      ) : (
        <div className="p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {projects
              ? shown.map((project) => <ProjectCard key={project.id} project={project} />)
              : [0, 1, 2, 3].map((i) => <Card key={i} className="h-40 animate-pulse bg-bg-subtle" />)}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="mt-4 text-xs text-fg-subtle hover:text-fg"
            >
              {showHidden ? t("project.hide") : `${t("projects.showHidden")} (${hiddenCount})`}
            </button>
          )}
        </div>
      )}
    </>
  );
}
