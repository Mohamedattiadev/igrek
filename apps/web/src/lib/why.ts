import type { ChatEvent } from "@igrek/core";
import { DELEGATE_TOOLS, EXPERT_TOOL } from "./chat-log";
import { latestTodos, progress } from "./todos";

type ToolEvent = Extract<ChatEvent, { kind: "tool" }>;

/** The steps that change a file, and where each keeps the file's path. */
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

/** Igrek's answer to "why did this file change?" (its signature): what led to one edit. */
export interface Why {
  /** The user's message the edit answers. */
  request?: string;
  /** The plan step being worked on when the edit was made (TodoWrite). */
  step?: string;
  /** An expert asked or handed work in the same turn, before the edit, and what came back. */
  expert?: { id?: string; question?: string; note?: string };
}

/** The path an edit step changed, as the tool got it. */
export function editedPath(event: ChatEvent): string | undefined {
  if (event.kind !== "tool" || !EDIT_TOOLS.has(event.name)) return undefined;
  const input = (event.input ?? {}) as { file_path?: unknown; notebook_path?: unknown };
  const path = input.file_path ?? input.notebook_path;
  return typeof path === "string" && path ? path : undefined;
}

function expertOf(event: ToolEvent): Why["expert"] {
  const input = (event.input ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const delegated = DELEGATE_TOOLS.has(event.name);
  return {
    id: text(delegated ? input.subagent_type : input.expert),
    question: text(delegated ? input.description : input.question),
    note: event.status === "done" ? text(event.result)?.slice(0, 1200) : undefined,
  };
}

/**
 * Why the step `eventId` was taken, read from the conversation only: the last user message before
 * it, the plan step in progress then, and an expert consulted in the same turn. Nothing is guessed;
 * a part the conversation does not show is left out.
 */
export function whyOf(events: ChatEvent[], eventId: string): Why {
  const at = events.findIndex((e) => e.id === eventId);
  if (at < 0) return {};
  const before = events.slice(0, at);
  const why: Why = {};
  let turnStart = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const event = before[i];
    if (event?.kind === "user") {
      why.request = event.text;
      turnStart = i;
      break;
    }
  }
  const todos = latestTodos(before);
  const current = todos ? progress(todos).current : undefined;
  if (current) why.step = current.content;
  for (let i = before.length - 1; i > turnStart; i--) {
    const event = before[i];
    if (event?.kind === "tool" && (event.name === EXPERT_TOOL || DELEGATE_TOOLS.has(event.name))) {
      why.expert = expertOf(event);
      break;
    }
  }
  return why;
}
