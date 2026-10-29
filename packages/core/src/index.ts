export * from "./ai-rules";
export * from "./coordinator";
export * from "./data";
export * from "./docs";
export * from "./e2e";
export * from "./flows";
export * from "./forms";
export * from "./help";
export * from "./history";
export * from "./insight";
export * from "./knowledge";
export * from "./lessons";
export * from "./library";
export * from "./meeting-notes";
export * from "./meetings";
export * from "./ops";
export * from "./org";
export * from "./persona";
export * from "./persona-knowledge";
export * from "./personas";
export * from "./playbooks";
export * from "./preview";
export * from "./private";
export * from "./prompt";
export * from "./schedules";
export * from "./scrub";
export * from "./seat-advice";
export * from "./testusers";
export * from "./writing";

export const APP_NAME = "Igrek";
export const APP_VERSION = "0.1.14";
export const DEFAULT_PORT = 7777;

export type Theme = "system" | "light" | "dark" | "darcula" | "notion";
export type TextSize = "normal" | "large" | "larger";
export type Density = "comfortable" | "compact";
export type UiMode = "simple" | "pro";
export type Keymap = "default" | "vim";

export interface Settings {
  language: string;
  theme: Theme;
  density: Density;
  /** Bigger text everywhere (plan.md 7.0). */
  textSize: TextSize;
  mode: UiMode;
  /** "Do you write code?" was asked once (first run, or the first start after the question came in). */
  askedCoding: boolean;
  keymap: Keymap;
  onboarded: boolean;
  /** Summarize finished sessions automatically with a small, cheap model. */
  autoSummarize: boolean;
  /** Tell the team how full this computer's AI accounts are and how much was used this week (the Company page); never chats or emails. */
  shareUsage: boolean;
  /** Chats may answer with OpenUI blocks drawn with Igrek's components (plan.md 16.2); costs about a thousand tokens per chat. */
  richAnswers: boolean;
  /** Chats may consult the expert personas in the background (each consultation is one model call). */
  consultExperts: boolean;
  /** Every request the AI tools Igrek starts make goes through the privacy gateway, which hides private details and .env secrets. */
  privacyGateway: boolean;
  /** When a chat turn changes auth, payment or database code, the matching expert reads the diff (one model call each). */
  autoReview: boolean;
  /** Every folder Claude works in becomes a project on its own; off, only the folders the user adds. */
  autoProjects: boolean;
  /**
   * Gate point (plan.md 15.5): when a chat turn changed files, run the project's typecheck, lint
   * and tests. "check" shows what newly broke; "sendBack" also hands it to the AI to fix.
   */
  turnGate: "off" | "check" | "sendBack";
  /** How summaries are written: for anyone, or with technical detail. */
  summaryTone: "plain" | "technical";
  /** Extra folders (besides projects) Igrek may open in the file manager. */
  allowedFolders: string[];
  /**
   * Files the AI never reads in Igrek's chats, as .env files: the user's own patterns, such as
   * "finans/*.xlsx" or "bordro*.pdf" (chats.ts privateFileRules).
   */
  privateFiles: string[];
  /** Vim keys inside the code editor (independent of list navigation). Kept for older settings; see editorKeymap. */
  editorVim: boolean;
  /** Key bindings in the code editor. */
  editorKeymap: "vscode" | "jetbrains" | "vim" | "emacs";
  /** Prompt enhancer: never, offer it on weak prompts, or open it on every weak prompt. */
  enhanceMode: "off" | "suggest" | "auto";
  /** Language of the enhanced prompt: English (AI tools follow it best) or the user's own. */
  enhanceLanguage: "en" | "user";
  /** The user's own shorthands, expanded before enhancing: { "dyy": "doğrusunu yap" }. */
  enhanceShortcuts: Record<string, string>;
  /** How often personas read the news of their field (plan.md 7.1b). */
  knowledgeScan: "off" | "daily" | "weekly";
  /** Desktop notifications from the browser (plan.md 11): finished, waiting, approvals, scores, limits. */
  notifications: boolean;
  /**
   * A free local model through Ollama (plan.md 13.1) for small jobs (summaries, sorting, translation):
   * "off", only when Claude's limit is full ("limit"), or always for small jobs ("always").
   */
  localModel: "off" | "limit" | "always";
  /** The Ollama model name, e.g. "qwen2.5:7b". */
  localModelName: string;
  /** Where Ollama listens. */
  localModelUrl: string;
  /**
   * Days Igrek keeps its own copy of session transcripts (plan.md 13.6); 0 keeps them forever.
   * Summaries, numbers and your AI tools' own files are never removed.
   */
  transcriptDays: number;
}

