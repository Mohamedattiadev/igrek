/** Shared shapes every AI-tool adapter produces (plan.md 3: adapter pattern). */
import type { AiTool } from "@igrek/core";

interface UsageEvent {
  ts: number;
  model?: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionFile {
  path: string;
  sessionId: string;
  size: number;
  mtime: number;
}

/** Running totals for one session, updated line by line. */
export interface SessionState {
  cwd?: string;
  gitBranch?: string;
  title?: string;
  firstPrompt?: string;
  startedAt?: number;
  updatedAt?: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolErrors: number;
  recentErrors: number[];
  compactions: number;
  tokensIn: number;
  tokensOut: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  contextTokens: number;
  models: Record<string, number>;
  filesTouched: string[];
  lastMessageId?: string;
  /** Context window reported by the tool itself, when it tells us. */
  contextWindow?: number;
  /** "Done / tests pass" claims made right after a failed step (plan.md 1.9). */
  unverifiedClaims: { ts: number; text: string }[];
  /** Packages the AI installed, checked against the registry later. */
  packages: { manager: "npm" | "pip"; name: string }[];
  /** Whether the most recent tool step failed. */
  lastToolFailed?: boolean;
  /** Tool call id → tool name, to label failures. Not persisted. */
  pendingTools?: Record<string, string>;
  /** Token use per API message since the last save, for the Limits page. Not persisted. */
  usageEvents?: UsageEvent[];
}

export interface ParsedMessage {
  id: string;
  ts: number;
  role: "user" | "assistant";
  kind: "prompt" | "text" | "tool" | "error";
  toolName?: string;
  text: string;
}

export function emptyState(): SessionState {
  return {
    userMessages: 0,
    assistantMessages: 0,
    toolCalls: 0,
    toolErrors: 0,
    recentErrors: [],
    compactions: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    contextTokens: 0,
    models: {},
    filesTouched: [],
    unverifiedClaims: [],
    packages: [],
  };
}

/** One AI coding tool whose transcripts God Eye can read. */
export interface Adapter {
  tool: AiTool;
  /** God Eye account the transcripts belong to (each account has its own folder). */
  accountId?: string;
  listFiles(): SessionFile[];
  /** Folds one transcript line into the session and returns its readable messages. */
  applyLine(state: SessionState, line: string, fallbackId: string): ParsedMessage[];
}

const MAX_TEXT = 4000;

export function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const CLAIM =
  /\b(all )?tests? (now )?(pass|passed|passing|are green)\b|\bbuild (succeeded|successful|passes|is green)\b|\b(everything|it) (works|is working)\b|\btestler (geçti|geçiyor)\b|\bçalışıyor\b/i;

function isClaim(text: string): boolean {
  return CLAIM.test(text);
}

/** Records a success claim if the step right before it failed. */
export function checkClaim(state: SessionState, ts: number, text: string): void {
  if (!state.lastToolFailed || !isClaim(text)) return;
  state.unverifiedClaims.push({ ts, text: clip(text, 300) });
  if (state.unverifiedClaims.length > 20) state.unverifiedClaims.shift();
}

const INSTALL = /\b(npm (?:install|i|add)|pnpm add|yarn add|bun add|pip3? install)\s+([^&|;\n]+)/g;

const NPM_NAME = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const PIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True for strings that can be a real package name (filters code fragments caught by the regex). */
export function isPackageName(manager: "npm" | "pip", name: string): boolean {
  return name.length <= 214 && (manager === "npm" ? NPM_NAME : PIP_NAME).test(name);
}

/** Notes packages from install commands like `npm install foo` or `pip install bar`. */
export function notePackages(state: SessionState, command: string): void {
  for (const match of command.matchAll(INSTALL)) {
    const manager = (match[1] ?? "").startsWith("pip") ? "pip" : "npm";
    for (const raw of (match[2] ?? "").trim().split(/\s+/)) {
      const word = raw.replace(/^['"]|['"]$/g, "");
      // Skip flags, paths, URLs, shell redirects (2>&1) and variables.
      if (!word || word.startsWith("-") || /^[.~/]/.test(word) || /[:<>$`]/.test(word)) continue;
      // Strip versions: react@19 → react, @types/node@20 → @types/node, flask==3 → flask.
      const name = manager === "npm" ? word.replace(/(.)@[^@]*$/, "$1") : (word.split(/[=<>~![]/)[0] ?? "");
      if (!isPackageName(manager, name) || state.packages.some((p) => p.manager === manager && p.name === name))
        continue;
      state.packages.push({ manager, name });
      if (state.packages.length > 100) state.packages.shift();
    }
  }
}

export function noteFile(state: SessionState, file: string): void {
  if (state.filesTouched.includes(file)) return;
  state.filesTouched.push(file);
  if (state.filesTouched.length > 300) state.filesTouched.shift();
}

/** Updates start/end times from an ISO timestamp and returns it as epoch ms (or the last known time). */
export function touch(state: SessionState, timestamp: unknown): number {
  const ts = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  if (Number.isNaN(ts)) return state.updatedAt ?? 0;
  state.startedAt = state.startedAt === undefined ? ts : Math.min(state.startedAt, ts);
  state.updatedAt = state.updatedAt === undefined ? ts : Math.max(state.updatedAt, ts);
  return ts;
}

/** Tracks a tool result: failures get a readable message, successes clear the failure flag. */
export function noteToolResult(
  state: SessionState,
  ts: number,
  id: string,
  failed: boolean,
  toolName: string | undefined,
  output: string,
): ParsedMessage | undefined {
  state.lastToolFailed = failed;
  if (!failed) return undefined;
  state.toolErrors++;
  state.recentErrors.push(ts);
  if (state.recentErrors.length > 20) state.recentErrors.shift();
  return { id, ts, role: "user", kind: "error", toolName, text: clip(output.trim() || "Failed", 600) };
}
