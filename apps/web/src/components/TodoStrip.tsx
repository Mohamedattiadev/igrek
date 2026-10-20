import { Check, ChevronDown, Columns3, List } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { progress, type Todo } from "../lib/todos";

const VIEW_KEY = "igrek.todoView";
type View = "list" | "board";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
}

function Mark({ status }: { status: Todo["status"] }) {
  if (status === "completed")
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-success text-bg">
        <Check size={9} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  return (
    <span
      className={cn(
        "size-3.5 shrink-0 rounded-full border",
        status === "in_progress" ? "border-accent border-[1.5px]" : "border-border-strong",
      )}
    />
  );
}

/** The steps in three columns: to do, doing, done. */
function Board({ todos }: { todos: Todo[] }) {
  const { t } = useTranslation();
  const columns: Todo["status"][] = ["pending", "in_progress", "completed"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {columns.map((status) => {
        const items = todos.filter((todo) => todo.status === status);
        return (
          <div key={status} className="min-w-0 rounded-lg bg-bg-muted/60 p-1.5">
            <p className="px-1 pb-1 text-[10.5px] font-medium text-fg-subtle">
              {t(`chat.todo_${status}`)} · {items.length}
            </p>
            <ul className="space-y-1">
              {items.map((todo) => (
                <li
                  key={todo.content}
                  className="rounded-md bg-bg px-2 py-1 text-[11.5px] leading-snug shadow-[0_1px_0_var(--border)]"
                >
                  {status === "in_progress" ? (todo.activeForm ?? todo.content) : todo.content}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The agent's plan, pinned small above the box while it works: how far it is and what it is doing,
 * with the full list (or a three-column board) one click away. It replaces the plan cards that used
 * to repeat in the conversation each time a step changed.
 */
export function TodoStrip({ todos, working }: { todos: Todo[]; working: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(readView);
  const { done, total, current } = progress(todos);
  const pick = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private window: the choice lasts until the page closes.
    }
  };
  if (!total) return null;
  const finished = done === total;
  return (
    <div className="mb-1.5 rounded-2xl border border-border bg-bg-subtle px-3 py-1.5 text-[12px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 text-start"
      >
        <span className="flex shrink-0 gap-0.5" aria-hidden="true">
          {todos.map((todo, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one segment per step, in order
              key={i}
              className={cn(
                "h-1.5 w-2.5 rounded-full",
                todo.status === "completed"
                  ? "bg-success"
                  : todo.status === "in_progress"
                    ? "bg-accent"
                    : "bg-border-strong",
                todo.status === "in_progress" && working && "animate-pulse",
              )}
            />
          ))}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {done}/{total}
        </span>
        <span className="min-w-0 flex-1 truncate text-fg-muted">
          {finished ? t("chat.todoDone") : (current?.activeForm ?? current?.content ?? t("chat.todoPlan"))}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <div className="flex justify-end gap-0.5">
            {(["list", "board"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => pick(value)}
                aria-pressed={view === value}
                aria-label={t(`chat.todoView_${value}`)}
                data-tip={t(`chat.todoView_${value}`)}
                className={cn(
                  "rounded-md p-1",
                  view === value ? "bg-bg-active text-fg" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
                )}
              >
                {value === "list" ? <List size={13} /> : <Columns3 size={13} />}
              </button>
            ))}
          </div>
          {view === "board" ? (
            <Board todos={todos} />
          ) : (
            <ul className="space-y-1">
              {todos.map((todo, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: steps keep their order and can repeat a text
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    <Mark status={todo.status} />
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 leading-snug",
                      todo.status === "completed" && "text-fg-subtle line-through",
                      todo.status === "in_progress" && "font-medium",
                    )}
                  >
                    {todo.status === "in_progress" ? (todo.activeForm ?? todo.content) : todo.content}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
