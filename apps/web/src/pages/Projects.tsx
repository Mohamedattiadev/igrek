import type { ProjectListItem } from "@godeye/core";
import { ArrowDown, ArrowUp, FolderKanban, FolderPlus, GitBranch, Search, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { BriefingCard } from "../components/BriefingCard";
import { LoadError } from "../components/LoadError";
import { TeamAvatar, useTeamPeople } from "../components/TeamAvatar";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader } from "../components/ui";
import { useWorkspace } from "../components/WorkspacePicker";
import { ActiveDot, HealthBadge, useSummaryText } from "../components/work";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useIndexStatus, useLiveData } from "../lib/live";

function ProjectCard({ project, people }: { project: ProjectListItem; people: ReturnType<typeof useTeamPeople> }) {
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
        {/* Teammates who worked here lately; the one working right now has a green dot. */}
        {(() => {
          const here = people.presence.filter((p) => p.projectId === project.id);
          const members = (people.status?.members ?? []).filter(
            (m) =>
              m.id !== people.status?.user?.id &&
              (project.teamAuthors.includes(m.id) || here.some((p) => p.userId === m.id)),
          );
          if (!members.length) return null;
          return (
            <span className="flex -space-x-1.5">
              {members.slice(0, 4).map((m) => {
                const doing = here.find((p) => p.userId === m.id);
                return (
                  <TeamAvatar
                    key={m.id}
                    member={m}
                    size={20}
                    state={doing ? "working" : m.online ? "idle" : "offline"}
                    doing={doing?.title}
                  />
                );
              })}
            </span>
          );
        })()}
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

function AddProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string>();
  const add = async () => {
    setError(undefined);
    try {
      const { id } = await api.addProject(path.trim());
      setOpen(false);
      navigate(`/p/${id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => setOpen(true)}>
        {t("projects.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("projects.addTitle")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("projects.addTitle")}</h2>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("projects.addHint")}
            autoFocus
            className="h-9 w-full rounded-ui border border-border bg-bg px-3 font-mono text-[13px] outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("memory.cancel")}
            </Button>
            <Button variant="primary" onClick={add} disabled={!path.trim()}>
              {t("projects.addAction")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

const TEMPLATE_IDS = ["saas", "api", "landing", "cli", "empty"] as const;

/** A new project from a template, carrying your conventions and lessons (plan.md 11). */
function NewProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [template, setTemplate] = useState<(typeof TEMPLATE_IDS)[number]>("saas");
  const [details, setDetails] = useState("");
  const [practices, setPractices] = useState<{ conventions: string[]; lessons: string[] }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open)
      api
        .templates()
        .then((r) => setPractices(r.practices))
        .catch(() => undefined);
  }, [open]);
  const create = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const made = await api.newProject({ name, parent, template, details });
      setOpen(false);
      navigate(made.runId ? `/runs/${made.runId}` : `/p/${made.projectId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";
  return (
    <>
      <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => setOpen(true)}>
        {t("templates.new")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("templates.new")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("templates.new")}</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("templates.name")}
            aria-label={t("templates.name")}
            className={field}
            autoFocus
          />
          <input
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            placeholder={t("templates.parent")}
            aria-label={t("templates.parentLabel")}
            className={`${field} font-mono`}
          />
          <div className="grid gap-1.5">
            {TEMPLATE_IDS.map((id) => (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-2 rounded-ui border p-2 ${template === id ? "border-accent bg-accent-soft/40" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="template"
                  checked={template === id}
                  onChange={() => setTemplate(id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[13px] font-medium">{t(`templates.t_${id}`)}</span>
                  <span className="block text-[11px] text-fg-subtle">{t(`templates.d_${id}`)}</span>
                </span>
              </label>
            ))}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder={t("templates.details")}
            aria-label={t("templates.details")}
            className="w-full rounded-ui border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          {practices && (
            <p className="text-[11px] text-fg-subtle">
              {t("templates.carries", { conventions: practices.conventions.length, lessons: practices.lessons.length })}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("memory.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void create()} disabled={busy || !name.trim()}>
              {busy ? t("templates.creating") : t("templates.create")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** One line: what happened today in every workspace. */
function TodayStrip() {
  const { t } = useTranslation();
  const { data } = useLiveData(() => api.today(), []);
  if (!data || data.sessions + data.teamSessions + data.commits + data.deploys === 0) return null;
  const parts = [
    t("today.sessions", { count: data.sessions }),
    data.teamSessions ? t("today.team", { count: data.teamSessions }) : "",
    t("today.commits", { count: data.commits }),
    data.deploys
      ? t("today.deploys", { count: data.deploys }) +
        (data.failedDeploys ? ` (${t("today.failed", { count: data.failedDeploys })})` : "")
      : "",
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ui border border-border bg-bg-subtle px-3 py-2 text-xs">
      <span className="font-semibold">{t("today.title")}</span>
      <span className="text-fg-muted">{parts.join(" · ")}</span>
      <span className="flex-1" />
      {data.projects.map((p) => (
        <Link
          key={p.id}
          to={`/p/${p.id}?tab=timeline`}
          className="rounded-full border border-border bg-bg px-2 py-0.5 hover:border-accent"
          data-tip={t("today.projectTip", { sessions: p.sessions, commits: p.commits })}
        >
          {p.name}
          {p.team && <span className="ms-1 text-fg-subtle">·{t("workspace.team")}</span>}
        </Link>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const { data: projects, error, reload } = useLiveData(() => api.projects(), []);
  const status = useIndexStatus();

  const workspace = useWorkspace();
  const people = useTeamPeople();
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (projects ?? []).filter(
      (p) =>
        (workspace === "all" || p.workspace === workspace) &&
        (showHidden || !p.hidden) &&
        (!q || `${p.name} ${p.path}`.toLowerCase().includes(q)),
    );
  }, [projects, filter, showHidden, workspace]);
  const hiddenCount = (projects ?? []).filter((p) => p.hidden).length;

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        actions={
          projects && projects.length > 0 ? (
            <div className="flex items-center gap-2">
              <NewProject />
              <AddProject />
              <label className="flex h-7 w-56 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2">
                <Search size={13} className="text-fg-subtle" />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("projects.filter")}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
                />
              </label>
            </div>
          ) : (
            <AddProject />
          )
        }
      />
      {!projects && <LoadError error={error} onRetry={reload} />}
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
          <div className="mb-4 space-y-3">
            <BriefingCard />
            <TodayStrip />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {projects
              ? shown.map((project) => <ProjectCard key={project.id} project={project} people={people} />)
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