/** The morning briefing (plan.md 11): yesterday, today, where things are stuck. */
export interface Briefing {
  day: string;
  yesterday: string[];
  today: string[];
  stuck: string[];
  /** One sentence: what to start with. */
  focus: string;
  at: number;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  theme: "system",
  density: "comfortable",
  textSize: "normal",
  mode: "simple",
  askedCoding: false,
  keymap: "default",
  onboarded: false,
  autoSummarize: true,
  shareUsage: true,
  // What AI can do by itself is on unless turned off (plan.md 19.8: "auto olabilecek ne varsa").
  richAnswers: true,
  consultExperts: true,
  privacyGateway: true,
  autoReview: true,
  // Not this one: every folder Claude touched (home, Downloads) became a project, the clutter the
  // Projects page was cleaned of. Found folders stay one click away instead.
  autoProjects: false,
  turnGate: "off",
  summaryTone: "plain",
  allowedFolders: [],
  privateFiles: [],
  editorVim: false,
  editorKeymap: "vscode",
  enhanceMode: "suggest",
  enhanceLanguage: "en",
  enhanceShortcuts: {},
  knowledgeScan: "weekly",
  notifications: false,
  localModel: "off",
  localModelName: "",
  localModelUrl: "http://localhost:11434",
  transcriptDays: 0,
};

/** Languages written right-to-left; the UI flips its layout for these. */
export const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi"]);

export interface ToolCheck {
  id: "git" | "claude" | "codex" | "gemini" | "pi" | "opencode" | "ssh" | "docker" | "bwrap" | "socat";
  found: boolean;
  /** Found, but it fails to start (its version command ended with an error, printed in `version`). */
  broken?: boolean;
  version?: string;
  required: boolean;
}

export interface SystemStatus {
  version: string;
  dataDir: string;
  uptimeSeconds: number;
  tools: ToolCheck[];
  /** Where the system gives apps no global shortcuts (Wayland): the line that binds Ctrl+Space itself. */
  quickAskBind?: string;
}

export type AiTool = "claude" | "codex" | "gemini" | "pi" | "opencode";

/**
 * What each AI tool can do in Igrek (plan.md 16.3). Screens and routes ask these flags
 * instead of comparing tool names, so a new adapter only fills in its row.
 */
export interface ToolCapabilities {
  label: string;
  /** Its sessions can be reopened in a terminal by id. */
  resume: boolean;
  /** A resumed session can be forked into a new one. */
  fork: boolean;
  /** Its sessions can be continued in an Igrek chat (stream-json driven). */
  chat: boolean;
  /** A side question can run on a fork of the session with its full context. */
  sideQuestion: boolean;
}

export const TOOL_CAPABILITIES: Record<AiTool, ToolCapabilities> = {
  claude: { label: "Claude", resume: true, fork: true, chat: true, sideQuestion: true },
  codex: { label: "Codex", resume: true, fork: false, chat: false, sideQuestion: false },
  gemini: { label: "Gemini", resume: false, fork: false, chat: false, sideQuestion: false },
  pi: { label: "pi", resume: true, fork: true, chat: false, sideQuestion: false },
  opencode: { label: "opencode", resume: true, fork: true, chat: false, sideQuestion: false },
};

/** Capabilities of a tool name read from storage; unknown tools can do nothing extra. */
export function capabilitiesOf(tool: string): ToolCapabilities {
  return (
    TOOL_CAPABILITIES[tool as AiTool] ?? { label: tool, resume: false, fork: false, chat: false, sideQuestion: false }
  );
}

export interface GitInfo {
  branch?: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  changed: number;
  remote?: string;
  lastCommit?: { hash: string; subject: string; author: string; at: number };
}

export type HealthLevel = "good" | "warn" | "bad";
export type HealthFlag = "context-high" | "context-mid" | "long" | "errors" | "compacted";

export interface SessionHealth {
  score: number;
  level: HealthLevel;
  /** Share of the model's context window currently in use (0–1). */
  contextFill: number;
  contextWindow: number;
  flags: HealthFlag[];
  /** True when starting fresh with a handoff summary is the better move. */
  suggestFresh: boolean;
  /** True when compressing the conversation (/compact) would help before it gets worse. */
  suggestCompact: boolean;
}

export interface SummaryText {
  did: string[];
  why: string;
  left: string[];
  risks: string[];
}

export interface SessionSummaryData {
  title: string;
  /** Keyed by language code: the user's language and always "en". */
  texts: Record<string, SummaryText>;
  generatedAt: number;
}

