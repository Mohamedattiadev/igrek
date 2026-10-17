import type { GitInfo, ProjectDetail } from "@godeye/core";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  EyeOff,
  GitBranch,
  GitCommitHorizontal,
  Plug,
  RefreshCw,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { NewSession } from "../components/NewSession";
import { TeamPresence } from "../components/TeamPresence";
import { Badge, Button, Card, EmptyState, Section, Segmented } from "../components/ui";
import { ActiveDot, HealthBadge, SummaryView } from "../components/work";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useAccounts, useLiveData } from "../lib/live";
import { BoardTab } from "./project/Board";
import { CodeTab } from "./project/Code";
import { CodeHostTab } from "./project/CodeHost";
import { DocsTab } from "./project/Docs";
import { EnvironmentsTab } from "./project/Environments";
import { MemoryTab } from "./project/Memory";
import { MonitorTab } from "./project/Monitor";
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
        {project.git && <GitFlow project={project} />}
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
    <Card>
      <div className="divide-y divide-border">
        {data?.map((session) => (
          <SessionRow key={session.id} session={session} projectId={projectId} />
        ))}
      </div>
    </Card>
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
          className="h-8 rounded-ui border border-border bg-bg px-2 text-[13px]"
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
            className="h-8 flex-1 rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
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
      <header className="shrink-0 border-b border-border px-6 pt-3">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-fg-subtle hover:text-fg" aria-label={t("nav.projects")}>
            <ArrowLeft size={16} className="rtl:rotate-180" />
          </Link>
          {project && <ActiveDot active={project.activeSessions > 0} />}
          <h1 className="text-[15px] font-semibold">{project?.name ?? "…"}</h1>
          {project?.health && <HealthBadge health={project.health} />}
          {project && (project.share !== "off" || project.teamLinked) && <TeamPresence projectId={project.id} />}
          <div className="flex-1" />
          {project && <NewSession projectId={project.id} />}
        </div>
        <nav className="-mx-6 mt-2 flex gap-1 overflow-x-auto px-6 [scrollbar-width:none]">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setParams(name === "overview" ? {} : { tab: name })}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors",
                tab === name ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {name === "code" ? t("code.tab") : t(`project.${name}`)}
              {name === "sessions" && project && <span className="ms-1.5 text-fg-subtle">{project.sessionCount}</span>}
              {name === "memory" && project && (
                <span
                  className={cn("ms-1.5", project.memory.some((m) => m.conflict) ? "text-warning" : "text-fg-subtle")}
                >
                  {project.memory.length}
                </span>
              )}
            </button>
          ))}
        </nav>
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
      <div className={tab === "code" ? "flex min-h-0 flex-1" : "mx-auto w-full max-w-6xl p-6"}>
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
        ) : tab === "memory" ? (
          <MemoryTab project={project} onChange={reload} />
        ) : (
          <Setup project={project} onChange={reload} />
        )}
      </div>
    </>
  );
}
