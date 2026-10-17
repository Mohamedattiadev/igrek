/**
 * Team workflows and auto mode (plan.md Faz 8). Flows are YAML in Archon's format (nodes with
 * prompt / bash / wait, depends_on, model), with a few God Eye fields: persona, own worktree,
 * the project's checks as a gate, and going back to earlier nodes when a gate fails.
 */

export interface FlowNode {
  id: string;
  title?: string;
  /** Who does it (persona id): their prompt, tools and turn limit. */
  persona?: string;
  prompt?: string;
  bash?: string;
  /** Pauses until you approve or reject. */
  wait?: { attention: string };
  /** Runs the project's own checks (types, lint, tests): "done" only when they pass. */
  checks?: boolean;
  depends_on?: string[];
  model?: string;
  /** Work in a copy of its own (for nodes that run side by side), merged back when done. */
  worktree?: "own" | "run";
  /** A review that ends with VERDICT: PASS or VERDICT: FAIL. */
  review?: boolean;
  /** When this node fails, run these earlier nodes again (with what went wrong), at most `max` times. */
  on_fail?: { back_to: string[]; max: number };
}

export interface FlowDef {
  name: string;
  description?: string;
  nodes: FlowNode[];
  /** Where it came from: built in, the project's .godeye/flows or .archon/workflows. */
  source?: "builtin" | "project" | "archon";
}

export type FlowNodeStatus = "waiting" | "running" | "done" | "failed" | "skipped" | "needs_you";

export interface FlowNodeState {
  id: string;
  title?: string;
  persona?: string;
  status: FlowNodeStatus;
  attempts: number;
  startedAt?: number;
  endedAt?: number;
  /** What it is doing right now ("Edit src/auth.ts"). */
  activity?: string;
  /** Its result, short. */
  output?: string;
  verdict?: "pass" | "fail";
  error?: string;
  /** Last lines of its log. */
  log: string[];
  dependsOn: string[];
}

export interface FlowRun {
  id: string;
  projectId: string;
  flow: string;
  /** What the user asked for: "Add user login". */
  request: string;
  engine: "godeye" | "archon";
  status: "running" | "needs_you" | "ready" | "done" | "failed" | "stopped" | "merged" | "discarded" | "waiting_limit";
  nodes: FlowNodeState[];
  /** Waiting for the AI plan's limit to reset (plan.md 13.1 "Limit kuyruğu"): it goes on by itself at this time. */
  resumeAt?: number;
  /** The run's own copy of the repo and branch. Nothing reaches your branch until you approve. */
  worktree?: { path: string; branch: string; base: string; baseBranch?: string };
  /** Changed files at the end, for the approval screen. */
  changes?: { path: string; added: number; removed: number }[];
  taskId?: string;
  /** Set by a schedule (plan.md Faz 9): stop after this long; fewer steps per AI step. */
  limits?: { maxMinutes?: number; maxTurns?: number };
  scheduleId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type TaskStatus = "todo" | "doing" | "review" | "done";

/** A card on the board (plan.md Faz 8). Moving it to "doing" starts the team on it. */
export interface BoardTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  runId?: string;
  /** Where it came from: an idea, a test user's report, a meeting. */
  origin?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** When a "limit reached" message says the limit resets (epoch after "|", or in an hour). */
export function limitResetAt(message: string, now = Date.now()): number {
  const epoch = message.match(/\|(\d{10})\b/);
  if (epoch?.[1]) {
    const at = Number(epoch[1]) * 1000;
    if (at > now && at < now + 8 * 86_400_000) return at;
  }
  return now + 60 * 60_000;
}