export interface SessionListItem {
  id: string;
  projectId: string | null;
  tool: AiTool;
  title: string;
  startedAt: number;
  updatedAt: number;
  userMessages: number;
  toolCalls: number;
  gitBranch?: string;
  active: boolean;
  health: SessionHealth;
  /** Teammate who ran it; empty for your own. */
  author?: string;
  /** Kept to yourself even when the project is shared. */
  private?: boolean;
  authorId?: string;
  /** Persona the session ran as (plan.md 6.3), by id. */
  persona?: string;
  summary?: SessionSummaryData;
  models: Record<string, number>;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface TranscriptMessage {
  id: string;
  ts: number;
  role: "user" | "assistant";
  kind: "prompt" | "text" | "tool" | "error";
  toolName?: string;
  text: string;
}

export type PackageStatus = "ok" | "new" | "missing" | "unknown";

export interface PackageCheck {
  manager: "npm" | "pip";
  name: string;
  status: PackageStatus;
  /** e.g. "published 3 days ago", "120 weekly downloads". */
  detail?: string;
}

export interface SessionDetail extends SessionListItem {
  cwd?: string;
  firstPrompt?: string;
  filesTouched: string[];
  /** Files the session edited that no longer exist on disk. */
  missingFiles: string[];
  /** File paths the AI mentioned in its replies that don't exist in the project. */
  mentionedMissing: string[];
  /** What the AI most likely has in view right now (plan.md 1.8). */
  inView: { recentFiles: string[]; memoryInjected: boolean };
  toolErrors: number;
  compactions: number;
  /** "Tests pass" style claims made right after a failed step. */
  unverifiedClaims: { ts: number; text: string }[];
  packages: PackageCheck[];
  messages: TranscriptMessage[];
}

export type MemorySection = "status" | "decision" | "convention" | "failed" | "issue";

export interface MemoryItem {
  id: string;
  section: MemorySection;
  text: string;
  sourceSession?: string;
  createdAt: number;
  /** Teammate who wrote it; empty for your own. */
  author?: string;
  authorId?: string;
  /** Set when this item contradicts an older one; the user decides which stays. */
  /** withAuthor: the teammate who wrote the other item (none when it is yours). */
  conflict?: { withId: string; withText: string; withAuthor?: string; reason: string };
}

export interface CommitItem {
  hash: string;
  author: string;
  subject: string;
  at: number;
  files: number;
}

export type TimelineEntry =
  | { kind: "session"; at: number; session: SessionListItem }
  | { kind: "commit"; at: number; commit: CommitItem };

export interface Digest {
  period: "day" | "week";
  day: string;
  title: string;
  texts: Record<string, { summary: string; highlights: string[]; next: string[] }>;
  sessions: number;
  commits: number;
  createdAt: number;
}

export interface AskAnswer {
  answer: string;
  sources: SearchHit[];
}

export interface ProjectListItem {
  id: string;
  name: string;
  path: string;
  workspace: "local" | "team";
  /** How much of this project goes to the team hub. */
  share: ShareLevel;
  /** A teammate shares the same repo: their work shows here even while yours isn't shared. */
  teamLinked: boolean;
  /** Recommended flow (branches → main → deploy): warn before committing straight to main. */
  gitFlow: boolean;
  /** Teammates who worked here in the last two weeks (hub user ids). */
  teamAuthors: string[];
  sessionCount: number;
  activeSessions: number;
  lastActivity: number;
  hidden: boolean;
  /** The user added it (or a folder holding it); otherwise Igrek found it on its own. */
  addedByHand: boolean;
  /** Active, on hold or archived (plan.md 13.2). Archived projects use no background resources. */
  status: "active" | "paused" | "archived";
  hooksInstalled: boolean;
  /** Account pinned for this project; empty means "follow the active one". */
  accountId?: string;
  tools: AiTool[];
  git?: GitInfo;
  /** Worst health among sessions active in the last day. */
  health?: SessionHealth;
  lastSummary?: SessionSummaryData;
}

export interface ProjectDetail extends ProjectListItem {
  memory: MemoryItem[];
  recentSessions: SessionListItem[];
}

export interface SearchHit {
  sessionId: string;
  projectId: string | null;
  projectName?: string;
  sessionTitle: string;
  messageId: string;
  snippet: string;
  ts: number;
}

export interface IndexStatus {
  running: boolean;
  filesTotal: number;
  filesDone: number;
  sessions: number;
  projects: number;
  summarizing?: string;
  lastError?: string;
}

export type TerminalTool = "claude" | "codex" | "gemini" | "pi" | "opencode" | "shell" | "ssh";
export type TerminalStatus = "running" | "idle" | "attention" | "exited";

export interface TerminalInfo {
  id: string;
  projectId: string;
  cwd: string;
  tool: TerminalTool;
  title: string;
  startedAt: number;
  lastOutputAt: number;
  status: TerminalStatus;
  exitCode?: number;
  exitedAt?: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtime: number;
}

export interface FileContent {
  path: string;
  size: number;
  mtime: number;
  kind: "text" | "binary";
  content?: string;
}

export interface TrashItem {
  id: string;
  path: string;
  deletedAt: number;
}

export interface GitChange {
  path: string;
  /** Two-letter porcelain code, e.g. " M", "??", "A ". */
  code: string;
  staged: boolean;
}

export type IdeaStatus = "new" | "accepted" | "later" | "dropped";

export interface IdeaTriage {
  /** Best-matching project, by id, or null when it's a new project idea. */
  projectId: string | null;
  kind: "feature" | "fix" | "improvement" | "new-project" | "research" | "other";
  effort: "small" | "medium" | "large";
  value: "low" | "medium" | "high";
  /** One plain sentence on why, in the user's language. */
  note: string;
}

export interface Idea {
  id: string;
  text: string;
  projectId: string | null;
  status: IdeaStatus;
  triage?: IdeaTriage;
  createdAt: number;
}

export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
  tags: string[];
  uses: number;
  createdAt: number;
}

