import type { SessionDetail, TranscriptMessage } from "@godeye/core";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  FileWarning,
  GitFork,
  MessageSquare,
  Package,
  Play,
  RotateCcw,
  Sparkles,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, EmptyState } from "../components/ui";
import { ActiveDot, ContextBar, HealthBadge, SummaryView } from "../components/work";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, dateTime, mainModel, modelName, relativeTime } from "../lib/format";
import { useLiveData } from "../lib/live";

function Message({ message }: { message: TranscriptMessage }) {
  const { t } = useTranslation();
  if (message.kind === "error") {
    return (
      <div className="ms-9 rounded-md border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs">
        <p className="mb-0.5 flex items-center gap-1.5 font-medium text-danger">
          <XCircle size={12} />
          {t("session.failed")}
          {message.toolName && <span className="font-mono font-normal">· {message.toolName}</span>}
        </p>
        <pre className="max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-[11px] text-fg-muted">
          {message.text}
        </pre>
      </div>
    );
  }
  if (message.kind === "tool") {
    return (
      <div className="flex items-center gap-2 ps-9 text-xs text-fg-subtle">
        <Wrench size={12} />
        <span className="truncate font-mono">{message.text}</span>
      </div>
    );
  }
  const user = message.role === "user";
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          user ? "bg-accent-soft text-accent" : "bg-bg-muted text-fg-muted",
        )}
      >
        {user ? <User size={13} /> : <Bot size={13} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-medium text-fg-subtle">
          {user ? t("session.you") : t("session.ai")} · {relativeTime(message.ts)}
        </p>
        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.text}</div>
      </div>
    </div>
  );
}

