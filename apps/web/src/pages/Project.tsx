import type { MemoryItem, MemorySection, ProjectDetail, SessionListItem } from "@godeye/core";
import { ArrowLeft, Brain, EyeOff, GitBranch, GitCommitHorizontal, Plug, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { Badge, Button, Card, EmptyState, Section } from "../components/ui";
import { ActiveDot, HealthBadge, SummaryView, useSummaryText } from "../components/work";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { mainModel, modelName, relativeTime } from "../lib/format";
import { useLiveData } from "../lib/live";

const TABS = ["overview", "sessions", "memory", "setup"] as const;
type Tab = (typeof TABS)[number];
const SECTIONS: MemorySection[] = ["status", "decision", "convention", "failed", "issue"];

export function SessionRow({ session, projectId }: { session: SessionListItem; projectId: string }) {
  const summary = useSummaryText(session.summary);
  const model = mainModel(session.models);
  return (
    <Link
      to={`/p/${projectId}/s/${session.id}`}
      data-nav-item
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
    >
      <ActiveDot active={session.active} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{session.summary?.title || session.title}</p>
        <p className="truncate text-xs text-fg-subtle">{summary?.did[0] ?? session.title}</p>
      </div>
      {model && <span className="hidden font-mono text-[11px] text-fg-subtle md:inline">{modelName(model)}</span>}
      <HealthBadge health={session.health} />
      <span className="w-24 shrink-0 text-end text-[11px] text-fg-subtle">{relativeTime(session.updatedAt)}</span>
    </Link>
  );
}

function Overview({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const latest = project.recentSessions.find((s) => s.summary);
  const status = project.memory.filter((m) => m.section === "status").slice(0, 2);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card className="p-pad">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("project.latest")}</h3>
          {latest?.summary ? (
            <>
              <Link
                to={`/p/${project.id}/s/${latest.id}`}
                className="mb-3 block text-[15px] font-semibold hover:text-accent"
              >
                {latest.summary.title || latest.title}
              </Link>
              <SummaryView summary={latest.summary} />
            </>
          ) : (
            <p className="text-[13px] text-fg-muted">{t("project.noSummary")}</p>
          )}
        </Card>
        <Card>
          <h3 className="border-b border-border px-pad py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {t("project.recent")}
          </h3>
          <div className="divide-y divide-border">
            {project.recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} projectId={project.id} />
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        {status.length > 0 && (
          <Card className="p-pad">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("memory.status")}</h3>
            {status.map((item) => (
              <p key={item.id} className="text-[13px] leading-relaxed">
                {item.text}
              </p>
            ))}
          </Card>
        )}
        <GitCard project={project} />
      </div>
    </div>
  );
}