export interface QuickAnswer {
  answer: string;
  /** What the answer was based on, shown as a chip. */
  context: { project?: string; session?: string; mode: "quick" | "full" };
}

export type CommandRisk = "read" | "change" | "danger";
export type ServerTag = "prod" | "staging" | "test" | "other";

export interface ServerInfo {
  id: string;
  name: string;
  /** user@host or an ~/.ssh/config alias. */
  target: string;
  port?: number;
  tag: ServerTag;
  createdAt: number;
  health?: ServerHealth;
}

export interface ServerHealth {
  ok: boolean;
  checkedAt: number;
  error?: string;
  uptime?: string;
  load?: string;
  diskPercent?: number;
  memPercent?: number;
  containers?: { name: string; status: string }[];
  failedUnits?: string[];
}

export interface RemoteRun {
  id: string;
  serverId: string;
  command: string;
  risk: CommandRisk;
  actor: "user" | "agent";
  reason?: string;
  startedAt: number;
  exitCode?: number;
  output?: string;
  durationMs?: number;
}

export interface Approval {
  id: string;
  kind: "server-command";
  serverId: string;
  serverName: string;
  serverTag: ServerTag;
  command: string;
  risk: CommandRisk;
  reason?: string;
  requestedAt: number;
}

/** "full": Claude Code asks nothing (the default for a new chat, plan.md 19.8); "auto": it decides what is safe. */
export type ChatMode = "full" | "normal" | "acceptEdits" | "auto" | "plan";
export type ChatStatus = "idle" | "working" | "waiting" | "exited";

/** Limit usage as Claude reports it (0–1), with reset times. */
/** One teammate's AI accounts and week, as their Igrek reports it to the team (sync/seats.ts). */
export interface Seat {
  memberId: string;
  name: string;
  role?: string;
  online?: boolean;
  lastSeen?: number;
  /** When their Igrek last reported; old reports are shown as such. */
  at: number;
  version?: string;
  os?: string;
  accounts: {
    provider: string;
    label: string;
    plan?: string;
    loggedIn: boolean;
    active: boolean;
    fiveHour?: number;
    week?: number;
  }[];
  week: { sessions: number; input: number; output: number; models: Record<string, number> };
}

/** A person's budget on the Company page (budgets.ts): a share of their weekly limit, or tokens a week. */
export interface SeatBudget {
  weekPct?: number;
  weekTokens?: number;
}

export interface RateLimitInfo {
  fiveHour?: number;
  fiveHourResetsAt?: number;
  week?: number;
  weekResetsAt?: number;
  at: number;
}

export type ChatFocus = "reverse" | "chief";

/** Something started from the one "What do you want to do?" box (plan.md 7.2): the chief's page lists them. */
export interface StartedItem {
  at: number;
  /** What was typed, shortened, with private details by their shape left out. */
  text: string;
  /** The project it went to; none when the chief took it. */
  projectId?: string;
  chatId?: string;
  /** Sent to several projects at once: one run per project, each in its own copy. */
  runs?: string[];
}

