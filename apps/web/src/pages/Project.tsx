import type { GitInfo, ProjectDetail } from "@igrek/core";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  Code,
  EyeOff,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  MessageSquarePlus,
  MessagesSquare,
  Plug,
  Puzzle,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  SquareKanban,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { NewSession } from "../components/NewSession";
import { TeamPresence } from "../components/TeamPresence";
import { Badge, Button, Card, EmptyState, field, Section, Segmented } from "../components/ui";
import { ActiveDot, HealthBadge, SummaryView } from "../components/work";
import { api, request } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useAccounts, useLiveData } from "../lib/live";
import { usePageActions } from "../lib/page-actions";
import { useSettings } from "../lib/settings";
import { BoardTab } from "./project/Board";
import { CodeTab } from "./project/Code";
import { CodeHostTab } from "./project/CodeHost";
import { DocsTab } from "./project/Docs";
import { EnvironmentsTab } from "./project/Environments";
import { ExpertsTab } from "./project/Experts";
import { MemoryTab } from "./project/Memory";
import { MonitorTab } from "./project/Monitor";
import { OpenChats } from "./project/OpenChats";
import { PreviewTab } from "./project/Preview";
import { SectionsTab } from "./project/Sections";
import { SessionRow } from "./project/SessionRow";
import { ReportsCard, TimelineTab } from "./project/Timeline";
import { ProjectPlugins } from "./tools/Plugins";

const TABS = [
  "overview",
  "board",
  "preview",
  "sections",
  "timeline",
  "sessions",
  "files",
  "experts",
  "code",
  "memory",
  "docs",
  "host",
  "environments",
  "monitor",
  "plugins",
  "setup",
] as const;
type Tab = (typeof TABS)[number];
/**
 * Shown as tabs; the rest sit under "More" so a new user sees a handful of choices, not fifteen.
 * Five: Experts and Monitor went under "More" too (the Experts page has them all, and Monitor is
 * for a project that runs somewhere).
 */
const MAIN_TABS: Tab[] = ["overview", "sessions", "code", "board", "sections"];
/**
 * The Simple view (for people who do not write code): a project is what it says, its chats and its
 * files. The other tabs are still there for a link that points at them, they are only not offered.
 */
const SIMPLE_TABS: Tab[] = ["overview", "sessions", "files"];

/** One small icon per tab, so a tab is found by shape as well as by name. */
const TAB_ICONS: Record<Tab, LucideIcon> = {
  overview: LayoutDashboard,
  board: SquareKanban,
  preview: AppWindow,
  sections: Gauge,
  timeline: History,
  sessions: MessagesSquare,
  files: FolderOpen,
  experts: UsersRound,
  code: Code,
  memory: Brain,
  docs: BookOpen,
  host: GitPullRequest,
  environments: Layers,
  monitor: Activity,
  plugins: Puzzle,
  setup: Settings2,
};

function tabLabel(t: (key: string) => string, name: Tab): string {
  return name === "code" ? t("code.tab") : t(`project.${name}`);
}

/** Plain-language warnings about where the code stands vs. the remote (plan.md 1.2c). */
function gitWarnings(git: GitInfo): { tone: "warning" | "accent"; key: string; count?: number }[] {
  const out: { tone: "warning" | "accent"; key: string; count?: number }[] = [];
  if (git.behind > 0) out.push({ tone: "warning", key: "git.behind", count: git.behind });
  if (git.changed > 0) out.push({ tone: "warning", key: "git.changed", count: git.changed });
  if (git.ahead > 0) out.push({ tone: "accent", key: "git.ahead", count: git.ahead });
  if (!git.hasUpstream && git.branch) out.push({ tone: "accent", key: "git.noUpstream" });
  return out;
}

function Overview({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  // The Simple view leaves the code flow (upstream, ahead and behind) to the Developer view.
  const simple = useSettings().settings.mode === "simple";
  const latest = project.recentSessions.find((s) => s.summary);
  const status = project.memory.filter((m) => m.section === "status").slice(0, 2);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
        <ReportsCard projectId={project.id} />
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
        {project.git && !simple && <GitFlow project={project} />}
      </div>
    </div>
  );
}

