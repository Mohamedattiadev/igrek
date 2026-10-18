export * from "./data";
export * from "./docs";
export * from "./flows";
export * from "./help";
export * from "./insight";
export * from "./knowledge";
export * from "./lessons";
export * from "./library";
export * from "./ops";
export * from "./persona";
export * from "./personas";
export * from "./preview";
export * from "./prompt";
export * from "./schedules";
export * from "./scrub";
export * from "./testusers";

export const APP_NAME = "God Eye";
export const APP_VERSION = "0.1.0";
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
  keymap: Keymap;
  onboarded: boolean;
  /** Summarize finished sessions automatically with a small, cheap model. */
  autoSummarize: boolean;
  /** How summaries are written: for anyone, or with technical detail. */
  summaryTone: "plain" | "technical";
  /** Extra folders (besides projects) God Eye may open in the file manager. */
  allowedFolders: string[];
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
   * Days God Eye keeps its own copy of session transcripts (plan.md 13.6); 0 keeps them forever.
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
  keymap: "default",
  onboarded: false,
  autoSummarize: true,
  summaryTone: "plain",
  allowedFolders: [],
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
  id: "git" | "claude" | "codex" | "gemini" | "ssh" | "docker" | "bwrap" | "socat";
  found: boolean;
  version?: string;
  required: boolean;
}

export interface SystemStatus {
  version: string;
  dataDir: string;
  uptimeSeconds: number;
  tools: ToolCheck[];
}

export type AiTool = "claude" | "codex" | "gemini";

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

export type TerminalTool = "claude" | "codex" | "gemini" | "shell" | "ssh";
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

export type ChatMode = "normal" | "acceptEdits" | "auto" | "plan";
export type ChatStatus = "idle" | "working" | "waiting" | "exited";

/** Limit usage as Claude reports it (0–1), with reset times. */
export interface RateLimitInfo {
  fiveHour?: number;
  fiveHourResetsAt?: number;
  week?: number;
  weekResetsAt?: number;
  at: number;
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
}

/** A chat God Eye remembers after it ended or God Eye restarted, so it can be continued from its saved session. */
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
      status: "pending" | "allowed" | "denied";
    }
  | { kind: "result"; id: string; at: number; durationMs?: number; isError: boolean; text?: string }
  | {
      kind: "notice";
      id: string;
      at: number;
      text: string;
      tone: "danger" | "neutral";
      /** "notebook": opinions written down (text = count); "notebookRejected": a change without new evidence. */
      code?: "external" | "notebook" | "notebookRejected";
    }
  | { kind: "checkpoint"; id: string; at: number; checkpointId: string; projectId: string };

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
  /** The login that already existed (~/.claude); can't be removed from God Eye. */
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
  integrity?: { missing: number; broken: number };
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
  | { type: "insight-changed"; projectId: string }
  | { type: "import-progress"; projectId: string }
  | { type: "deploys-changed"; projectId: string }
  | { type: "presence" }
  | { type: "personas-changed" }
  | { type: "meetings-changed"; meetingId: string }
  | { type: "testers-changed"; runId: string }
  | { type: "library-changed" }
  | { type: "lessons-changed" }
  | { type: "knowledge-changed" }
  | { type: "flows-changed"; runId?: string }
  | { type: "board-changed"; projectId: string }
  | { type: "schedules-changed" }
  | { type: "devservers-changed"; projectId: string }
  | { type: "i18n-progress"; code: string }
  | { type: "monitors-changed" }
  | { type: "docs-changed"; projectId: string }
  | { type: "ops-changed"; what: string }
  /** Something that needs a desktop notification right away (a site went down, a new app error). */
  | { type: "alert"; kind: "down" | "up" | "appError" | "backupFailed"; title: string; link: string };

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
