import type { TesterProfile, TesterRun, TesterSession } from "@godeye/core";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Ear,
  Flame,
  Glasses,
  Globe,
  Heart,
  LoaderCircle,
  Palette,
  Play,
  Repeat,
  Rocket,
  Signal,
  Skull,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { startPersonaChat } from "../lib/personas";
import { useProjects } from "./Personas";

const ICONS: Record<string, LucideIcon> = {
  Heart,
  Glasses,
  Rocket,
  Smartphone,
  Briefcase,
  Globe,
  Ear,
  Palette,
  Signal,
  Flame,
  Skull,
  Zap,
  UserRound,
};
const OUTCOME_TONE = { success: "success", struggled: "warning", "gave-up": "danger" } as const;
const SEVERITY_TONE = { critical: "danger", major: "warning", minor: "neutral" } as const;
const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

function useTesterProfiles() {
  const [profiles, setProfiles] = useState<TesterProfile[]>([]);
  const load = () => {
    api
      .testerProfiles()
      .then(setProfiles)
      .catch(() => undefined);
  };
  useEffect(load, []);
  return { profiles, reload: load };
}

function useTesterLabel() {
  const { t, i18n } = useTranslation();
  return (profile: TesterProfile | undefined, id: string) => {
    if (!profile) return { name: id, who: "" };
    if (!profile.builtin) return { name: profile.name || id, who: profile.who || "" };
    return {
      name: i18n.exists(`testers.p.${id}.name`) ? t(`testers.p.${id}.name`) : id,
      who: i18n.exists(`testers.p.${id}.who`) ? t(`testers.p.${id}.who`) : "",
    };
  };
}