function GitCard({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const git = project.git;
  return (
    <Card className="space-y-2.5 p-pad text-[13px]">
      <div>
        <p className="text-xs text-fg-subtle">{t("project.path")}</p>
        <p className="break-all font-mono text-xs">{project.path}</p>
      </div>
      {git ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <GitBranch size={14} className="text-fg-subtle" />
            <span className="font-medium">{git.branch}</span>
            {git.ahead > 0 && <Badge tone="accent">{t("projects.ahead", { count: git.ahead })}</Badge>}
            {git.behind > 0 && <Badge tone="warning">{t("projects.behind", { count: git.behind })}</Badge>}
            {git.changed > 0 && <Badge tone="warning">{t("projects.changes", { count: git.changed })}</Badge>}
          </div>
          {git.remote && <p className="font-mono text-[11px] text-fg-subtle">{git.remote}</p>}
          {git.lastCommit && (
            <div className="flex gap-2 border-t border-border pt-2.5">
              <GitCommitHorizontal size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
              <div className="min-w-0">
                <p className="truncate">{git.lastCommit.subject}</p>
                <p className="text-[11px] text-fg-subtle">
                  {git.lastCommit.author} · {relativeTime(git.lastCommit.at)} ·{" "}
                  <span className="font-mono">{git.lastCommit.hash}</span>
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <Badge>{t("projects.noGit")}</Badge>
      )}
    </Card>
  );
}

function Sessions({ projectId }: { projectId: string }) {
  const { data } = useLiveData(
    () => api.projectSessions(projectId),
    [projectId],
    (ids) => ids.includes(projectId),
  );
  return (
    <Card>
      <div className="divide-y divide-border">
        {data?.map((session) => (
          <SessionRow key={session.id} session={session} projectId={projectId} />
        ))}
      </div>
    </Card>
  );
}

function Memory({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const [context, setContext] = useState<string>();
  const forget = async (item: MemoryItem) => {
    await api.forget(item.id);
    onChange();
  };
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[13px] leading-relaxed text-fg-muted">{t("memory.hint")}</p>
      {project.memory.length === 0 ? (
        <Card>
          <EmptyState icon={Brain} title={t("memory.title")} body={t("memory.empty")} />
        </Card>
      ) : (
        SECTIONS.map((section) => {
          const items = project.memory.filter((m) => m.section === section);
          if (items.length === 0) return null;
          return (
            <Card key={section}>
              <h3 className="border-b border-border px-pad py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t(`memory.${section}`)}
              </h3>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} data-nav-item tabIndex={-1} className="group flex items-start gap-3 px-pad py-2.5">
                    <p className="flex-1 text-[13px] leading-relaxed">{item.text}</p>
                    {item.sourceSession && (
                      <Link
                        to={`/p/${project.id}/s/${item.sourceSession}`}
                        className="shrink-0 text-[11px] text-fg-subtle hover:text-accent"
                      >
                        {relativeTime(item.createdAt)}
                      </Link>
                    )}
                    <button
                      type="button"
                      title={t("memory.delete")}
                      aria-label={t("memory.delete")}
                      onClick={() => forget(item)}
                      className="shrink-0 text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => setContext(context ? undefined : (await api.projectContext(project.id)).context)}
        >
          {t("memory.preview")}
        </Button>
        {context !== undefined && (
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-ui border border-border bg-bg-subtle p-pad font-mono text-xs">
            {context || "—"}
          </pre>
        )}
      </div>
    </div>
  );
}

function Setup({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await (project.hooksInstalled ? api.uninstallHooks(project.id) : api.installHooks(project.id));
      onChange();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="px-pad">
      <Section title={t("setup.hooksTitle")} hint={t("setup.hooksBody")}>
        <div className="flex items-center gap-3">
          <Plug size={16} className={project.hooksInstalled ? "text-success" : "text-fg-subtle"} />
          <Badge tone={project.hooksInstalled ? "success" : "neutral"}>
            {project.hooksInstalled ? t("setup.on") : t("setup.off")}
          </Badge>
          <Button variant={project.hooksInstalled ? "secondary" : "primary"} onClick={toggle} disabled={busy}>
            {project.hooksInstalled ? t("setup.uninstall") : t("setup.install")}
          </Button>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          {t("setup.file")} <code className="font-mono">{project.path}/.claude/settings.local.json</code>
        </p>
      </Section>
      <Section title={project.hidden ? t("project.unhide") : t("project.hide")}>
        <Button
          icon={EyeOff}
          onClick={async () => {
            await api.setProjectHidden(project.id, !project.hidden);
            onChange();
          }}
        >
          {project.hidden ? t("project.unhide") : t("project.hide")}
        </Button>
      </Section>
    </Card>
  );
}

export function ProjectPage() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((name) => name === params.get("tab")) ?? "overview") as Tab;
  const {
    data: project,
    error,
    reload,
  } = useLiveData(
    () => api.project(projectId),
    [projectId],
    (ids) => ids.includes(projectId),
  );

  if (error && !project) {
    return <EmptyState icon={Brain} title={t("project.notFound")} body={error} />;
  }
  return (
    <>
      <header className="shrink-0 border-b border-border px-6 pt-3">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-fg-subtle hover:text-fg" aria-label={t("nav.projects")}>
            <ArrowLeft size={16} className="rtl:rotate-180" />
          </Link>
          {project && <ActiveDot active={project.activeSessions > 0} />}
          <h1 className="text-[15px] font-semibold">{project?.name ?? "…"}</h1>
          {project?.health && <HealthBadge health={project.health} />}
        </div>
        <nav className="mt-2 flex gap-1">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setParams(name === "overview" ? {} : { tab: name })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
                tab === name ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {t(`project.${name}`)}
              {name === "sessions" && project && <span className="ms-1.5 text-fg-subtle">{project.sessionCount}</span>}
              {name === "memory" && project && <span className="ms-1.5 text-fg-subtle">{project.memory.length}</span>}
            </button>
          ))}
        </nav>
      </header>
      <div className="mx-auto w-full max-w-6xl p-6">
        {!project ? (
          <div className="h-64 animate-pulse rounded-ui bg-bg-subtle" />
        ) : tab === "overview" ? (
          <Overview project={project} />
        ) : tab === "sessions" ? (
          <Sessions projectId={project.id} />
        ) : tab === "memory" ? (
          <Memory project={project} onChange={reload} />
        ) : (
          <Setup project={project} onChange={reload} />
        )}
      </div>
    </>
  );
}
