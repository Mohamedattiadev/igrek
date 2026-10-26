import { type ProjectListItem, type ProjectNeeds, recommendArchitecture } from "@igrek/core";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  ChevronRight,
  FilePen,
  FileText,
  FlaskConical,
  FolderKanban,
  FolderPlus,
  GitBranch,
  Search,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { AddProjectForm } from "../components/AddProjectForm";
import { HandoffsPanel } from "../components/Handoff";
import { LoadError } from "../components/LoadError";
import { StartBox } from "../components/StartBox";
import { TeamAvatar, useTeamPeople } from "../components/TeamAvatar";
import { Button, Card, Dialog, EmptyState, PageHeader, Segmented } from "../components/ui";
import { useWorkspace } from "../components/WorkspacePicker";
import { DayEndButton } from "../components/Writeups";
import { ActiveDot, useSummaryText } from "../components/work";
import { api, request } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useIndexStatus, useLiveData } from "../lib/live";
import { useSettings } from "../lib/settings";

/** "~/Projects/shop" for "/home/me/Projects/shop": the start of a path says little and takes the room. */
function shortPath(path: string): string {
  return path.replace(/^\/home\/[^/]+|^\/Users\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/, "~");
}

/** A steady colour per project, so a card is found by its look before its name is read. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function TeamFaces({ project, people }: { project: ProjectListItem; people: ReturnType<typeof useTeamPeople> }) {
  // Teammates who worked here lately; the one working right now has a green dot.
  const here = people.presence.filter((p) => p.projectId === project.id);
  const members = (people.status?.members ?? []).filter(
    (m) =>
      m.id !== people.status?.user?.id && (project.teamAuthors.includes(m.id) || here.some((p) => p.userId === m.id)),
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
}

const DayCards = lazy(() => import("../components/DayCards").then((m) => ({ default: m.DayCards })));

/** A small grey label with an icon; its tip says in words what the number means. */
function Fact({
  icon: Icon,
  text,
  tip,
  tone,
}: {
  icon: typeof GitBranch;
  text: string;
  tip?: string;
  tone?: "warning" | "accent";
}) {
  return (
    <span
      data-tip={tip}
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full bg-bg-subtle px-2 py-0.5",
        tone === "warning" ? "text-warning" : tone === "accent" ? "text-accent" : "text-fg-muted",
      )}
    >
      <Icon size={11} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

function ProjectCard({ project, people }: { project: ProjectListItem; people: ReturnType<typeof useTeamPeople> }) {
  const { t } = useTranslation();
  const summary = useSummaryText(project.lastSummary);
  const git = project.git;
  const working = project.activeSessions > 0;
  const said = summary?.did[0] ?? project.lastSummary?.title;
  return (
    <Link
      to={`/p/${project.id}`}
      data-nav-item
      className="group flex min-h-36 flex-col rounded-ui border border-border bg-bg p-pad transition-colors hover:border-border-strong hover:bg-bg-subtle"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold text-white"
          style={{ background: `hsl(${hueOf(project.name)} 45% 42%)` }}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold">{project.name}</h3>
          <p className="truncate font-mono text-[11px] text-fg-subtle" title={project.path}>
            {shortPath(project.path)}
          </p>
        </div>
        <TeamFaces project={project} people={people} />
        {working ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
            <ActiveDot active />
            {t("projects.aiWorking")}
          </span>
        ) : (
          project.lastActivity > 0 && (
            <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(project.lastActivity)}</span>
          )
        )}
      </div>

      <p
        className={cn(
          "mt-3 line-clamp-2 flex-1 text-[13px] leading-relaxed",
          said ? "text-fg-muted" : "text-fg-subtle",
        )}
      >
        {said ?? t("projects.noSummary")}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        {git?.branch ? (
          <Fact icon={GitBranch} text={git.branch} tip={t("projects.branchTip")} />
        ) : (
          <Fact icon={GitBranch} text={t("projects.noGit")} />
        )}
        {git && git.changed > 0 && (
          <Fact
            icon={FilePen}
            text={t("projects.changedShort", { count: git.changed })}
            tip={t("projects.changedTip")}
            tone="warning"
          />
        )}
        {git && git.ahead > 0 && (
          <Fact
            icon={ArrowUp}
            text={t("projects.aheadShort", { count: git.ahead })}
            tip={t("projects.aheadTip")}
            tone="accent"
          />
        )}
        {git && git.behind > 0 && (
          <Fact
            icon={ArrowDown}
            text={t("projects.behindShort", { count: git.behind })}
            tip={t("projects.behindTip")}
            tone="warning"
          />
        )}
      </div>
    </Link>
  );
}

function AddProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => setOpen(true)}>
        {t("projects.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("projects.addTitle")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("projects.addTitle")}</h2>
          <AddProjectForm
            autoFocus
            onAdded={(id, as) => {
              setOpen(false);
              // A folder of projects lands back on the list, where its projects now show.
              void navigate(as === "one" ? `/p/${id}` : "/");
            }}
            actions={
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {t("memory.cancel")}
              </Button>
            }
          />
        </div>
      </Dialog>
    </>
  );
}

