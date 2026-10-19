import type { TerminalInfo } from "@igrek/core";
import { ArrowLeft, History, MessageSquare, RotateCcw, SquareTerminal, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { ChatPill } from "../components/ChatPill";
import { EnhanceButton, EnhanceDialog } from "../components/Enhance";
import { NewSession } from "../components/NewSession";
import { PromptPicker } from "../components/PromptPicker";
import { TerminalView } from "../components/TerminalView";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useChats, useLiveData, useServerEvent, useTerminals } from "../lib/live";

const TONE = { running: "success", idle: "neutral", attention: "warning", exited: "neutral" } as const;

/** Nothing open yet: the latest projects, each with its "New chat / terminal" button. */
function StartHere() {
  const { data: projects } = useLiveData(() => api.projects(), []);
  const recent = (projects ?? [])
    .filter((p) => !p.hidden && p.status === "active")
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, 5);
  if (!recent.length) return null;
  return (
    <ul className="mx-auto w-full max-w-md divide-y divide-border rounded-ui border border-border bg-bg text-start">
      {recent.map((p) => (
        <li key={p.id} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
          <NewSession projectId={p.id} />
        </li>
      ))}
    </ul>
  );
}

export function TerminalStatus({ term }: { term: TerminalInfo }) {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1.5">
      <StatusDot tone={TONE[term.status]} pulse={term.status === "running" || term.status === "attention"} />
      <span className={cn("text-[11px]", term.status === "attention" ? "font-medium text-warning" : "text-fg-subtle")}>
        {t(`term.${term.status}`)}
      </span>
    </span>
  );
}

/** JetBrains-style tab strip across all open terminals. */
function Tabs({ terminals, active }: { terminals: TerminalInfo[]; active?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-bg-subtle">
      {terminals.map((term) => (
        <div
          key={term.id}
          className={cn(
            "group flex max-w-60 shrink-0 items-center gap-2 border-e border-border px-3 text-[12px]",
            term.id === active
              ? "bg-bg text-fg shadow-[inset_0_-2px_0_var(--accent)]"
              : "text-fg-muted hover:bg-bg-hover",
          )}
        >
          <Link to={`/t/${term.id}`} className="flex min-w-0 items-center gap-2">
            <StatusDot tone={TONE[term.status]} pulse={term.status === "attention"} />
            <span className="truncate">{term.title}</span>
          </Link>
          <button
            type="button"
            aria-label={t("term.close")}
            onClick={async () => {
              await api.closeTerminal(term.id);
              if (term.id === active && term.status === "exited") void navigate("/terminals");
            }}
            className="text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Chats that ended or outlived a restart, kept by the server: continue any of them from any browser. */
function RecentChats() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: recent, reload } = useLiveData(() => api.recentChats(), []);
  useServerEvent("chats", reload);
  if (!recent?.length) return null;
  return (
    <div className="px-6 pt-6">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        <History size={13} />
        {t("chat.recent")}
      </h2>
      <Card>
        <div className="divide-y divide-border">
          {recent.map((chat) => (
            <div key={chat.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover">
              <MessageSquare size={15} className="shrink-0 text-fg-subtle" />
              <Link to={`/c/${chat.id}`} data-nav-item className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{chat.title}</p>
                <p className="truncate text-[11px] text-fg-subtle">
                  {chat.projectName ? `${chat.projectName} · ` : ""}
                  {relativeTime(chat.updatedAt)}
                </p>
              </Link>
              <button
                type="button"
                aria-label={t("chat.goneResume")}
                title={t("chat.goneResume")}
                onClick={async () => {
                  const next = await api.startChat({ projectId: chat.projectId, resume: chat.sessionId });
                  void navigate(`/c/${next.id}`);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-accent hover:bg-bg-active"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">{t("chat.goneResume")}</span>
              </button>
              <button
                type="button"
                aria-label={t("chat.forget")}
                title={t("chat.forget")}
                onClick={async () => {
                  await api.forgetChat(chat.id);
                  reload();
                }}
                className="shrink-0 text-fg-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function TerminalsPage() {
  const { t } = useTranslation();
  const terminals = useTerminals();
  const chats = useChats();
  return (
    <>
      <PageHeader title={t("term.title")} />
      {chats.length > 0 && (
        <div className="px-6 pt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("chat.chats")}</h2>
          <Card>
            <div className="divide-y divide-border">
              {chats.map((chat) => (
                <Link
                  key={chat.id}
                  to={`/c/${chat.id}`}
                  data-nav-item
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                >
                  <MessageSquare size={15} className="text-accent" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{chat.title}</span>
                  <ChatPill chat={chat} />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
      <RecentChats />
      {terminals.length === 0 && chats.length === 0 ? (
        <EmptyState icon={SquareTerminal} title={t("term.empty")} body={t("term.emptyBody")} action={<StartHere />} />
      ) : (
        <div className="p-6">
          <Card>
            <div className="divide-y divide-border">
              {terminals.map((term) => (
                <Link
                  key={term.id}
                  to={`/t/${term.id}`}
                  data-nav-item
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                >
                  <SquareTerminal size={15} className="text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{term.title}</p>
                    <p className="truncate font-mono text-[11px] text-fg-subtle">{term.cwd}</p>
                  </div>
                  <Badge>{t(`term.${term.tool}`)}</Badge>
                  <TerminalStatus term={term} />
                  <span className="w-24 text-end text-[11px] text-fg-subtle">{relativeTime(term.startedAt)}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export function TerminalPage() {
  const { t } = useTranslation();
  const { termId = "" } = useParams();
  const terminals = useTerminals();
  const term = terminals.find((x) => x.id === termId);
  const [enhancing, setEnhancing] = useState(false);
  const aiTerminal = term && (term.tool === "claude" || term.tool === "codex");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs terminals={terminals} active={termId} />
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <BackLink
          to={
            !term
              ? "/terminals"
              : term.projectId.startsWith("server:")
                ? `/servers/${term.projectId.slice(7)}`
                : term.projectId.startsWith("account:")
                  ? "/limits"
                  : `/p/${term.projectId}`
          }
          className="text-fg-subtle hover:text-fg"
          aria-label={t("term.project")}
        >
          <ArrowLeft size={15} className="rtl:rotate-180" />
        </BackLink>
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{term?.title ?? "…"}</h1>
        {term && term.status !== "exited" && aiTerminal && <EnhanceButton onClick={() => setEnhancing(true)} />}
        {term && term.status !== "exited" && <PromptPicker onUse={(text) => api.terminalInput(term.id, text)} />}
        {term && <Badge>{t(`term.${term.tool}`)}</Badge>}
        {term && <TerminalStatus term={term} />}
      </header>
      <div className="min-h-0 flex-1">{termId && <TerminalView key={termId} id={termId} />}</div>
      {term && aiTerminal && (
        <EnhanceDialog
          open={enhancing}
          onClose={() => setEnhancing(false)}
          target={{ projectId: term.projectId, tool: term.tool === "codex" ? "codex" : "claude" }}
          onUse={(prompt) => void api.terminalInput(term.id, prompt, true)}
        />
      )}
    </div>
  );
}
