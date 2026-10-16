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
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  theme: "system",
  density: "comfortable",
  mode: "simple",
  keymap: "default",
  onboarded: false,
  autoSummarize: true,
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
  kind: "prompt" | "text" | "tool";
  toolName?: string;
  text: string;
}

export interface SessionDetail extends SessionListItem {
  cwd?: string;
  firstPrompt?: string;
  filesTouched: string[];
  /** Files the session edited that no longer exist on disk. */
  missingFiles: string[];
  toolErrors: number;
  compactions: number;
  messages: TranscriptMessage[];
}

export type MemorySection = "status" | "decision" | "convention" | "failed" | "issue";

export interface MemoryItem {
  id: string;
  section: MemorySection;
  text: string;
  sourceSession?: string;
  createdAt: number;
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

/** Messages pushed from server to UI over the WebSocket. */
export type ServerMessage =
  | { type: "hello"; version: string }
  | { type: "settings"; settings: Settings }
  | { type: "emergency-stop"; stoppedAt: string; stopped: number }
  | { type: "pong"; at: number }
  | { type: "index"; status: IndexStatus }
  | { type: "sessions-changed"; projectIds: string[]; sessionIds: string[] };

/** Messages sent from UI to server over the WebSocket. */
export type ClientMessage = { type: "ping"; at: number };