const TEMPLATE_IDS = ["saas", "api", "landing", "cli", "empty"] as const;

/** Team, scale and rhythm of a new project, and the architecture they point to (plan.md 15.2). */
function ArchitectureQuestions({ needs, onChange }: { needs: ProjectNeeds; onChange: (n: ProjectNeeds) => void }) {
  const { t } = useTranslation();
  const advice = recommendArchitecture(needs);
  const choice = <K extends "team" | "scale" | "releases">(key: K, options: ProjectNeeds[K][]) => (
    <label className="flex items-center justify-between gap-2 text-[12.5px]">
      <span>{t(`arch.ask_${key}`)}</span>
      <select
        value={needs[key]}
        onChange={(e) => onChange({ ...needs, [key]: e.target.value })}
        className="h-8 rounded-ui border border-border bg-bg px-2 text-[12.5px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {t(`arch.${key}_${o}`)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="rounded-ui border border-border p-2">
      <summary className="cursor-pointer text-[12.5px] font-medium">
        {t("arch.newTitle")}: {t(`arch.pattern_${advice.pattern}`)}
      </summary>
      <div className="mt-2 space-y-2">
        {choice("team", ["solo", "small", "large"])}
        {choice("scale", ["small", "growing", "high"])}
        {choice("releases", ["rare", "weekly", "daily"])}
        {(["background", "plugins"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={needs[key]}
              onChange={(e) => onChange({ ...needs, [key]: e.target.checked })}
            />
            {t(`arch.ask_${key}`)}
          </label>
        ))}
        <ul className="list-disc ps-5 text-[11.5px] text-fg-muted">
          {advice.reasons.map((r) => (
            <li key={r}>{t(`arch.why_${r}`)}</li>
          ))}
        </ul>
        <p className="text-[11px] text-fg-subtle">{t("arch.newNote")}</p>
      </div>
    </details>
  );
}

