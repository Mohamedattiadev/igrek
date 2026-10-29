import type { TerminalInfo } from "@igrek/core";
import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "../components/BackLink";
import { EnhanceButton, EnhanceDialog } from "../components/Enhance";
import { NewSession } from "../components/NewSession";
import { PromptPicker } from "../components/PromptPicker";
import { TerminalView } from "../components/TerminalView";
import { Badge, field, PageHeader, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useChats, useLiveData, useServerEvent, useTerminals } from "../lib/live";
import { ChatList, ChatPeek, type ChatRow, pastRows } from "./ChatsList";

const TONE = { running: "success", idle: "neutral", attention: "warning", exited: "neutral" } as const;

/** Start something in a project: a chat, a terminal (Claude Code, Codex, a shell). Always here. */
function StartHere() {
  const { t } = useTranslation();
  const { data: projects } = useLiveData(() => api.projects(), []);
  const recent = (projects ?? [])
    .filter((p) => !p.hidden && p.status === "active")
    .sort((a, b) => b.lastActivity - a.lastActivity);
  const [picked, setPicked] = useState<string>();
  const projectId = picked ?? recent[0]?.id;
  if (!projectId) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={projectId}
        onChange={(e) => setPicked(e.target.value)}
        aria-label={t("term.startIn")}
        className={cn(field, "min-w-0 max-w-56")}
      >
        {recent.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <NewSession projectId={projectId} />
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

/**
 * Every chat in one list (plan.md 19.7): open ones first, then the past, newest first; the one under
 * the pointer is described in a card on the right (project, what was done, who, files). Two columns
 * of different things and project folders made people look in the wrong place.
 */
export function TerminalsPage() {
  const { t } = useTranslation();
  const terminals = useTerminals();
  const chats = useChats();
  const { data: recent, reload } = useLiveData(() => api.recentChats(), []);
  const { data: projects } = useLiveData(() => api.projects(), []);
  useServerEvent("chats", reload);
  const openSessions = new Set(chats.map((c) => c.sessionId).filter(Boolean));
  const rows: ChatRow[] = [
    ...chats.map((chat) => ({ key: `o-${chat.id}`, kind: "open" as const, at: chat.startedAt, chat })),
    ...terminals.map((term) => ({ key: `t-${term.id}`, kind: "term" as const, at: term.lastOutputAt, term })),
    ...pastRows((recent ?? []).filter((r) => !openSessions.has(r.sessionId))),
  ];
  const [hovered, setHovered] = useState<string>();
  const shown = rows.find((r) => r.key === hovered) ?? rows[0];
  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? "";
  return (
    <>
      <PageHeader title={t("term.title")} actions={<StartHere />} />
      <div className="mx-auto grid w-full max-w-6xl items-start gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_320px]">
        <ChatList
          rows={rows}
          hovered={shown?.key}
          onHover={setHovered}
          onForget={(id) => void api.forgetChat(id).then(reload)}
        />
        <aside className="sticky top-4 hidden lg:block">
          <ChatPeek row={shown} projectName={projectName} />
        </aside>
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
