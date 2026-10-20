import type { ChatEvent } from "@igrek/core";

/** One step of the plan an agent keeps while it works (Claude Code's TodoWrite). */
export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  /** "Running the tests": how the step reads while it is being done. */
  activeForm?: string;
}

const STATUSES = new Set(["pending", "in_progress", "completed"]);

/** The plan as it stands now: the last list the agent wrote; none when it never wrote one. */
export function latestTodos(events: ChatEvent[]): Todo[] | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event?.kind !== "tool" || event.name !== "TodoWrite") continue;
    const list = (event.input as { todos?: unknown } | undefined)?.todos;
    if (!Array.isArray(list)) continue;
    return list
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => ({
        content: String(t.content ?? ""),
        status: (STATUSES.has(String(t.status)) ? t.status : "pending") as Todo["status"],
        ...(typeof t.activeForm === "string" ? { activeForm: t.activeForm } : {}),
      }))
      .filter((t) => t.content);
  }
  return undefined;
}

/** How far the plan is: done count, total, and the step being worked on now. */
export function progress(todos: Todo[]): { done: number; total: number; current?: Todo } {
  return {
    done: todos.filter((t) => t.status === "completed").length,
    total: todos.length,
    current: todos.find((t) => t.status === "in_progress"),
  };
}