/** A new project from a template, carrying your conventions and lessons (plan.md 11). */
function NewProject() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  // Empty unless chosen: a newcomer who only clicks Create should not get a whole SaaS app.
  const [template, setTemplate] = useState<(typeof TEMPLATE_IDS)[number]>("empty");
  const [details, setDetails] = useState("");
  const [needs, setNeeds] = useState<ProjectNeeds>({
    team: "solo",
    scale: "small",
    releases: "weekly",
    background: false,
    plugins: false,
  });
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
      const made = await api.newProject({ name, parent, template, details, needs });
      setOpen(false);
      void navigate(made.runId ? `/runs/${made.runId}` : `/p/${made.projectId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";
  return (
    <>
      <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => setOpen(true)}>
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
          <ArchitectureQuestions needs={needs} onChange={setNeeds} />
          {practices && (
            <p className="text-[11px] text-fg-subtle">
              {t("templates.carries", { conventions: practices.conventions.length, lessons: practices.lessons.length })}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <DemoButton parent={parent} />
            <div className="flex-1" />
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

/** A demo project to try everything safely (plan.md 13.6). */
function DemoButton({ parent }: { parent?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <span className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={FlaskConical}
        disabled={busy}
        data-tip={error ?? t("demo.tip")}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const r = await request<{ projectId: string }>("/api/demo", {
              method: "POST",
              body: JSON.stringify({ parent: parent || undefined }),
            });
            void navigate(`/p/${r.projectId}`);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("templates.creating") : t("demo.button")}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

/** One line: what happened today in every workspace. */
/** Without summaries the cards say little; one quiet offer to turn them on. */
function SummariesOff() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [busy, setBusy] = useState(false);
  if (settings.autoSummarize) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
      <FileText size={13} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{t("projects.summariesOff")}</span>
      <button
        type="button"
        disabled={busy}
        className="shrink-0 font-medium text-accent-hover underline"
        onClick={() => {
          setBusy(true);
          void update({ autoSummarize: true }).finally(() => setBusy(false));
        }}
      >
        {t("projects.summariesOn")}
      </button>
    </p>
  );
}

const DAY_OPEN = "igrek.home.dayOpen";

/**
 * Briefing, day end and focus fold into one line below the projects, closed at first (plan.md 16.5):
 * the day's numbers and its two buttons sit on that line; opened, the cards stand side by side.
 */
function DaySection({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: today } = useLiveData(() => api.today(), []);
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(DAY_OPEN);
      if (saved) return saved === "1";
    } catch {
      // Private window: closed, as at first.
    }
    return false;
  });
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(DAY_OPEN, open ? "0" : "1");
    } catch {
      // Only a convenience.
    }
  };
  const numbers = today
    ? [t("today.sessions", { count: today.sessions }), t("today.commits", { count: today.commits })].join(" · ")
    : "";
  return (
    <section className="rounded-ui border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-start text-[13px] font-medium hover:text-fg"
        >
          <ChevronRight size={14} className={cn("shrink-0 transition-transform", open && "rotate-90")} />
          {t("projects.day")}
          {numbers && <span className="truncate text-[12px] font-normal text-fg-subtle">· {numbers}</span>}
        </button>
        <Button size="sm" variant="ghost" icon={Briefcase} onClick={() => navigate("/weekly")}>
          {t("weekly.title")}
        </Button>
        <DayEndButton />
      </div>
      {open && <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">{children}</div>}
    </section>
  );
}

/**
 * The folders Igrek saw Claude work in that are not projects: kept, out of the way, one click from
 * being added. Nothing found is ever lost or hidden for good.
 */
function FoundList({ projects, onChange }: { projects: ProjectListItem[]; onChange: () => void }) {
  const { t } = useTranslation();
  const add = (path: string) =>
    void api
      .addProject(path)
      .then(onChange)
      .catch(() => undefined);
  return (
    <Card>
      <p className="border-b border-border px-pad py-2 text-[12px] text-fg-muted">{t("projects.foundHint")}</p>
      <ul className="divide-y divide-border">
        {[...projects]
          .sort((a, b) => b.lastActivity - a.lastActivity)
          .map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-pad py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{p.name}</p>
                <p className="truncate font-mono text-[11.5px] text-fg-subtle">{p.path}</p>
              </div>
              <span className="shrink-0 text-[11.5px] text-fg-subtle">
                {t("projects.foundSessions", { count: p.sessionCount })} · {relativeTime(p.lastActivity)}
              </span>
              <Button size="sm" icon={FolderPlus} onClick={() => add(p.path)}>
                {t("projects.addAction")}
              </Button>
            </li>
          ))}
      </ul>
    </Card>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [statusView, setStatusView] = useState<ProjectListItem["status"]>("active");
  const { data: projects, error, reload } = useLiveData(() => api.projects(), []);
  const status = useIndexStatus();

  const workspace = useWorkspace();
  const people = useTeamPeople();
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (projects ?? []).filter(
      (p) =>
        (workspace === "all" || p.workspace === workspace) &&
        !p.hidden &&
        (q ? true : p.status === statusView) &&
        (!q || `${p.name} ${p.path}`.toLowerCase().includes(q)),
    );
  }, [projects, filter, workspace, statusView]);
  const statusCount = (s: ProjectListItem["status"]) =>
    (projects ?? []).filter((p) => p.status === s && !p.hidden).length;
  const visible = (projects ?? []).filter((p) => !p.hidden);
  const found = (projects ?? []).filter((p) => p.hidden);

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        actions={
          projects && projects.length > 0 ? (
            <div className="flex items-center gap-2">
              <HandoffsPanel />
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
            <div className="flex flex-wrap justify-center gap-2">
              <AddProject />
              <DemoButton />
            </div>
          }
        />
      ) : (
        <div className="p-6">
          <div className="mb-4 space-y-3">
            {projects && visible.length > 0 && <StartBox />}
            {(statusCount("paused") > 0 || statusCount("archived") > 0 || statusView !== "active") && (
              <Segmented
                label={t("projects.status")}
                value={statusView}
                onChange={setStatusView}
                options={(["active", "paused", "archived"] as const).map((s) => ({
                  value: s,
                  label: `${t(`projects.status_${s}`)} (${statusCount(s)})`,
                  tip: t(`projects.statusTip_${s}`),
                }))}
              />
            )}
          </div>
          {projects && visible.length === 0 && (
            <Card className="flex flex-wrap items-center gap-3 p-pad">
              <FolderKanban size={18} className="text-fg-subtle" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{t("projects.noneAdded")}</p>
                <p className="text-[12.5px] text-fg-muted">{t("projects.noneAddedBody")}</p>
              </div>
              <AddProject />
            </Card>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {projects
              ? shown.map((project) => <ProjectCard key={project.id} project={project} people={people} />)
              : [0, 1, 2, 3].map((i) => <Card key={i} className="h-40 animate-pulse bg-bg-subtle" />)}
          </div>
          {found.length > 0 && (
            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                aria-expanded={showHidden}
                className="text-xs text-fg-subtle hover:text-fg"
              >
                {showHidden ? t("projects.foundHide") : t("projects.foundShow", { count: found.length })}
              </button>
              {showHidden && <FoundList projects={found} onChange={reload} />}
            </div>
          )}
          {/* About the day, not about one project: below the projects, closed until opened. */}
          <div className="mt-6">
            <DaySection>
              {/* Loaded when the section is opened: it starts closed, so the first screen stays light. */}
              <Suspense fallback={null}>
                <DayCards projects={projects ?? []} onChange={reload} />
              </Suspense>
              <div className="md:col-span-2">
                <SummariesOff />
              </div>
            </DaySection>
          </div>
        </div>
      )}
    </>
  );
}
