import type { ChatTodo } from "@igrek/core";
import { ChevronDown, ChevronRight, CornerDownLeft, ListChecks, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { field } from "./ui";

const OPEN_KEY = "igrek.chat.todosOpen";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The user's own small list for this chat, above the box: what is done and what is left. It stays
 * with the conversation (continued chats show it too). The agent's plan steps join it by themselves
 * and are ticked off as it works; the user's own items stay. "Hand to the AI" puts what is left into the box, nothing is sent by itself.
 */
export function ChatTodoList({
  chatId,
  onUse,
  plan,
}: {
  chatId: string;
  onUse: (text: string) => void;
  /** The AI's plan as it stands ("step:status,..."): when it changes, the list is read again. */
  plan?: string;
}) {
  const { t } = useTranslation();
  const [todos, setTodos] = useState<ChatTodo[]>([]);
  const [open, setOpenState] = useState(readOpen);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new plan from the AI means the list changed on the server
  useEffect(() => {
    let current = true;
    api
      .chatTodos(chatId)
      .then((list) => current && setTodos(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [chatId, plan]);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // Only a convenience.
    }
  };
  const act = (call: Promise<ChatTodo[]>) => {
    setError(undefined);
    call.then(setTodos).catch((err: Error) => setError(err.message));
  };
  const done = todos.filter((todo) => todo.done).length;
  const left = todos.filter((todo) => !todo.done);
  const add = () => {
    if (!draft.trim()) return;
    act(api.addChatTodo(chatId, draft));
    setDraft("");
  };
  return (
    <div className="mb-1.5 rounded-ui border border-border bg-bg-subtle text-[12.5px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start"
      >
        {open ? (
          <ChevronDown size={12} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        )}
        <ListChecks size={13} className="shrink-0 text-fg-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-fg-muted">
          {todos.length ? t("chatTodos.count", { done, total: todos.length }) : t("chatTodos.title")}
        </span>
        {!todos.length && !open && <Plus size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />}
      </button>
      {open && (
        <div className="space-y-1 border-t border-border p-1.5">
          {todos.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {todos.map((todo) => (
                <li key={todo.id} className="group flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-bg-hover">
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => act(api.updateChatTodo(chatId, todo.id, { done: !todo.done }))}
                    aria-label={todo.text}
                    className="size-3.5 shrink-0 cursor-pointer accent-[var(--success)]"
                  />
                  <span className={cn("min-w-0 flex-1", todo.done && "text-fg-subtle line-through")}>{todo.text}</span>
                  <button
                    type="button"
                    onClick={() => act(api.removeChatTodo(chatId, todo.id))}
                    aria-label={t("chatTodos.remove")}
                    title={t("chatTodos.remove")}
                    className="shrink-0 text-fg-subtle hover:text-danger focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder={t("chatTodos.placeholder")}
              aria-label={t("chatTodos.placeholder")}
              className={cn(field, "h-7 px-1.5 text-[12px] min-w-0 flex-1")}
            />
            {left.length > 0 && (
              <button
                type="button"
                onClick={() => onUse(`${t("chatTodos.handOver")}\n${left.map((todo) => `- ${todo.text}`).join("\n")}`)}
                data-tip={t("chatTodos.useTip")}
                className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-fg-muted hover:bg-bg-hover hover:text-fg"
              >
                <CornerDownLeft size={12} aria-hidden="true" />
                {t("chatTodos.use")}
              </button>
            )}
          </div>
          {error && <p className="px-1 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