export interface ChatInfo {
  id: string;
  projectId: string;
  cwd: string;
  title: string;
  model?: string;
  mode: ChatMode;
  status: ChatStatus;
  startedAt: number;
  sessionId?: string;
  exitCode?: number;
  rateLimit?: RateLimitInfo;
  accountId?: string;
  /** Auto mode works in its own copy of the repo, on its own branch (plan.md 0, sandbox). */
  worktree?: { path: string; branch: string; base: string; baseBranch?: string; sub: string };
  /** Shell commands run in Claude Code's sandbox (files and network limited). */
  sandboxed?: boolean;
  /** The chat runs as this persona (plan.md 6.3). */
  persona?: { id: string; name?: string; tools: "read" | "edit" };
  /**
   * What the chat is for: "reverse", reverse-engineering mode (REA), only for software the user owns
   * or may examine; "chief", the one assistant that hands work to the projects and reports back.
   */
  focus?: ChatFocus;
  /** The project's own hooks, MCP servers and skills that were left out until the user trusts it (plan.md 16.4). */
  untrusted?: { hooks: string[]; mcpServers: string[]; skills: string[]; fingerprint: string };
  /** Messages written while the AI was working; the next one goes out when the turn ends (plan.md 16.1). */
  queued?: QueuedMessage[];
  /** The one thing to know about the chat at a glance (plan.md 16.3); none when there is nothing to do. */
  pill?: ChatPill;
  /** How full the AI's working memory is after its last answer (plan.md 16.1). */
  context?: { tokens: number; window: number; cacheRead: number; at: number };
  /** The plan's usage limit stopped the last turn; when it resets, and when the chat will go on by itself. */
  limit?: { resetsAt?: number; resumeAt?: number };
  /** What the last turn and the whole chat used: tokens, the 5-hour limit and an API-price estimate. */
  spend?: ChatSpend;
  /** What the next message will likely use of the 5-hour limit, from this project's recent turns. */
  estimate?: TurnEstimate;
}

/**
 * One turn's use. `limitPct`: how much of the 5-hour limit it took (0 to 1), known only when the
 * plan reported the limit before and after; `costUsd`: what it would cost at API prices (an estimate).
 */
export interface TurnSpend {
  tokens: number;
  outputTokens: number;
  costUsd?: number;
  limitPct?: number;
}

/** Shares of the 5-hour limit (0–1): a usual turn, a big one, and what is left now. */
export interface TurnEstimate {
  typical: number;
  high: number;
  samples: number;
  left?: number;
}

/** Fewer turns than this say too little to guess from. */
const ESTIMATE_MIN = 3;

/**
 * Before a message is sent (plan.md 13): how much of the limit a turn here usually takes (the median)
 * and a big one (the 80th percentile), from turns whose share the plan reported, and whether what is
 * left covers a big one. Only measured turns count; with too few there is no estimate, not a guess.
 */
export function estimateTurn(shares: number[], used?: number): TurnEstimate | undefined {
  const sorted = shares.filter((s) => Number.isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (sorted.length < ESTIMATE_MIN) return undefined;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    typical: at(0.5),
    high: at(0.8),
    samples: sorted.length,
    ...(used !== undefined ? { left: Math.max(0, 1 - used) } : {}),
  };
}

/** One line of a chat's own to-do list, written and ticked off by the user. */
export interface ChatTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
}

export interface ChatSpend {
  turn: TurnSpend;
  total: TurnSpend & { turns: number };
}

/** The result of a chat step the turn ended before (plan.md 16.3); the web app shows it translated. */
export const STEP_CUT = "The turn ended before this step finished.";

/** In this order of urgency: a step to approve, a question to answer, working, a plan to read, an unseen answer. */
export type ChatPill = "approval" | "question" | "limit" | "working" | "plan" | "done";

export interface QueuedMessage {
  id: string;
  text: string;
  images: number;
}

/** A chat Igrek remembers after it ended or Igrek restarted, so it can be continued from its saved session. */
export interface RecentChat {
  id: string;
  projectId: string;
  projectName?: string;
  sessionId: string;
  title: string;
  startedAt: number;
  updatedAt: number;
}

