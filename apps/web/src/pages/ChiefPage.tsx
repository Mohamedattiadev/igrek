import type { ProjectListItem } from "@igrek/core";
import { Bot, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { LoadError } from "../components/LoadError";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { ChiefChat } from "./Chat";

const GENERAL = "general";

/**
 * "/chief": the chief's threads, the general one and one per project (a long talk about one project
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
  const [chatId, setChatId] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the list again when a new thread opened
  useEffect(() => {
    let current = true;
    void Promise.all([api.projects(), api.chiefThreads()])
      .then(([list, threads]) => {
        if (!current) return;
        setProjects(list.filter((p) => !p.hidden && p.status !== "archived"));
        setTalked(threads);
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
        className="shrink-0 border-border border-b p-2 md:w-52 md:overflow-y-auto md:border-e md:border-b-0"
      >
        <select
          value={thread}
          onChange={(e) => pick(e.target.value)}
          aria-label={t("chief.threads")}
          className="h-8 w-full rounded-ui border border-border bg-bg px-2 text-[13px] md:hidden"
        >
          <option value={GENERAL}>{t("chief.general")}</option>
          {ordered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ul className="hidden space-y-0.5 md:block">
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
