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
  workspace: "local";
  sessionCount: number;
  activeSessions: number;
  lastActivity: number;
  hidden: boolean;
  hooksInstalled: boolean;
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

export type TerminalTool = "claude" | "codex" | "gemini" | "shell";
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

/** Messages pushed from server to UI over the WebSocket. */
export type ServerMessage =
  | { type: "hello"; version: string }
  | { type: "settings"; settings: Settings }
  | { type: "emergency-stop"; stoppedAt: string; stopped: number }
  | { type: "pong"; at: number }
  | { type: "index"; status: IndexStatus }
  | { type: "sessions-changed"; projectIds: string[]; sessionIds: string[] }
  | { type: "terminals"; terminals: TerminalInfo[] };

/** Messages sent from UI to server over the WebSocket. */
export type ClientMessage = { type: "ping"; at: number };