export type ChatEvent =
  | { kind: "user"; id: string; at: number; text: string; images: number }
  | { kind: "text"; id: string; at: number; text: string }
  | {
      kind: "tool";
      id: string;
      at: number;
      name: string;
      input: unknown;
      status: "running" | "done" | "error";
      result?: string;
    }
  | {
      kind: "permission";
      id: string;
      requestId: string;
      at: number;
      toolName: string;
      input: unknown;
      description?: string;
      /** Why a person must look: it ships work (push, deploy…), or the chat read outside content. */
      guard?: "ship" | "external";
      /** The rule "always allow in this project" would save ("Bash(bun test)"); none when it can't be narrowed. */
      rule?: string;
      status: "pending" | "allowed" | "denied";
    }
  | { kind: "result"; id: string; at: number; durationMs?: number; isError: boolean; text?: string }
  | {
      kind: "notice";
      id: string;
      at: number;
      text: string;
      tone: "danger" | "neutral";
      /**
       * "notebook": opinions written down (text = count); "notebookRejected": a change without new evidence;
       * "loop": the same step with the same input again and again (text = the tool's name);
       * "history": the end of the earlier conversation a continued chat shows (text = how many messages);
       * "private": private details were hidden in the message before it left (text = their names, comma-separated);
       * "run": a run the chief started has a result (text = "runId|status|project|changed files");
       * "aiRule": something the AI read tells AI tools not to help (text = JSON { line, file }).
       */
      code?: "external" | "notebook" | "notebookRejected" | "loop" | "history" | "private" | "run" | "aiRule";
    }
  | {
      /** The project's checks after a turn that changed files (plan.md 15.5). */
      kind: "gate";
      id: string;
      at: number;
      status: "running" | "pass" | "fail" | "none";
      checks: {
        command: string;
        ok: boolean /** Passed the last time it ran here. */;
        broke: boolean;
        output?: string;
      }[];
      /** The failures were sent to the AI to fix. */
      sentBack?: boolean;
    }
  | { kind: "checkpoint"; id: string; at: number; checkpointId: string; projectId: string };

/**
 * A continued session opens with its last messages, so the chat does not look empty while Claude
 * remembers everything; a divider then marks where the new part begins.
 */
export function historyEvents(messages: TranscriptMessage[], limit = 80): ChatEvent[] {
  const shown = messages.slice(-limit);
  if (!shown.length) return [];
  const events = shown.map((m): ChatEvent => {
    const id = `history-${m.id}`;
    if (m.kind === "prompt") return { kind: "user", id, at: m.ts, text: m.text, images: 0 };
    if (m.kind === "text") return { kind: "text", id, at: m.ts, text: m.text };
    return {
      kind: "tool",
      id,
      at: m.ts,
      name: m.toolName ?? "tool",
      input: {},
      status: m.kind === "error" ? "error" : "done",
      result: m.text,
    };
  });
  const last = shown[shown.length - 1]?.ts ?? 0;
  return [
    ...events,
    { kind: "notice", id: "history-end", at: last, text: String(shown.length), tone: "neutral", code: "history" },
  ];
}

/** The message that hands failures from the gate back to the AI, with the evidence (plan.md 15.5). */
export function fixRequest(broke: { command: string; output?: string }[]): string {
  const parts = broke.map((c) => `$ ${c.command}\n${(c.output ?? "").trim()}`);
  return `Igrek ran the project's checks after your changes. These passed before this turn and fail now:\n\n${parts.join("\n\n")}\n\nFix what your changes broke, then say what you changed. Do not weaken or skip the checks.`;
}

export interface Checkpoint {
  id: string;
  label: string;
  at: number;
}

export interface Account {
  id: string;
  provider: AiTool;
  /** Name the user gave it, e.g. "Work" or "Personal". */
  label: string;
  configDir: string;
  /** The login that already existed (~/.claude); can't be removed from Igrek. */
  isDefault: boolean;
  email?: string;
  plan?: string;
  loggedIn: boolean;
  /** New sessions use the active account (unless a project picks another). */
  active: boolean;
  checkedAt?: number;
  rateLimit?: RateLimitInfo;
}

export interface LimitForecast {
  /** When the 5-hour limit will be full at the current pace, if it will before reset. */
  fullAt?: number;
  /** Utilization per hour over the last snapshots. */
  perHour?: number;
}

export interface UsageBucket {
  key: string;
  label: string;
  tokens: number;
}

export interface LimitsOverview {
  accounts: (Account & { forecast?: LimitForecast; history: RateLimitInfo[] })[];
  /** Tokens per day for the last 14 days, split by project. */
  days: { day: string; total: number; byProject: Record<string, number> }[];
  projects: UsageBucket[];
  models: UsageBucket[];
  /** Tokens of sessions that ran as a persona. */
  personas: UsageBucket[];
  sessions: (UsageBucket & { projectId: string | null })[];
  hours: { hour: number; tokens: number }[];
  total: number;
}

export type ShareLevel = "off" | "summary" | "full";

