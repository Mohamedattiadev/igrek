/**
 * Team workflows and auto mode (plan.md Faz 8). Flows are YAML in Archon's format (nodes with
 * prompt / bash / wait, depends_on, model), with a few Igrek fields: persona, own worktree,
 * the project's checks as a gate, and going back to earlier nodes when a gate fails.
 */

import type { Category } from "./insight";

/**
 * "Raise to 100" (plan.md 5): the part's score before the run, then after each round, measured
 * again on the run's copy. A round that leaves findings open sends the work back, up to three times.
 */
export interface RaiseState {
  category: Category;
  before: number;
  rounds: { score: number; open: number; at: number }[];
}

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
  /** Where it came from: built in, the project's .igrek/flows or .archon/workflows, or a package. */
  source?: "builtin" | "project" | "archon" | "market";
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
  engine: "igrek" | "archon";
  status: "running" | "needs_you" | "ready" | "done" | "failed" | "stopped" | "merged" | "discarded" | "waiting_limit";
  nodes: FlowNodeState[];
  /** One model for every step instead of each persona's own (the model arena, plan.md 13.1): "sonnet", "opus", "codex"… */
  model?: string;
  /** The persona for steps that name none (a fix started from a finding goes to the part's owner). */
  persona?: string;
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
  raise?: RaiseState;
  /** Started by the chief (chief.ts): its result is reported back in the chief's chat. */
  by?: "chief";
  /** Done by a team bot (bots.ts), which reports in the chat it was asked in. */
  bot?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A bot on the team (plan.md 19.2, after OpenBot and Open Duet): a named coworker with a role, built
 * on an expert persona, that takes long jobs from the chat (@john) or the board, does them in its
 * own copy of the repository and reports back. It runs with the user's own Claude and Igrek's
 * approval rules; its work reaches the branch only when the user merges it.
 */
export interface Bot {
  id: string;
  name: string;
  /** "john": called with @john in a channel. */
  handle: string;
  /** The expert persona it works as (its model, tools and way of working). */
  persona: string;
  /** What it is for, in the user's words: "Payments and the checkout". */
  role: string;
  /**
   * "plan": it only writes how it would do the job; "ask": it plans and waits for the user's OK
   * before changing code; "edits": it does the job and the checks, then waits for the merge.
   */
  approval: "plan" | "ask" | "edits";
  /** A team flow instead (a lead and specialists, e.g. "feature"); the approval mode then is the flow's. */
  flow?: string;
  /** What it keeps from earlier jobs; the user can read and change it. */
  memory: string;
  /** Only in this project; every shared project when missing. */
  projectId?: string;
  createdAt: number;
}

/** Something a project lacks (suggestions.ts, plan.md 19.8), offered as a line in its chats. */
export interface ProjectGap {
  kind: "tests" | "readme" | "cards" | "errors";
  /** Cards waiting for review, open errors, or commits since the README last changed. */
  count?: number;
  /** The README is not there at all. */
  missing?: boolean;
}

/** What a note on a part of the screen is about (ui-notes.ts, plan.md 19.5). */
export interface UiElement {
  /** The page it was on: a preview address, or "igrek:/route" for Igrek's own screens. */
  url: string;
  selector: string;
  tag: string;
  text?: string;
  /** "src/components/Cart.tsx:12:7" when the dev server tells. */
  source?: string;
}

export interface UiNote {
  id: string;
  element: UiElement;
  text: string;
  author?: string;
  mine: boolean;
  at: number;
}

/** A runnable part of a project (launcher.ts, plan.md 19.4): an app's dev script, a Compose service… */
export interface LaunchPart {
  /** "script:apps/web:dev", "compose:db", "procfile:worker", "make:dev". */
  id: string;
  name: string;
  kind: "script" | "compose" | "procfile" | "make";
  command: string;
  /** Relative to the project. */
  cwd: string;
  status: "stopped" | "starting" | "running" | "failed";
  url?: string;
  port?: number;
}

