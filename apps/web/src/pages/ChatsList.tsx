import type { ChatInfo, RecentChat, SessionDetail, TerminalInfo } from "@igrek/core";
import { FileText, FolderKanban, MessageSquare, RotateCcw, SquareTerminal, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { ChatPill } from "../components/ChatPill";
import { Badge, Card, EmptyState } from "../components/ui";
import { useSummaryText } from "../components/work";
import { api } from "../lib/api";
import { shownTitle } from "../lib/chat";
import { cn } from "../lib/cn";
import { dateTime, relativeTime } from "../lib/format";

/** One line of the list: an open chat, an open terminal, or a past chat to continue. */
export type ChatRow =
  | { key: string; kind: "open"; at: number; chat: ChatInfo }
  | { key: string; kind: "term"; at: number; term: TerminalInfo }
  | { key: string; kind: "past"; at: number; past: RecentChat; count: number };

/** The same title more than once (a chat continued again and again) shows once, newest. */
export function pastRows(list: RecentChat[]): ChatRow[] {
  const byTitle = new Map<string, ChatRow & { kind: "past" }>();
  for (const past of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const seen = byTitle.get(`${past.projectId}/${past.title}`);
    if (seen) seen.count++;
    else
      byTitle.set(`${past.projectId}/${past.title}`, {
        key: `p-${past.id}`,
        kind: "past",
        at: past.updatedAt,
        past,
        count: 1,
      });
  }
  return [...byTitle.values()];
}

const sessionCache = new Map<string, Promise<SessionDetail | undefined>>();
function sessionOf(id?: string): Promise<SessionDetail | undefined> {
  if (!id) return Promise.resolve(undefined);
  let found = sessionCache.get(id);
  if (!found) {
    found = api.session(id).catch(() => undefined);
    sessionCache.set(id, found);
  }
  return found;
}

/**
 * The card beside the list (plan.md 19.7): what the chat under the pointer was about: its project,
 * what was done, who worked, when, which files. Read from the chat's Claude session once.
 */
export function ChatPeek({ row, projectName }: { row?: ChatRow; projectName: (id: string) => string }) {
  const { t } = useTranslation();
  const sessionId = row?.kind === "open" ? row.chat.sessionId : row?.kind === "past" ? row.past.sessionId : undefined;
  const [session, setSession] = useState<SessionDetail>();
  useEffect(() => {
    let current = true;
    setSession(undefined);
    void sessionOf(sessionId).then((s) => current && setSession(s));
    return () => {
      current = false;
    };
  }, [sessionId]);
  const summary = useSummaryText(session?.summary);
  if (!row) return null;
  if (row.kind === "term")
    return (
      <Card className="space-y-2 p-pad text-[13px]">
        <p className="flex items-center gap-2 font-semibold">
          <SquareTerminal size={15} className="text-fg-subtle" aria-hidden="true" /> {row.term.title}
        </p>
        <p className="font-mono text-[12px] text-fg-muted">{row.term.cwd}</p>
        <Badge>{t(`term.${row.term.tool}`)}</Badge>
      </Card>
    );
  const title = row.kind === "open" ? row.chat.title : row.past.title;
  const projectId = row.kind === "open" ? row.chat.projectId : row.past.projectId;
  const project =
    projectId === "chief"
      ? t("nav.chief")
      : row.kind === "past"
        ? (row.past.projectName ?? projectName(projectId))
        : projectName(projectId);
  return (
    <Card className="space-y-3 p-pad text-[13px]">
      <div>
        <p className="font-semibold leading-snug">{shownTitle(title, t)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <FolderKanban size={12} aria-hidden="true" /> {project || t("term.noProject")}
          </span>
          <span className="inline-flex items-center gap-1">
            <UserRound size={12} aria-hidden="true" /> {session?.author ?? t("team.you")}
          </span>
          <span title={dateTime(row.at)}>{relativeTime(row.at)}</span>
        </p>
      </div>
      {summary?.did.length ? (
        <ul className="list-disc space-y-0.5 ps-4 text-[12.5px] text-fg-muted">
          {summary.did.slice(0, 4).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-fg-subtle">{session ? t("chats.noSummary") : t("chats.reading")}</p>
      )}
      {session && session.filesTouched.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("chats.files", { count: session.filesTouched.length })}
          </p>
          <ul className="space-y-0.5 font-mono text-[11.5px] text-fg-muted">
            {session.filesTouched.slice(0, 5).map((f) => (
              <li key={f} className="flex items-center gap-1 truncate">
                <FileText size={11} className="shrink-0" aria-hidden="true" />
                {f.split("/").slice(-2).join("/")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {session && (
        <p className="text-[11.5px] text-fg-subtle">{t("chats.messages", { count: session.userMessages })}</p>
      )}
    </Card>
  );
}

function linkOf(row: ChatRow): string {
  if (row.kind === "term") return `/t/${row.term.id}`;
  if (row.kind === "past") return `/c/${row.past.id}`;
  return row.chat.projectId === "chief" ? "/chief" : `/c/${row.chat.id}`;
}

function titleOf(row: ChatRow): string {
  return row.kind === "open" ? row.chat.title : row.kind === "term" ? row.term.title : row.past.title;
}

/** Continue a past chat, or drop it from the list. */
function PastActions({ past, onForget }: { past: RecentChat; onForget: (id: string) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        aria-label={t("chat.goneResume")}
        data-tip={t("chat.goneResume")}
        onClick={async () => {
          const next = await api.startChat({ projectId: past.projectId, resume: past.sessionId });
          void navigate(`/c/${next.id}`);
        }}
        className="flex shrink-0 items-center rounded-md px-2 py-1 text-accent hover:bg-bg-active"
      >
        <RotateCcw size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("chat.forget")}
        data-tip={t("chat.forget")}
        onClick={() => onForget(past.id)}
        className="shrink-0 text-fg-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </>
  );
}

function Row({
  row,
  active,
  onHover,
  onForget,
}: {
  row: ChatRow;
  active: boolean;
  onHover: (key: string) => void;
  onForget: (id: string) => void;
}) {
  const { t } = useTranslation();
  const where =
    row.kind === "past"
      ? `${row.past.projectId === "chief" ? t("nav.chief") : (row.past.projectName ?? t("term.noProject"))} · ${relativeTime(row.at)}`
      : row.kind === "term"
        ? row.term.cwd
        : relativeTime(row.at);
  const Icon = row.kind === "term" ? SquareTerminal : MessageSquare;
  return (
    <li
      onMouseEnter={() => onHover(row.key)}
      onFocus={() => onHover(row.key)}
      className={cn("group flex items-center gap-3 px-3 py-2", active && "bg-bg-hover")}
    >
      <Icon
        size={14}
        className={cn("shrink-0", row.kind === "open" ? "text-accent" : "text-fg-subtle")}
        aria-hidden="true"
      />
      <Link to={linkOf(row)} data-nav-item className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px]", row.kind !== "past" && "font-medium")}>
          {shownTitle(titleOf(row), t)}
          {row.kind === "past" && row.count > 1 && (
            <span className="ms-1.5 text-[11px] text-fg-subtle">x{row.count}</span>
          )}
        </p>
        <p className="truncate text-[11px] text-fg-subtle">{where}</p>
      </Link>
      {row.kind === "open" && <ChatPill chat={row.chat} />}
      {row.kind === "past" && <PastActions past={row.past} onForget={onForget} />}
    </li>
  );
}

/** The list itself: open first (with what each is doing), then the past, newest first. */
export function ChatList({
  rows,
  hovered,
  onHover,
  onForget,
}: {
  rows: ChatRow[];
  hovered?: string;
  onHover: (key: string) => void;
  onForget: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyState icon={MessageSquare} title={t("term.empty")} body={t("term.emptyBody")} />;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <Row key={row.key} row={row} active={hovered === row.key} onHover={onHover} onForget={onForget} />
        ))}
      </ul>
    </Card>
  );
}
