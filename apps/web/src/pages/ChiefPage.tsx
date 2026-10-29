import type { ProjectListItem, StartedItem } from "@igrek/core";
import { ArrowRight, Bot, Folder, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LoadError } from "../components/LoadError";
import { field } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { ChiefChat } from "./Chat";

const GENERAL = "general";

/** How many of the newest things started from the box the page lists. */
const HISTORY = 30;

/**
 * What was started from the one box (components/StartBox.tsx), newest first: a project's chat opens
 * that chat, the chief's goes to its general thread.
 */
function StartedList({ items, projects }: { items: StartedItem[]; projects: ProjectListItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return <p className="px-2 py-1 text-[12px] text-fg-subtle">{t("start.historyEmpty")}</p>;
  const name = (id?: string) =>
    id ? (projects.find((p) => p.id === id)?.name ?? t("start.goneProject")) : t("start.chief");
  return (
    <ul className="space-y-0.5">
      {items.slice(0, HISTORY).map((item) => (
        <li key={`${item.at}-${item.chatId ?? item.runs?.[0]}`}>
          <Link
            to={item.runs ? `/batch?runs=${item.runs.join(",")}` : item.projectId ? `/c/${item.chatId}` : "/chief"}
            className="block rounded-md px-2 py-1.5 hover:bg-bg-hover"
          >
            <span className="line-clamp-2 text-[12.5px]">{item.text}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {item.runs ? t("start.manyCount", { count: item.runs.length }) : name(item.projectId)} ·{" "}
              {relativeTime(item.at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * "/chief": the history of the one box, then the chief's threads, the general one and one per project (a long talk about one project
 * no longer buries the others). A thread opens when it is chosen; projects with a talk come first.
 */
export function ChiefPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const thread = params.get("thread") || GENERAL;
  // A message from the home page's line: read once, then taken off the address, so a reload does not send it again.
  const [incoming] = useState(() => ({ draft: params.get("draft") ?? undefined, send: params.get("send") === "1" }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the page opens
  useEffect(() => {
    if (params.has("draft")) void navigate("/chief", { replace: true });
  }, []);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [talked, setTalked] = useState<string[]>([]);
  const [started, setStarted] = useState<StartedItem[]>([]);
  const [chatId, setChatId] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the list again when a new thread opened
  useEffect(() => {
    let current = true;
    void Promise.all([api.projects(), api.chiefThreads(), api.started()])
      .then(([list, threads, history]) => {
        if (!current) return;
        setProjects(list.filter((p) => !p.hidden && p.status !== "archived"));
        setTalked(threads);
        setStarted(history);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [chatId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` starts it again after an error
  useEffect(() => {
    let current = true;
    setChatId(undefined);
    setError(undefined);
    api
      .chief(thread)
      .then((chat) => current && setChatId(chat.id))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [thread, attempt]);

  const ordered = [...projects].sort(
    (a, b) => Number(talked.includes(b.id)) - Number(talked.includes(a.id)) || b.lastActivity - a.lastActivity,
  );
  const pick = (id: string) => void navigate(id === GENERAL ? "/chief" : `/chief?thread=${id}`);
  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <nav
        aria-label={t("chief.threads")}
        className="shrink-0 border-border border-b p-2 md:w-64 md:overflow-y-auto md:border-e md:border-b-0"
      >
        <select
          value={thread}
          onChange={(e) => pick(e.target.value)}
          aria-label={t("chief.threads")}
          className={cn(field, "w-full md:hidden")}
        >
          <option value={GENERAL}>{t("chief.general")}</option>
          {ordered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="hidden md:block">
          <p className="px-2 pt-1 pb-1 text-[11px] font-medium text-fg-subtle uppercase">{t("start.history")}</p>
          <StartedList items={started} projects={projects} />
        </div>
        <ul className="hidden space-y-0.5 md:block">
          <li className="px-2 pt-3 pb-1 text-[11px] font-medium text-fg-subtle uppercase">{t("chief.threads")}</li>
          <li>
            <ThreadButton active={thread === GENERAL} onClick={() => pick(GENERAL)} icon="general">
              {t("chief.general")}
            </ThreadButton>
          </li>
          <li className="px-2 pt-3 pb-1 text-[11px] font-medium text-fg-subtle uppercase">{t("chief.byProject")}</li>
          {ordered.map((p) => (
            <li key={p.id}>
              <ThreadButton active={thread === p.id} onClick={() => pick(p.id)} talked={talked.includes(p.id)}>
                {p.name}
              </ThreadButton>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Someone landing here first would carry on their project's work in the chief's chat; the
            work belongs in the project, where its chats, board and memory are (a user's worry). */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-4 py-2 text-[12.5px]">
          <Info size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {thread === GENERAL
              ? t("chief.notHere")
              : t("chief.notHereProject", { name: projects.find((p) => p.id === thread)?.name ?? "" })}
          </span>
          <Link
            to={thread === GENERAL ? "/" : `/p/${thread}`}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline"
          >
            {thread === GENERAL ? t("chief.toProjects") : t("chief.toProject")}
            <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
        {chatId ? (
          <ChiefChat
            key={chatId}
            chatId={chatId}
            draft={thread === GENERAL ? incoming.draft : undefined}
            autoSend={thread === GENERAL && incoming.send}
          />
        ) : (
          <LoadError error={error} onRetry={() => setAttempt((n) => n + 1)} />
        )}
      </div>
    </div>
  );
}

function ThreadButton({
  active,
  onClick,
  icon,
  talked,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: "general";
  talked?: boolean;
  children: string;
}) {
  const Icon = icon ? Bot : Folder;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-bg-hover",
        active && "bg-bg-active font-medium",
        !talked && !icon && !active && "text-fg-muted",
      )}
    >
      <Icon size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </button>
  );
}