function ResumeButtons({ session }: { session: SessionDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const open = async (action: () => Promise<{ id: string }>) => {
    setError(undefined);
    try {
      navigate(`/t/${(await action()).id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const projectId = session.projectId ?? "";
  return (
    <div className="flex items-center gap-1">
      {error && <span className="me-2 text-xs text-danger">{error}</span>}
      <Button
        size="sm"
        variant="ghost"
        icon={RotateCcw}
        title={t("term.freshHint")}
        onClick={() => open(() => api.handoff(session.id))}
      >
        <span className="hidden lg:inline">{t("term.fresh")}</span>
      </Button>
      {(["claude", "codex"] as const)
        .filter((tool) => tool !== session.tool)
        .map((tool) => (
          <Button
            key={tool}
            size="sm"
            variant="ghost"
            icon={ArrowRightLeft}
            title={t("term.handToHint", { tool: t(`term.${tool}`) })}
            onClick={() => open(() => api.handoff(session.id, tool))}
          >
            <span className="hidden xl:inline">{t("term.handTo", { tool: t(`term.${tool}`) })}</span>
          </Button>
        ))}
      <Button
        size="sm"
        variant="ghost"
        icon={GitFork}
        title={t("term.forkHint")}
        onClick={() => open(() => api.startTerminal({ projectId, tool: session.tool, resume: session.id, fork: true }))}
      >
        <span className="hidden lg:inline">{t("term.fork")}</span>
      </Button>
      <Button
        size="sm"
        variant="primary"
        icon={Play}
        onClick={() => open(() => api.startTerminal({ projectId, tool: session.tool, resume: session.id }))}
      >
        {t("term.resume")}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-fg-subtle">{label}</p>
      <p className="text-[13px] font-medium">{value}</p>
    </div>
  );
}

function HealthCard({ session }: { session: SessionDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { health } = session;
  return (
    <Card className="space-y-3 p-pad">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("health.title")}</h3>
        <HealthBadge health={health} />
      </div>
      <div title={t("health.contextHint")}>
        <p className="mb-1 text-xs text-fg-muted">{t("health.context")}</p>
        <ContextBar fill={health.contextFill} />
      </div>
      {health.flags.length > 0 && (
        <ul className="space-y-1">
          {health.flags.map((flag) => (
            <li key={flag} className="flex items-center gap-2 text-xs text-fg-muted">
              <AlertTriangle size={12} className="text-warning" />
              {t(`health.${flag}`)}
            </li>
          ))}
        </ul>
      )}
      {health.suggestCompact && (
        <p className="rounded-md bg-accent-soft p-2.5 text-xs leading-relaxed text-accent">{t("health.compact")}</p>
      )}
      {health.suggestFresh && (
        <div className="space-y-2 rounded-md bg-warning-soft p-2.5">
          <p className="text-xs leading-relaxed text-warning">{t("health.fresh")}</p>
          <Button
            size="sm"
            variant="primary"
            icon={RotateCcw}
            onClick={async () => navigate(`/t/${(await api.handoff(session.id)).id}`)}
          >
            {t("term.fresh")}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function SessionPage() {
  const { t } = useTranslation();
  const { projectId = "", sessionId = "" } = useParams();
  const [showTools, setShowTools] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summaryError, setSummaryError] = useState<string>();
  const {
    data: session,
    error,
    reload,
  } = useLiveData(
    () => api.session(sessionId),
    [sessionId],
    (_, sessionIds) => sessionIds.includes(sessionId),
  );

  if (error && !session) return <EmptyState icon={MessageSquare} title={t("session.notFound")} body={error} />;

  const summarize = async () => {
    setBusy(true);
    setSummaryError(undefined);
    try {
      await api.summarize(sessionId);
      reload();
    } catch (err) {
      setSummaryError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const model = session && mainModel(session.models);
  const messages = session?.messages.filter((m) => showTools || (m.kind !== "tool" && m.kind !== "error")) ?? [];
  const riskyPackages = session?.packages.filter((p) => p.status === "missing" || p.status === "new") ?? [];

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-6">
        <Link to={`/p/${projectId}`} className="text-fg-subtle hover:text-fg" aria-label={t("nav.projects")}>
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </Link>
        {session && <ActiveDot active={session.active} />}
        <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold">
          {session?.summary?.title || session?.title || "…"}
        </h1>
        {session?.active && <Badge tone="success">{t("session.active")}</Badge>}
        {session?.projectId && <ResumeButtons session={session} />}
      </header>
      {!session ? (
        <div className="m-6 h-64 animate-pulse rounded-ui bg-bg-subtle" />
      ) : (
        <div className="mx-auto grid w-full max-w-6xl gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <Card className="p-pad">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("session.summary")}</h3>
                <Button size="sm" variant="ghost" icon={Sparkles} onClick={summarize} disabled={busy}>
                  {busy
                    ? t("session.summarizing")
                    : session.summary
                      ? t("session.resummarize")
                      : t("session.summarize")}
                </Button>
              </div>
              {session.summary ? (
                <SummaryView summary={session.summary} />
              ) : (
                <p className="text-[13px] text-fg-muted">{t("session.noSummaryBody")}</p>
              )}
              {summaryError && <p className="mt-2 text-xs text-danger">{summaryError}</p>}
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b border-border px-pad py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("session.transcript")}
                </h3>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                  <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} />
                  {t("session.showTools")}
                </label>
              </div>
              {session.messages.length >= 400 && (
                <p className="border-b border-border px-pad py-2 text-xs text-fg-subtle">{t("session.older")}</p>
              )}
              <div className="space-y-4 p-pad">
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <HealthCard session={session} />
            <Card className="grid grid-cols-2 gap-3 p-pad">
              <Stat label={t("session.started")} value={dateTime(session.startedAt)} />
              <Stat label={t("session.updated")} value={relativeTime(session.updatedAt)} />
              <Stat label={t("session.messages")} value={String(session.userMessages)} />
              <Stat label={t("session.toolCalls")} value={String(session.toolCalls)} />
              {model && <Stat label={t("session.model")} value={modelName(model)} />}
              <Stat
                label={t("session.tokens")}
                value={compactNumber(session.tokens.input + session.tokens.cacheRead + session.tokens.output)}
              />
            </Card>
            <Card className="space-y-2 p-pad">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("session.inView")}</h3>
              <p className={cn("text-xs", session.inView.memoryInjected ? "text-success" : "text-fg-muted")}>
                {session.inView.memoryInjected ? t("session.memoryOn") : t("session.memoryOff")}
              </p>
              {session.inView.recentFiles.length > 0 && (
                <>
                  <p className="text-[11px] text-fg-subtle">{t("session.inViewHint")}</p>
                  <ul className="space-y-0.5">
                    {session.inView.recentFiles.map((file) => (
                      <li key={file} className="truncate font-mono text-[11px] text-fg-muted" title={file}>
                        {session.cwd && file.startsWith(session.cwd) ? file.slice(session.cwd.length + 1) : file}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            {session.mentionedMissing.length > 0 && (
              <Card className="space-y-2 border-warning p-pad">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <FileWarning size={13} />
                  {t("session.mentioned")}
                </h3>
                <p className="text-xs text-fg-muted">{t("session.mentionedHint")}</p>
                <ul className="space-y-0.5">
                  {session.mentionedMissing.map((file) => (
                    <li key={file} className="truncate font-mono text-[11px]" title={file}>
                      {file}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {session.unverifiedClaims.length > 0 && (
              <Card className="space-y-2 border-warning p-pad">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <AlertTriangle size={13} />
                  {t("session.claims")}
                </h3>
                <p className="text-xs text-fg-muted">{t("session.claimsHint")}</p>
                <ul className="space-y-1.5">
                  {session.unverifiedClaims.slice(-5).map((claim) => (
                    <li key={claim.ts} className="rounded-md bg-bg-subtle p-2 text-xs leading-relaxed">
                      “{claim.text}”
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">{relativeTime(claim.ts)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {session.packages.length > 0 && (
              <Card className={cn("space-y-2 p-pad", riskyPackages.length > 0 && "border-danger")}>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  <Package size={13} />
                  {t("session.packages")} · {session.packages.length}
                </h3>
                <p className="text-[11px] text-fg-subtle">{t("session.packagesHint")}</p>
                {riskyPackages.length > 0 && <p className="text-xs text-danger">{t("session.pkgWarn")}</p>}
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {session.packages.map((pkg) => (
                    <li key={`${pkg.manager}:${pkg.name}`} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono">{pkg.name}</span>
                      <span className="text-[10px] text-fg-subtle">{pkg.manager}</span>
                      <Badge
                        tone={
                          pkg.status === "ok"
                            ? "success"
                            : pkg.status === "missing"
                              ? "danger"
                              : pkg.status === "new"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {t(`session.pkg_${pkg.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {session.missingFiles.length > 0 && (
              <Card className="space-y-2 border-warning p-pad">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <FileWarning size={13} />
                  {t("session.missing")}
                </h3>
                <p className="text-xs text-fg-muted">{t("session.missingHint")}</p>
                <ul className="space-y-0.5">
                  {session.missingFiles.slice(0, 15).map((file) => (
                    <li key={file} className="truncate font-mono text-[11px]" title={file}>
                      {file}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {session.filesTouched.length > 0 && (
              <Card className="p-pad">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  {t("session.files")} · {session.filesTouched.length}
                </h3>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                  {session.filesTouched.map((file) => (
                    <li key={file} className="truncate font-mono text-[11px] text-fg-muted" title={file}>
                      {session.cwd && file.startsWith(session.cwd) ? file.slice(session.cwd.length + 1) : file}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