function GitCard({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const git = project.git;
  if (useSettings().settings.mode === "simple") return <PlainFolderCard project={project} />;
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

/** The Simple view's folder card: where the project is and its last saved change, without branch or hash. */
function PlainFolderCard({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const last = project.git?.lastCommit;
  return (
    <Card className="space-y-2.5 p-pad text-[13px]">
      <div>
        <p className="text-xs text-fg-subtle">{t("project.path")}</p>
        <p className="break-all font-mono text-xs">{project.path}</p>
      </div>
      {last && (
        <div className="border-t border-border pt-2.5">
          <p className="text-xs text-fg-subtle">{t("project.lastCommit")}</p>
          <p className="truncate">{last.subject}</p>
          <p className="text-[11px] text-fg-subtle">
            {last.author} · {relativeTime(last.at)}
          </p>
        </div>
      )}
    </Card>
  );
}

function GitFlow({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const [git, setGit] = useState(project.git);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!git) return null;
  const warnings = gitWarnings(git);
  const fetchRemote = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setGit((await api.fetchRemote(project.id)).git);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-2.5 p-pad">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("git.title")}</h3>
        {git.remote && (
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={fetchRemote} disabled={busy}>
            {busy ? t("project.fetching") : t("project.fetch")}
          </Button>
        )}
      </div>
      {warnings.length === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-success">
          <CheckCircle2 size={14} />
          {t("git.clean")}
        </p>
      ) : (
        <ul className="space-y-2">
          {warnings.map((w) => (
            <li key={w.key} className="flex gap-2 text-[13px] leading-relaxed">
              <AlertTriangle
                size={14}
                className={cn("mt-0.5 shrink-0", w.tone === "warning" ? "text-warning" : "text-accent")}
              />
              {t(w.key, { count: w.count })}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
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
    <div className="space-y-4">
      <OpenChats projectId={projectId} />
      <Card>
        <div className="divide-y divide-border">
          {data?.map((session) => (
            <SessionRow key={session.id} session={session} projectId={projectId} />
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Whether chats may load this project's own hooks, MCP servers and skills (plan.md 16.4). */
function TrustState({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, reload } = useLiveData(() => api.projectTrust(projectId), [projectId]);
  if (!data) return null;
  if (!data.extensions) return <p className="text-xs text-fg-subtle">{t("trust.none")}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone={data.trusted ? "success" : "warning"}>
        {data.trusted ? t("trust.trusted") : t("trust.notTrusted")}
      </Badge>
      <span className="text-xs text-fg-muted">
        {[...data.extensions.hooks.map(() => "hook"), ...data.extensions.mcpServers, ...data.extensions.skills].length}{" "}
        {t("trust.items")}
      </span>
      <Button
        size="sm"
        onClick={async () => {
          await api.setProjectTrust(projectId, !data.trusted);
          reload();
        }}
      >
        {data.trusted ? t("trust.revoke") : t("trust.trustShort")}
      </Button>
    </div>
  );
}

/** The optional pre-commit hook that runs the project's checks (plan.md 15.5). */
function CommitHook({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data, reload } = useLiveData(() => api.commitHook(projectId), [projectId]);
  const [problem, setProblem] = useState<string>();
  if (!data) return null;
  if (data.state === "noGit") return <p className="text-xs text-fg-subtle">{t("commitHook.noGit")}</p>;
  if (data.state === "other") return <p className="text-xs text-fg-subtle">{t("commitHook.other")}</p>;
  if (!data.commands.length) return <p className="text-xs text-fg-subtle">{t("commitHook.nothing")}</p>;
  const on = data.state === "ours";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={on ? "success" : "neutral"}>{on ? t("setup.on") : t("setup.off")}</Badge>
        <Button
          size="sm"
          onClick={async () => {
            setProblem(undefined);
            try {
              await api.setCommitHook(projectId, !on);
              reload();
            } catch (err) {
              setProblem((err as Error).message);
            }
          }}
        >
          {on ? t("setup.uninstall") : t("setup.install")}
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        {t("commitHook.runs")} <code className="font-mono">{data.commands.join(" · ")}</code>
      </p>
      {problem && <p className="text-xs text-danger">{problem}</p>}
    </div>
  );
}

/** Steps always allowed in this project, saved from a chat's approval card (plan.md 16.1). */
function ToolRules({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: rules, reload } = useLiveData(() => api.toolRules(projectId), [projectId]);
  if (!rules?.length) return <p className="text-xs text-fg-subtle">{t("setup.rulesEmpty")}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rules.map((rule) => (
        <li key={rule} className="flex items-center gap-1 rounded-full border border-border bg-bg-subtle ps-2.5 pe-1">
          <code className="font-mono text-[12px]">{rule}</code>
          <button
            type="button"
            aria-label={t("setup.rulesRemove", { rule })}
            title={t("setup.rulesRemove", { rule })}
            onClick={async () => {
              await api.removeToolRule(projectId, rule);
              reload();
            }}
            className="rounded-full p-0.5 text-fg-subtle hover:text-danger"
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Setup({ project, onChange }: { project: ProjectDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(project.name);
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
      <Section title={t("project.statusLabel")} hint={t(`projects.statusTip_${project.status}`)}>
        <Segmented
          label={t("project.statusLabel")}
          value={project.status}
          onChange={(status) => void api.setProjectStatus(project.id, status).then(onChange)}
          options={(["active", "paused", "archived"] as const).map((s) => ({
            value: s,
            label: t(`projects.status_${s}`),
          }))}
        />
      </Section>
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
          {t("setup.file")} <code className="break-all font-mono">{project.path}/.claude/settings.local.json</code>
        </p>
      </Section>
      <Section title={t("trust.title")} hint={t("trust.hint")}>
        <TrustState projectId={project.id} />
      </Section>
      <Section title={t("commitHook.title")} hint={t("commitHook.hint")}>
        <CommitHook projectId={project.id} />
      </Section>
      <Section title={t("setup.rulesTitle")} hint={t("setup.rulesHint")}>
        <ToolRules projectId={project.id} />
      </Section>
      <Section title={t("project.gitFlow")} hint={t("project.gitFlowHint")}>
        <Segmented
          value={project.gitFlow ? "on" : "off"}
          onChange={async (v) => {
            await api.setGitFlow(project.id, v === "on");
            onChange();
          }}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      <Section title={t("team.sharing")} hint={t("team.shareHint")}>
        <Segmented
          value={project.share}
          onChange={async (share) => {
            await api.setShare(project.id, share);
            onChange();
          }}
          options={(["off", "summary", "full"] as const).map((s) => ({
            value: s,
            label: t(`team.share_${s}`),
            tip: t(`team.shareTip_${s}`),
          }))}
        />
      </Section>
      <Section title={t("accounts.forProject")} hint={t("accounts.noSwitch")}>
        <select
          defaultValue={project.accountId ?? ""}
          onChange={async (e) => {
            await api.setProjectAccount(project.id, e.target.value || null);
            onChange();
          }}
          className={field}
        >
          <option value="">{t("accounts.followActive")}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.provider === "codex" ? "Codex" : "Claude"} · {account.label}
              {account.email ? ` (${account.email})` : ""}
            </option>
          ))}
        </select>
      </Section>
      <Section title={t("project.rename")} hint={t("project.renameHint")}>
        <div className="flex max-w-md gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("project.rename")}
            className={cn(field, "flex-1")}
          />
          <Button
            disabled={!name.trim() || name === project.name}
            onClick={async () => {
              await api.renameProject(project.id, name);
              onChange();
            }}
          >
            {t("project.save")}
          </Button>
        </div>
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

/** The project's parts marked "on open" start once per visit of Igrek (launcher.ts, plan.md 19.4). */
const opened = new Set<string>();
function useStartOnOpen(projectId: string) {
  useEffect(() => {
    if (!projectId || opened.has(projectId)) return;
    opened.add(projectId);
    void request(`/api/projects/${projectId}/launch/opened`, { method: "POST", body: "{}" }).catch(() => undefined);
  }, [projectId]);
}

export function ProjectPage() {
  const { t } = useTranslation();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((name) => name === params.get("tab")) ?? "overview") as Tab;
  const simple = useSettings().settings.mode === "simple";
  const navigate = useNavigate();
  useStartOnOpen(projectId);
  usePageActions([
    {
      id: "project-chat",
      label: t("palette.newChatHere"),
      icon: MessageSquarePlus,
      keys: "Alt+N",
      run: () => void navigate(`/c/new?project=${encodeURIComponent(projectId)}`),
    },
    {
      id: "project-setup",
      label: t("palette.openSetup"),
      icon: SlidersHorizontal,
      run: () => setParams({ tab: "setup" }),
    },
  ]);
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
    return (
      <EmptyState
        icon={Brain}
        title={t("project.notFound")}
        body={error}
        action={
          <Button icon={RefreshCw} onClick={reload}>
            {t("errors.retry")}
          </Button>
        }
      />
    );
  }
  return (
    <>
      <header className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <BackLink to="/" className="text-fg-subtle hover:text-fg" aria-label={t("nav.projects")}>
            <ArrowLeft size={16} className="rtl:rotate-180" />
          </BackLink>
          {project && <ActiveDot active={project.activeSessions > 0} />}
          <h1 className="text-[15px] font-semibold">{project?.name ?? "…"}</h1>
          {project?.health && <HealthBadge health={project.health} />}
          {project && (project.share !== "off" || project.teamLinked) && <TeamPresence projectId={project.id} />}
          <div className="flex-1" />
          {project && <NewSession projectId={project.id} />}
        </div>
        <div className="mt-2">
          <Segmented
            label={project?.name}
            value={tab}
            wrap
            onChange={(name) => setParams(name === "overview" ? {} : { tab: name })}
            options={(simple ? SIMPLE_TABS : MAIN_TABS).map((name) => ({
              value: name,
              label: tabLabel(t, name),
              icon: TAB_ICONS[name],
              count:
                name === "sessions" && project ? (
                  project.sessionCount
                ) : name === "memory" && project ? (
                  <span className={project.memory.some((m) => m.conflict) ? "text-warning" : undefined}>
                    {project.memory.length}
                  </span>
                ) : undefined,
            }))}
            more={
              simple
                ? undefined
                : {
                    label: t("project.more"),
                    // Files is the Code tab without the developer parts; in this view the Code tab is right there.
                    options: TABS.filter((name) => !MAIN_TABS.includes(name) && name !== "files").map((name) => ({
                      value: name,
                      label: tabLabel(t, name),
                      icon: TAB_ICONS[name],
                    })),
                  }
            }
          />
        </div>
      </header>
      {project?.teamLinked && project.share === "off" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-6 py-2 text-xs">
          <Users size={13} className="text-accent" aria-hidden="true" />
          <span className="text-fg-muted">{t("team.linkedBanner")}</span>
          <Button
            size="sm"
            onClick={() => void api.setShare(project.id, "full").then(reload)}
            data-tip={t("team.shareTip_full")}
          >
            {t("team.linkedShare")}
          </Button>
        </div>
      )}
      <div className={tab === "code" || tab === "files" ? "flex min-h-0 flex-1" : "mx-auto w-full max-w-6xl p-6"}>
        {!project ? (
          <div className="h-64 animate-pulse rounded-ui bg-bg-subtle" />
        ) : tab === "overview" ? (
          <Overview project={project} />
        ) : tab === "board" ? (
          <BoardTab project={project} />
        ) : tab === "preview" ? (
          <PreviewTab project={project} />
        ) : tab === "sections" ? (
          <SectionsTab project={project} />
        ) : tab === "environments" ? (
          <EnvironmentsTab project={project} />
        ) : tab === "timeline" ? (
          <TimelineTab projectId={project.id} />
        ) : tab === "code" ? (
          <CodeTab project={project} />
        ) : tab === "files" ? (
          <CodeTab project={project} plain />
        ) : tab === "sessions" ? (
          <Sessions projectId={project.id} />
        ) : tab === "host" ? (
          <CodeHostTab projectId={project.id} />
        ) : tab === "docs" ? (
          <DocsTab projectId={project.id} />
        ) : tab === "plugins" ? (
          <ProjectPlugins projectId={project.id} />
        ) : tab === "monitor" ? (
          <MonitorTab project={project} />
        ) : tab === "experts" ? (
          <ExpertsTab project={project} />
        ) : tab === "memory" ? (
          <MemoryTab project={project} onChange={reload} />
        ) : (
          <Setup project={project} onChange={reload} />
        )}
      </div>
    </>
  );
}