export interface TeamMember {
  id: string;
  username: string;
  /** The general manager (plan.md 20.2). */
  generalManager?: boolean;
  displayName: string;
  role: "admin" | "member" | "viewer";
  online?: boolean;
  /** "#3b82f6" or a small data: image. */
  avatar?: string;
  language?: string;
  lastSeen?: number;
}

export interface TeamStatus {
  configured: boolean;
  connected: boolean;
  hub?: string;
  user?: { id: string; username: string; displayName: string; role: "admin" | "member" | "viewer" };
  keyMismatch: boolean;
  /** The hub no longer accepts this device (password reset or removed): join again with a new invite. */
  signedOut: boolean;
  /** Changes waiting to go out (sessions, memory). */
  pending: number;
  /** Signed in, but an admin hasn't approved this device yet (no team key). */
  waitingForKey: boolean;
  keyEpoch: number;
  /** Events missing from teammates' chains (being repaired) and links that didn't match (plan.md 4.1). */
  /** Gaps being repaired, broken links, and when this computer last compared itself with the hub. */
  integrity?: { missing: number; broken: number; checkedAt?: number; matches?: boolean };
  lastSyncAt?: number;
  members: TeamMember[];
}

export interface TeamUser extends TeamMember {
  email?: string;
  disabled: boolean;
  mustChangePassword: boolean;
  twoFactor?: boolean;
  createdAt: number;
}

export interface TeamDevice {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  ip?: string;
}

export interface TeamAuditEntry {
  at: number;
  userId?: string;
  action: string;
  detail?: string;
  ip?: string;
}

export interface TeamInvite {
  user: { id: string; username: string };
  invite: string;
  /** Where the hub emailed it, or why it couldn't. */
  emailed?: string;
  emailError?: string;
}

/** "Kerim is working on …" */
export interface Presence {
  userId: string;
  name: string;
  projectId: string;
  title?: string;
  tool?: string;
  files: string[];
  /** Files they are touching that your own recent session touched too. */
  overlap?: string[];
  at: number;
}

/** Messages pushed from server to UI over the WebSocket. */
export type ServerMessage =
  | { type: "hello"; version: string }
  | { type: "settings"; settings: Settings }
  | { type: "emergency-stop"; stoppedAt: string; stopped: number }
  /** How many things the emergency stop would stop now (chats, jobs, remote commands). */
  | { type: "stoppable"; count: number }
  | { type: "pong"; at: number }
  | { type: "index"; status: IndexStatus }
  | { type: "sessions-changed"; projectIds: string[]; sessionIds: string[] }
  | { type: "terminals"; terminals: TerminalInfo[] }
  | { type: "approvals"; approvals: Approval[] }
  | { type: "servers-changed" }
  | { type: "chats"; chats: ChatInfo[] }
  | { type: "accounts-changed" }
  | { type: "limits-changed" }
  | { type: "team-changed" }
  /** The company's cards, channels or teams changed (plan.md 20). */
  | { type: "org-changed" }
  /** A meeting room's news from the hub (plan.md 20.8): who is there, who came or left, a signal. */
  | {
      type: "call";
      op: "peers" | "joined" | "left" | "signal";
      room: string;
      peers?: { device: string; user: string }[];
      device?: string;
      user?: string;
      name?: string;
      from?: string;
      data?: string;
    }
  | { type: "insight-changed"; projectId: string }
  | { type: "import-progress"; projectId: string }
  | { type: "deploys-changed"; projectId: string }
  | { type: "presence" }
  | { type: "personas-changed" }
  | { type: "experts-changed"; projectId: string }
  | { type: "meetings-changed"; meetingId: string }
  | { type: "testers-changed"; runId: string }
  | { type: "library-changed" }
  | { type: "lessons-changed" }
  | { type: "knowledge-changed" }
  | { type: "flows-changed"; runId?: string }
  /** A chat handed over from another computer arrived, or one was taken (handoff.ts). */
  | { type: "handoffs-changed" }
  /** A message, reply or channel in the team chat (team-chat.ts); also while Igrek is writing an answer. */
  | { type: "chat-changed"; channelId: string; writing?: boolean; typing?: string[] }
  | { type: "bots-changed" }
  | { type: "launch-changed"; projectId: string }
  | { type: "ui-notes-changed"; projectId: string }
  /** The browser extension asks to pair; Igrek shows its code for the user to allow. */
  | { type: "extension-pair" }
  | { type: "board-changed"; projectId: string }
  | { type: "schedules-changed" }
  | { type: "devservers-changed"; projectId: string }
  | { type: "i18n-progress"; code: string }
  | { type: "monitors-changed" }
  | { type: "docs-changed"; projectId: string }
  | { type: "ops-changed"; what: string }
  /** Something that needs a desktop notification right away (a site went down, a new app error). */
  | {
      type: "alert";
      kind: "down" | "up" | "appError" | "backupFailed" | "budget" | "org";
      title: string;
      link: string;
      /** The project it is about, when there is one (routines listen for it). */
      projectId?: string;
    };

