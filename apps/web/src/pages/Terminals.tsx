import type { RecentChat, TerminalInfo } from "@igrek/core";
import { ArrowLeft, History, MessageSquare, RotateCcw, SquareTerminal, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { ChatPill } from "../components/ChatPill";
import { EnhanceButton, EnhanceDialog } from "../components/Enhance";
import { PromptPicker } from "../components/PromptPicker";
import { StartBox } from "../components/StartBox";
import { TerminalView } from "../components/TerminalView";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { shownTitle } from "../lib/chat";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useChats, useLiveData, useServerEvent, useTerminals } from "../lib/live";

const TONE = { running: "success", idle: "neutral", attention: "warning", exited: "neutral" } as const;

/**
 * Start something here too, with the one box: in the project worked in last (another is one pick
 * away), as a chat, an empty chat or a terminal (Claude Code, Codex, a shell).
 */
function StartHere() {
  const { data: projects } = useLiveData(() => api.projects(), []);
  const recent = (projects ?? [])
    .filter((p) => !p.hidden && p.status === "active")
    .sort((a, b) => b.lastActivity - a.lastActivity);
  if (!projects) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-6">
      <StartBox projectId={recent[0]?.id} />
    </div>
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

/** One project's past chats; the same title more than once (a chat continued again and again) shows once. */
function folded(list: RecentChat[]): { chat: RecentChat; count: number }[] {
  const byTitle = new Map<string, { chat: RecentChat; count: number }>();
  for (const chat of list) {
    const seen = byTitle.get(chat.title);
    if (seen) seen.count++;
    else byTitle.set(chat.title, { chat, count: 1 });
  }
  return [...byTitle.values()];
}

/** Chats that ended or outlived a restart, kept by the server, by project: continue any of them. */
function RecentChats() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: recent, reload } = useLiveData(() => api.recentChats(), []);
  useServerEvent("chats", reload);
  if (!recent?.length) return <p className="text-[12.5px] text-fg-subtle">{t("term.noHistory")}</p>;
  const groups = new Map<string, RecentChat[]>();
  for (const chat of recent) {
    const name = chat.projectId === "chief" ? t("nav.chief") : (chat.projectName ?? t("term.noProject"));
    groups.set(name, [...(groups.get(name) ?? []), chat]);
  }
  return (
    <div className="space-y-3">
      {[...groups].map(([name, list]) => (
        <details key={name} open={groups.size <= 3} className="rounded-ui border border-border bg-bg">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-medium">
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="text-[11.5px] font-normal text-fg-subtle">
              {t("term.chatCount", { count: list.length })}
            </span>
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {folded(list).map(({ chat, count }) => (
              <div key={chat.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-bg-hover">
                <MessageSquare size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                <Link to={`/c/${chat.id}`} data-nav-item className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">
                    {shownTitle(chat.title, t)}
                    {count > 1 && <span className="ms-1.5 text-[11px] text-fg-subtle">×{count}</span>}
                  </p>
                  <p className="text-[11px] text-fg-subtle">{relativeTime(chat.updatedAt)}</p>
                </Link>
                <button
                  type="button"
                  aria-label={t("chat.goneResume")}
                  data-tip={t("chat.goneResume")}
                  onClick={async () => {
                    const next = await api.startChat({ projectId: chat.projectId, resume: chat.sessionId });
                    void navigate(`/c/${next.id}`);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] text-accent hover:bg-bg-active"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={t("chat.forget")}
                  data-tip={t("chat.forget")}
                  onClick={async () => {
                    await api.forgetChat(chat.id);
                    reload();
                  }}
                  className="shrink-0 text-fg-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/**
 * Everything that runs or ran: what is open now (chats and terminals, with what each is doing) on one
 * side, the past by project on the other, and a way to start something at the top (testers found the
 * old list of identical rows empty and unclear).
 */
export function TerminalsPage() {
  const { t } = useTranslation();
  const terminals = useTerminals();
  const chats = useChats();
  const nothingOpen = terminals.length === 0 && chats.length === 0;
  return (
    <>
      <PageHeader title={t("term.title")} />
      <StartHere />
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-2">
        <section aria-labelledby="open-now" className="space-y-2">
          <h2 id="open-now" className="text-[13px] font-semibold">
            {t("term.openNow")}
          </h2>
          <p className="text-[12px] text-fg-subtle">{t("term.openNowHint")}</p>
          {nothingOpen ? (
            <EmptyState icon={SquareTerminal} title={t("term.empty")} body={t("term.emptyBody")} />
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {chats.map((chat) => (
                  <Link
                    key={chat.id}
                    to={chat.projectId === "chief" ? "/chief" : `/c/${chat.id}`}
                    data-nav-item
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                  >
                    <MessageSquare size={15} className="shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{shownTitle(chat.title, t)}</span>
                    <ChatPill chat={chat} />
                  </Link>
                ))}
                {terminals.map((term) => (
                  <Link
                    key={term.id}
                    to={`/t/${term.id}`}
                    data-nav-item
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                  >
                    <SquareTerminal size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{term.title}</p>
                      <p className="truncate font-mono text-[11px] text-fg-subtle">{term.cwd}</p>
                    </div>
                    <Badge>{t(`term.${term.tool}`)}</Badge>
                    <TerminalStatus term={term} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </section>
        <section aria-labelledby="past" className="space-y-2">
          <h2 id="past" className="flex items-center gap-1.5 text-[13px] font-semibold">
            <History size={14} aria-hidden="true" />
            {t("chat.recent")}
          </h2>
          <p className="text-[12px] text-fg-subtle">{t("term.pastHint")}</p>
          <RecentChats />
        </section>
      </div>
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