/** A bot's job, for its activity list and the chat card. */
export interface BotJob {
  runId: string;
  botId: string;
  projectId: string;
  request: string;
  status: FlowRun["status"];
  channel?: string;
  changes?: FlowRun["changes"];
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
  /** Who the card is for: a teammate or a persona (plan.md 4.4). */
  assignee?: { kind: "person" | "persona"; id: string; name: string };
  /** The teammate who said "I'm taking this", so nobody does it twice. */
  claimedBy?: { id: string; name: string };
  /** Set on cards that came from a teammate. */
  author?: string;
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

/** The same task given to two models side by side (plan.md 13.1 "Model arenası"). */
export interface ArenaMatch {
  id: string;
  projectId: string;
  request: string;
  /** Rough kind of work, for the statistics: ui, backend, tests, bug, docs, refactor, other. */
  category: string;
  sides: { model: string; runId: string }[];
  winner?: string;
  createdAt: number;
}

export interface ArenaStat {
  category: string;
  model: string;
  wins: number;
  played: number;
}

/** A rough category from the words of a request. */
export function arenaCategory(request: string): string {
  const r = request.toLowerCase();
  if (/\b(test|tests|coverage|spec)\b|test yaz/.test(r)) return "tests";
  if (/\b(bug|fix|crash|error|broken)\b|hata|düzelt|çöküyor/.test(r)) return "bug";
  if (/\b(ui|button|page|screen|css|style|layout|component)\b|sayfa|buton|ekran|tasarım/.test(r)) return "ui";
  if (/\b(api|endpoint|database|db|query|migration|server|auth)\b|veritabanı|sunucu/.test(r)) return "backend";
  if (/\b(readme|docs?|documentation|comment)\b|doküman|açıklama/.test(r)) return "docs";
  if (/\b(refactor|clean|rename|split|simplify)\b|sadeleştir|yeniden düzenle/.test(r)) return "refactor";
  return "other";
}

/** A channel of the team chat: one shared project's, "general" or one people made. */
export interface ChatChannel {
  id: string;
  projectId: string;
  project: string;
  name: string;
  topic: string;
  last: number;
  unread: number;
  /** Who wrote the unread ones, for "2 from Kerim" beside the count. */
  unreadFrom: string[];
  messages: number;
  /** No sound or desktop notice for it (set on this computer only). */
  muted: boolean;
}

/** One line of the team's shared timeline: who worked on what, across the shared projects. */
export interface TeamTimelineItem {
  id: string;
  kind: "session" | "commit" | "task" | "message";
  projectId: string;
  project: string;
  /** Who did it; empty when it was me on this computer. */
  who: string;
  mine: boolean;
  title: string;
  at: number;
  status?: TaskStatus;
  channelId?: string;
}

/** A message in a channel or a thread; bot is Igrek answering someone's @ai. */
export interface ChatMessage {
  id: string;
  channelId: string;
  parentId?: string;
  author?: string;
  authorId?: string;
  mine: boolean;
  bot: boolean;
  text: string;
  at: number;
  replies: number;
  lastReplyAt?: number;
  /** The board card this message became. */
  task?: { id: string; title: string; status: TaskStatus; assignee?: string };
  /** Reactions under it, like WhatsApp's: how many, by whom, and whether one is mine. */
  reactions: { reaction: ChatReaction; count: number; mine: boolean; names: string[] }[];
  /** The message this one answers, shown above it in a small box; "missing" until it is here. */
  quote?: { id: string; author?: string; mine: boolean; text: string; missing?: boolean };
  editedAt?: number;
  /** "This message was deleted": the text is gone, the place in the talk stays. */
  deleted?: boolean;
  pinned?: boolean;
  starred?: boolean;
  forwarded?: boolean;
  /** Teammates who have read the channel past this message (only for my own messages). */
  seenBy?: string[];
  /** Not read when the channel was opened: the "Unread messages" line goes above the first one. */
  unread?: boolean;
  /** The link's card, fetched by the writer's Igrek when they sent it (readers fetch nothing). */
  preview?: LinkPreview;
  /** A file, picture or voice message sent with it (chat-files.ts); "here" once its parts arrived. */
  attachment?: ChatAttachment & { here: boolean };
}

export interface ChatAttachment {
  /** SHA-256 of the file: its name on disk and its check after the trip through the hub. */
  hash: string;
  name: string;
  size: number;
  type: string;
}

/** An attachment's description that came with a message: only its known parts, of the right kinds. */
export function cleanAttachment(value: unknown): ChatAttachment | undefined {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.hash !== "string" || !/^[0-9a-f]{64}$/.test(v.hash)) return undefined;
  return {
    hash: v.hash,
    name: String(v.name ?? "file").slice(0, 120),
    size: Math.max(0, Number(v.size) || 0),
    type: String(v.type ?? "application/octet-stream").slice(0, 80),
  };
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  site?: string;
  /** A small picture as a data URL, so it needs no fetch to show. */
  image?: string;
}

/** A preview that came with a message (from this page or a teammate): only its known parts, cut to size. */
export function cleanPreview(value: unknown): LinkPreview | undefined {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.url !== "string" || typeof v.title !== "string" || !/^https?:\/\//.test(v.url)) return undefined;
  const image = typeof v.image === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v.image) ? v.image : "";
  return {
    url: v.url.slice(0, 2000),
    title: v.title.slice(0, 200),
    ...(typeof v.description === "string" && v.description ? { description: v.description.slice(0, 300) } : {}),
    ...(typeof v.site === "string" && v.site ? { site: v.site.slice(0, 80) } : {}),
    ...(image && image.length < 80 * 1024 * 1.4 ? { image } : {}),
  };
}

/** The reactions a message can get; the page draws each with an icon (no emoji in Igrek). */
export const CHAT_REACTIONS = ["like", "love", "done", "laugh", "seen", "celebrate"] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];
