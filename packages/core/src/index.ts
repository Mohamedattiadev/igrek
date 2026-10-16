export * from "./insight";
export * from "./prompt";

export const APP_NAME = "God Eye";
export const APP_VERSION = "0.1.0";
export const DEFAULT_PORT = 7777;

export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type UiMode = "simple" | "pro";
export type Keymap = "default" | "vim";

export interface Settings {
  language: string;
  theme: Theme;
  density: Density;
  mode: UiMode;
  keymap: Keymap;
  onboarded: boolean;
  /** Summarize finished sessions automatically with a small, cheap model. */
  autoSummarize: boolean;
  /** How summaries are written: for anyone, or with technical detail. */
  summaryTone: "plain" | "technical";
  /** Extra folders (besides projects) God Eye may open in the file manager. */
  allowedFolders: string[];
  /** Vim keys inside the code editor (independent of list navigation). */
  editorVim: boolean;
  /** Prompt enhancer: never, offer it on weak prompts, or open it on every weak prompt. */
  enhanceMode: "off" | "suggest" | "auto";
  /** Language of the enhanced prompt: English (AI tools follow it best) or the user's own. */
  enhanceLanguage: "en" | "user";
  /** The user's own shorthands, expanded before enhancing: { "dyy": "doğrusunu yap" }. */
  enhanceShortcuts: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  theme: "system",
  density: "comfortable",
  mode: "simple",
  keymap: "default",
  onboarded: false,
  autoSummarize: true,
  summaryTone: "plain",
  allowedFolders: [],
  editorVim: false,
  enhanceMode: "suggest",
  enhanceLanguage: "en",
  enhanceShortcuts: {},
};

/** Languages written right-to-left; the UI flips its layout for these. */
export const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi"]);

export interface ToolCheck {
  id: "git" | "claude" | "codex" | "gemini" | "ssh" | "docker";
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
  /** Set when this item contradicts an older one; the user decides which stays. */
  conflict?: { withId: string; withText: string; reason: string };
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
  sessionCount: number;
  activeSessions: number;
  lastActivity: number;
  hidden: boolean;
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
      status: "pending" | "allowed" | "denied";
    }
  | { kind: "result"; id: string; at: number; durationMs?: number; isError: boolean; text?: string }
  | { kind: "notice"; id: string; at: number; text: string; tone: "danger" | "neutral" }
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
}

export interface TeamStatus {
  configured: boolean;
  connected: boolean;
  hub?: string;
  user?: { id: string; username: string; displayName: string; role: "admin" | "member" | "viewer" };
  keyMismatch: boolean;
  /** The hub no longer accepts this device (password reset or removed): join again with a new invite. */
  signedOut: boolean;
  members: TeamMember[];
}

export interface TeamUser extends TeamMember {
  disabled: boolean;
  mustChangePassword: boolean;
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
  | { type: "presence" };

/** Messages sent from UI to server over the WebSocket. */
export type ClientMessage = { type: "ping"; at: number };