/** Messages sent from UI to server over the WebSocket. */
export type ClientMessage = { type: "ping"; at: number };

/** One month in the usage report. */
export interface MonthlyReport {
  /** "2026-10" */
  month: string;
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  sessions: number;
  models: Record<string, number>;
  projects: { id: string; name: string; tokens: number }[];
}

/** The same project on a server, as Staging or Prod (plan.md 1.2b). */
export interface EnvironmentInfo {
  id: string;
  projectId: string;
  name: string;
  serverId: string;
  serverName: string;
  path: string;
  branch: string;
  deployCommand: string;
}

export interface EnvironmentState {
  reachable: boolean;
  error?: string;
  head?: string;
  branch?: string;
  /** Files changed on the server outside git (someone edited there). */
  dirty?: number;
  lastCommitAt?: number;
  lastSubject?: string;
  localHead?: string;
  /** Commits this computer has that the server doesn't. */
  ahead?: number;
  /** Commits on the server that this computer doesn't have. */
  behind?: number;
  knownLocally?: boolean;
  checkedAt: number;
}

export interface DeployCheck {
  id: string;
  level: "block" | "warn" | "info";
  detail?: string;
}

export interface DeployRecord {
  id: string;
  envId: string;
  projectId: string;
  at: number;
  fromHead: string;
  toHead: string;
  command: string;
  exitCode: number;
  output: string;
  ms: number;
}

/** An entry in a folder on a server (plan.md 2.5). */
export interface RemoteEntry {
  name: string;
  dir: boolean;
  link: boolean;
  size: number;
  mtime: number;
}

/** Today across every workspace (plan.md 1.2b). */
export interface TodaySummary {
  sessions: number;
  teamSessions: number;
  commits: number;
  deploys: number;
  failedDeploys: number;
  projects: { id: string; name: string; team: boolean; sessions: number; commits: number }[];
}

/** What the next sync would send for a project, secrets already removed (plan.md 4.2). */
export interface SharePreview {
  share: ShareLevel;
  sessions: {
    id: string;
    title: string;
    summary: string[];
    firstPrompt?: string;
    files: string[];
    updatedAt: number;
  }[];
  /** Conversation messages included ("full" sharing only). */
  messages: number;
  memory: { section: string; text: string }[];
  privateSessions: number;
}

/** A device waiting for an admin to give it the team key (plan.md 4.2). */
export interface KeyRequest {
  deviceId: string;
  userId: string;
  username: string;
  displayName: string;
  name: string;
  publicKey: string;
  createdAt: number;
  missing: number[];
}

/** Pushed by the hub to admins. */
export interface HubAlertInfo {
  kind: "failed-logins" | "new-location";
  user: string;
  ip?: string;
  count?: number;
  at: number;
}

/** One teammate's recent work (plan.md 4.4 / 4.6). */
export interface TeamActivity {
  userId: string;
  name: string;
  sessions: {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    did: string[];
    files: string[];
    updatedAt: number;
  }[];
  decisions: { section: string; text: string; projectId: string; at: number }[];
}

/** A skill for Claude Code found in a catalog: the official Anthropic one or skills.sh. */
export interface SkillHit {
  /** "owner/repo/skill" */
  id: string;
  source: string;
  skill: string;
  name: string;
  description?: string;
  installs?: number;
  official: boolean;
  installed: boolean;
}

/** What a skill would put on this computer, read before it is installed. */
export interface SkillPreview extends SkillHit {
  /** The skill's folder in its repository. */
  path: string;
  text: string;
  license?: string;
  files: { path: string; size: number }[];
  /** Programs in it (Python, shell, JavaScript…): they run on this computer when the skill uses them. */
  scripts: string[];
}

export interface InstalledSkill {
  name: string;
  description: string;
  /** Where it came from, when Igrek installed it. */
  source?: string;
}

/** The Telegram bot that reaches the chief from a phone: its name, and whether a chat is paired. */
export interface TelegramStatus {
  configured: boolean;
  bot?: string;
  paired: boolean;
  /** Sent to the bot as "/start <code>" to pair the user's own Telegram chat. */
  pairCode?: string;
  error?: string;
}