function TesterIcon({ profile, size = 14 }: { profile?: TesterProfile; size?: number }) {
  const Icon = (profile && ICONS[profile.icon]) || UserRound;
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-bg-muted text-fg-muted">
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** "Teyze testi", automatic: pick people, a task and an address; they try it in a real browser. */
export function TestersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects();
  const label = useTesterLabel();
  const { profiles, reload } = useTesterProfiles();
  const [status, setStatus] = useState<{ browser: boolean; mcp: boolean }>();
  const [runs, setRuns] = useState<TesterRun[]>([]);
  const [url, setUrl] = useState("http://localhost:3000");
  const [task, setTask] = useState("");
  const [projectId, setProjectId] = useState("");
  const [picked, setPicked] = useState<string[]>(["aunt", "uncle", "busy-exec", "screen-reader", "first-phone"]);
  const [copies, setCopies] = useState(1);
  const [parallel, setParallel] = useState(3);
  const [model, setModel] = useState("sonnet");
  const [local, setLocal] = useState(true);
  const [audience, setAudience] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const loadRuns = () => {
    api
      .testerRuns()
      .then(setRuns)
      .catch(() => undefined);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once
  useEffect(() => {
    loadRuns();
    api
      .testerStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);
  useServerEvent("testers-changed", loadRuns);
  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .checkTesterUrl(url)
        .then((r) => setLocal(r.local))
        .catch(() => setLocal(true));
    }, 400);
    return () => clearTimeout(timer);
  }, [url]);

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const run = await api.startTesterRun({
        url,
        task,
        profileIds: picked,
        copies,
        parallel,
        projectId: projectId || undefined,
        model,
      });
      navigate(`/test-runs/${run.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const draft = async () => {
    setDrafting(true);
    setError(undefined);
    try {
      const made = await api.draftTesterProfiles(audience);
      reload();
      setPicked([...picked, ...made.map((p) => p.id)]);
      setAudience("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  const total = picked.length * copies;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-fg-muted">{t("testers.intro")}</p>
      {status && !status.browser && (
        <p className="flex items-start gap-2 rounded-ui border border-warning bg-warning-soft p-2.5 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          {t("testers.noBrowser")}
        </p>
      )}
      <Card className="space-y-3 p-pad">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-fg-muted">{t("testers.url")}</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={`${input} font-mono`} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-fg-muted">{t("meeting.project")}</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input}>
              <option value="">{t("meeting.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!local && <p className="text-xs text-warning">{t("testers.notLocal")}</p>}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-fg-muted">{t("testers.task")}</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={2}
            placeholder={t("testers.taskHint")}
            className={input}
          />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-fg-muted">{t("testers.who")}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => {
              const l = label(p, p.id);
              const on = picked.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-ui border p-2 text-start",
                    on ? "border-accent bg-accent-soft/40" : "border-border hover:bg-bg-hover",
                  )}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="mt-1" />
                  <TesterIcon profile={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{l.name}</span>
                    <span className="block text-[11px] leading-snug text-fg-subtle">{l.who}</span>
                  </span>
                  {!p.builtin && (
                    <button
                      type="button"
                      aria-label={t("persona.delete")}
                      onClick={(e) => {
                        e.preventDefault();
                        void api.removeTesterProfile(p.id).then(reload);
                      }}
                      className="p-0.5 text-fg-subtle hover:text-danger"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-2 rounded-ui bg-bg-subtle p-2">
          <label className="block min-w-60 flex-1 space-y-1">
            <span className="text-xs font-medium text-fg-muted">{t("testers.audience")}</span>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder={t("testers.audienceHint")}
              className={input}
            />
          </label>
          <Button icon={Sparkles} onClick={() => void draft()} disabled={drafting || audience.trim().length < 8}>
            {drafting ? t("persona.drafting") : t("testers.makeProfiles")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          <label className="flex items-center gap-1.5">
            {t("testers.copies")}
            <input
              type="number"
              min={1}
              max={10}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="h-7 w-14 rounded-md border border-border bg-bg px-1.5 text-fg"
            />
          </label>
          <label className="flex items-center gap-1.5">
            {t("testers.parallel")}
            <input
              type="number"
              min={1}
              max={10}
              value={parallel}
              onChange={(e) => setParallel(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="h-7 w-14 rounded-md border border-border bg-bg px-1.5 text-fg"
            />
          </label>
          <label className="flex items-center gap-1.5">
            {t("chat.model")}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-7 rounded-md border border-border bg-bg px-1.5 text-fg"
            >
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
              <option value="opus">Opus</option>
            </select>
          </label>
          <span>{t("testers.total", { count: Math.min(total, 50) })}</span>
        </div>
        <p className="text-[11px] text-fg-subtle">{t("testers.usageNote")}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end">
          <Button
            variant="primary"
            icon={Play}
            onClick={() => void start()}
            disabled={busy || !picked.length || task.trim().length < 5 || status?.browser === false}
          >
            {t("testers.start")}
          </Button>
        </div>
      </Card>
      {runs.length > 0 && (
        <Card>
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id}>
                <Link
                  to={`/test-runs/${run.id}`}
                  data-nav-item
                  className="flex items-center gap-3 px-pad py-2.5 hover:bg-bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{run.task}</p>
                    <p className="truncate font-mono text-[11px] text-fg-subtle">{run.url}</p>
                  </div>
                  {typeof run.summary?.aunt === "number" && (
                    <Badge tone={run.summary.aunt >= 70 ? "success" : run.summary.aunt >= 40 ? "warning" : "danger"}>
                      {t("testers.auntShort", { n: run.summary.aunt })}
                    </Badge>
                  )}
                  <Badge tone={run.status === "done" ? "success" : run.status === "running" ? "accent" : "neutral"}>
                    {t(`testers.status_${run.status}`)}
                  </Badge>
                  <span className="w-20 shrink-0 text-end text-[11px] text-fg-subtle">
                    {relativeTime(run.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SessionCard({
  run,
  session,
  profile,
  previous,
}: {
  run: TesterRun;
  session: TesterSession;
  profile?: TesterProfile;
  previous?: TesterSession;
}) {
  const { t } = useTranslation();
  const label = useTesterLabel()(profile, session.profileId);
  const [open, setOpen] = useState(session.status === "running");
  const folder = `${session.profileId}-${session.copy}`;
  const delta = previous?.ease !== undefined && session.ease !== undefined ? session.ease - previous.ease : undefined;
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex items-center gap-2">
        <TesterIcon profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">
            {label.name}
            {run.copies > 1 && <span className="text-fg-subtle"> #{session.copy}</span>}
          </p>
          <p className="truncate text-[11px] text-fg-subtle">{label.who}</p>
        </div>
        {session.status === "running" && (
          <LoaderCircle size={14} className="animate-spin text-fg-muted" aria-hidden="true" />
        )}
        {session.outcome && (
          <Badge tone={OUTCOME_TONE[session.outcome]}>{t(`testers.outcome_${session.outcome}`)}</Badge>
        )}
        {session.ease !== undefined && <Badge>{t("testers.ease", { n: session.ease })}</Badge>}
        {delta !== undefined && delta !== 0 && (
          <Badge tone={delta > 0 ? "success" : "danger"}>
            {t(delta > 0 ? "testers.better" : "testers.worse", { n: Math.abs(delta) })}
          </Badge>
        )}
      </div>
      {session.status === "failed" && <p className="text-xs text-danger">{session.error || t("testers.failed")}</p>}
      {session.quote && (
        <p className="border-s-2 border-border ps-2 text-[13px] italic leading-relaxed">“{session.quote}”</p>
      )}
      {!!session.complaints?.length && (
        <ul className="list-disc space-y-0.5 ps-4 text-[12.5px] text-fg-muted">
          {session.complaints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {session.screenshots.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto">
          {session.screenshots.map((name) => (
            <a
              key={name}
              href={`/api/testers/runs/${run.id}/files/${folder}/${name}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0"
            >
              <img
                src={`/api/testers/runs/${run.id}/files/${folder}/${name}`}
                alt={name}
                className="h-24 rounded border border-border object-cover object-top"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"
      >
        {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
        {t("testers.thinking", { count: session.steps.length })}
        {session.seconds !== undefined && ` · ${session.seconds} s`}
      </button>
      {open && (
        <ol className="max-h-80 space-y-1 overflow-y-auto border-s border-border ps-3 text-[12px]">
          {session.steps.map((step) => (
            <li key={`${step.at}-${step.action ?? ""}-${(step.thought ?? "").slice(0, 20)}`}>
              {step.thought ? (
                <span>{step.thought}</span>
              ) : (
                <span className="font-mono text-[11px] text-fg-subtle">{step.action}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** One test: how it went for each person, what bothered them, and what to fix (plan.md 6.1b). */
export function TestRunPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { runId = "" } = useParams();
  const [run, setRun] = useState<TesterRun>();
  const [previous, setPrevious] = useState<TesterRun>();
  const [error, setError] = useState<string>();
  const { profiles } = useTesterProfiles();
  const load = () => {
    api
      .testerRun(runId)
      .then((r) => {
        setRun(r);
        if (r.previousId)
          api
            .testerRun(r.previousId)
            .then(setPrevious)
            .catch(() => undefined);
      })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [runId]);
  useServerEvent("testers-changed", (m) => m.runId === runId && load());
  if (!run)
    return (
      <>
        <PageHeader title={t("testers.title")} />
        <p className="p-6 text-[13px] text-fg-muted">{error ?? t("persona.loading")}</p>
      </>
    );
  const s = run.summary;
  const sendIssue = (issue: { title: string; where: string; owner: "uiux" | "frontend" }) => {
    if (!run.projectId) return;
    void startPersonaChat(
      issue.owner,
      run.projectId,
      navigate,
      t("testers.fixDraft", { title: issue.title, where: issue.where, url: run.url, task: run.task }),
    ).catch((err: Error) => setError(err.message));
  };
  const done = run.sessions.filter((x) => x.status === "done" || x.status === "failed").length;

  return (
    <>
      <PageHeader
        title={t("testers.title")}
        actions={
          <div className="flex gap-1">
            {run.status === "running" ? (
              <Button size="sm" variant="danger" icon={Square} onClick={() => void api.stopTesterRun(run.id)}>
                {t("chat.stop")}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  onClick={() => void api.deleteTesterRun(run.id).then(() => navigate("/personas?tab=testers"))}
                >
                  {t("persona.delete")}
                </Button>
                <Button
                  size="sm"
                  icon={Repeat}
                  onClick={async () => navigate(`/test-runs/${(await api.repeatTesterRun(run.id)).id}`)}
                  data-tip={t("testers.repeatTip")}
                >
                  {t("testers.repeat")}
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <Link to="/personas?tab=testers" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" /> {t("testers.title")}
        </Link>
        <div>
          <h2 className="text-[15px] font-semibold">{run.task}</h2>
          <p className="mt-1 font-mono text-[11px] text-fg-subtle">
            {run.url} · {relativeTime(run.createdAt)} · {t(`testers.status_${run.status}`)}
            {run.status === "running" && ` (${done}/${run.sessions.length})`}
          </p>
          {previous && (
            <p className="mt-1 text-xs text-fg-muted">
              {t("testers.comparing", { when: relativeTime(previous.createdAt) })}
            </p>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {s && (
          <Card className="space-y-3 p-pad">
            <div className="flex flex-wrap gap-6">
              {typeof s.aunt === "number" && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                    {t("testers.aunt")}
                  </p>
                  <p className="text-[24px] font-semibold tabular-nums">
                    {s.aunt}
                    <span className="text-[13px] text-fg-subtle">/100</span>
                    {typeof previous?.summary?.aunt === "number" && previous.summary.aunt !== s.aunt && (
                      <span
                        className={cn(
                          "ms-2 text-[12px]",
                          s.aunt > previous.summary.aunt ? "text-success" : "text-danger",
                        )}
                      >
                        {s.aunt > previous.summary.aunt ? "+" : ""}
                        {s.aunt - previous.summary.aunt}
                      </span>
                    )}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("testers.success")}
                </p>
                <p className="text-[24px] font-semibold tabular-nums">{Math.round(s.success * 100)}%</p>
              </div>
              {s.averageSeconds !== undefined && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                    {t("testers.avgTime")}
                  </p>
                  <p className="text-[24px] font-semibold tabular-nums">{s.averageSeconds} s</p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle">{t("testers.auntHint")}</p>
            {s.issues.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("testers.issues")}
                </p>
                <ul className="mt-1 divide-y divide-border">
                  {s.issues.map((issue) => (
                    <li key={issue.title} className="flex flex-wrap items-center gap-2 py-1.5">
                      <Badge tone={SEVERITY_TONE[issue.severity]}>{t(`meeting.severity_${issue.severity}`)}</Badge>
                      <span className="min-w-0 flex-1 text-[12.5px]">
                        {issue.title}
                        <span className="text-fg-subtle"> · {issue.where}</span>
                        {issue.count > 1 && (
                          <span className="text-fg-subtle"> · {t("testers.times", { count: issue.count })}</span>
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!run.projectId}
                        onClick={() => sendIssue(issue)}
                        data-tip={run.projectId ? undefined : t("testers.needProject")}
                      >
                        {t(issue.owner === "frontend" ? "testers.toFrontend" : "testers.toUiux")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.complaints.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("testers.complaints")}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 ps-4 text-[12.5px]">
                  {s.complaints.map((c) => (
                    <li key={c.text}>
                      {c.text}
                      {c.count > 1 && (
                        <span className="text-fg-subtle"> · {t("testers.times", { count: c.count })}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {run.sessions.map((session) => (
            <SessionCard
              key={`${session.profileId}-${session.copy}`}
              run={run}
              session={session}
              profile={profiles.find((p) => p.id === session.profileId)}
              previous={previous?.sessions.find((p) => p.profileId === session.profileId && p.copy === session.copy)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
