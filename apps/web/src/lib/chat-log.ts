import type { ChatEvent } from "@igrek/core";

type ToolEvent = Extract<ChatEvent, { kind: "tool" }>;

/** How much of the AI's work a chat shows (plan.md 16.1): every step, grouped, one plain line, or only the text. */
export type DetailLevel = "all" | "grouped" | "plain" | "text";
export const DETAIL_LEVELS: DetailLevel[] = ["all", "grouped", "plain", "text"];

export type LogUnit = { kind: "event"; event: ChatEvent } | { kind: "group"; id: string; tools: ToolEvent[] };

/** The to-do list stays a card of its own: it is what the AI plans, not a step it took. */
const ALONE = new Set(["TodoWrite"]);
/** A question to the user is shown as its own card; the tool call behind it adds nothing. */
const HIDDEN = new Set(["AskUserQuestion"]);

/** Runs of two or more tool calls in a row become one line; the rest stays as it is. */
export function groupWork(events: ChatEvent[], level: DetailLevel): LogUnit[] {
  if (level === "all")
    return events
      .filter((event) => !(event.kind === "tool" && HIDDEN.has(event.name)))
      .map((event) => ({ kind: "event", event }));
  const units: LogUnit[] = [];
  let run: ToolEvent[] = [];
  const flush = () => {
    if (run.length >= 2 || (level === "plain" && run.length === 1))
      units.push({ kind: "group", id: `g-${run[0]?.id}`, tools: run });
    else for (const event of run) units.push({ kind: "event", event });
    run = [];
  };
  for (const event of events) {
    if (event.kind === "tool" && HIDDEN.has(event.name)) continue;
    if (event.kind === "tool" && !ALONE.has(event.name)) {
      if (level !== "text") run.push(event);
      continue;
    }
    flush();
    if (level === "text" && (event.kind === "tool" || event.kind === "checkpoint")) continue;
    units.push({ kind: "event", event });
  }
  flush();
  return units;
}

export type WorkKind = "read" | "edit" | "run" | "search" | "web" | "other";
const WORK_KINDS: WorkKind[] = ["read", "edit", "run", "search", "web", "other"];

const KIND: Record<string, WorkKind> = {
  Read: "read",
  NotebookRead: "read",
  LS: "read",
  Edit: "edit",
  MultiEdit: "edit",
  Write: "edit",
  NotebookEdit: "edit",
  Bash: "run",
  BashOutput: "run",
  KillShell: "run",
  Grep: "search",
  Glob: "search",
  WebFetch: "web",
  WebSearch: "web",
};

/** How many steps of each kind a run of tool calls took, in a fixed order, zeros left out. */
export function workCounts(tools: ToolEvent[]): [WorkKind, number][] {
  const counts = new Map<WorkKind, number>();
  for (const tool of tools) {
    const kind = KIND[tool.name] ?? "other";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return WORK_KINDS.flatMap((kind) => (counts.get(kind) ? [[kind, counts.get(kind) ?? 0]] : []));
}
