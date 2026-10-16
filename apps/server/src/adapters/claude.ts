import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const CLAUDE_PROJECTS_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");

export interface SessionFile {
  path: string;
  sessionId: string;
  size: number;
  mtime: number;
}

/** Top-level session transcripts (subagent transcripts live in subfolders and are skipped). */
export function listSessionFiles(root = CLAUDE_PROJECTS_DIR): SessionFile[] {
  const files: SessionFile[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(root);
  } catch {
    return files;
  }
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(join(root, dir));
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const path = join(root, dir, entry);
      try {
        const stat = statSync(path);
        if (stat.isFile()) {
          files.push({ path, sessionId: basename(entry, ".jsonl"), size: stat.size, mtime: stat.mtimeMs });
        }
      } catch {
        // File vanished between readdir and stat.
      }
    }
  }
  return files;
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
}

export interface ParsedMessage {
  id: string;
  ts: number;
  role: "user" | "assistant";
  kind: "prompt" | "text" | "tool";
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
  };
}

const MAX_TEXT = 4000;
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function clip(text: string, max = MAX_TEXT): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Strips Claude Code's wrapper tags so prompts read like what the person typed. */
function cleanPrompt(text: string): string {
  return text
    .replace(/<\/?pasted_content[^>]*>/g, "")
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
    .replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1 ")
    .replace(/<command-args>([\s\S]*?)<\/command-args>/g, "$1")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

function describeToolInput(name: string, input: Record<string, unknown> | undefined): string {
  if (!input) return name;
  const pick =
    input.description ?? input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query;
  return typeof pick === "string" ? clip(`${name}: ${pick}`, 300) : name;
}

type Json = Record<string, unknown>;

/**
 * Applies one transcript line to the running session state and returns the
 * readable messages it contains (prompts, replies, tool calls). Tool results
 * and hidden bookkeeping lines only update counters.
 */
export function applyLine(state: SessionState, line: string, fallbackId: string): ParsedMessage[] {
  let entry: Json;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  const type = entry.type as string | undefined;
  if (type === "ai-title" && typeof entry.aiTitle === "string") state.title = entry.aiTitle;
  if (entry.isSidechain) return [];

  const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
  if (!Number.isNaN(ts)) {
    state.startedAt = state.startedAt === undefined ? ts : Math.min(state.startedAt, ts);
    state.updatedAt = state.updatedAt === undefined ? ts : Math.max(state.updatedAt, ts);
  }
  if (typeof entry.cwd === "string") state.cwd = entry.cwd;
  if (typeof entry.gitBranch === "string" && entry.gitBranch) state.gitBranch = entry.gitBranch;
  if (type === "system" && entry.subtype === "compact_boundary") state.compactions++;

  const id = (entry.uuid as string | undefined) ?? fallbackId;
  const at = Number.isNaN(ts) ? (state.updatedAt ?? 0) : ts;
  const message = entry.message as Json | undefined;
  const out: ParsedMessage[] = [];

  if (type === "user" && message) {
    if (entry.isCompactSummary) {
      state.compactions++;
      return [];
    }
    if (entry.isMeta) return [];
    const content = message.content;
    const texts: string[] = [];
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content as Json[]) {
        if (part.type === "text" && typeof part.text === "string") texts.push(part.text);
        if (part.type === "tool_result" && part.is_error) {
          state.toolErrors++;
          state.recentErrors.push(at);
          if (state.recentErrors.length > 20) state.recentErrors.shift();
        }
      }
    }
    const text = cleanPrompt(texts.join("\n"));
    if (text && !text.startsWith("Caveat:") && !text.startsWith("[Request interrupted")) {
      state.userMessages++;
      state.firstPrompt ??= clip(text, 500);
      out.push({ id, ts: at, role: "user", kind: "prompt", text: clip(text) });
    }
    return out;
  }

  if (type === "assistant" && message) {
    const messageId = message.id as string | undefined;
    // Claude Code writes each content block of one API message as its own line,
    // repeating the usage numbers; count them once per message.
    if (messageId && messageId !== state.lastMessageId) {
      state.lastMessageId = messageId;
      state.assistantMessages++;
      const model = message.model as string | undefined;
      if (model && model !== "<synthetic>") state.models[model] = (state.models[model] ?? 0) + 1;
      const usage = message.usage as Record<string, number> | undefined;
      if (usage) {
        const input = usage.input_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const cacheWrite = usage.cache_creation_input_tokens ?? 0;
        state.tokensIn += input;
        state.tokensOut += usage.output_tokens ?? 0;
        state.tokensCacheRead += cacheRead;
        state.tokensCacheWrite += cacheWrite;
        state.contextTokens = input + cacheRead + cacheWrite;
      }
    }
    const blocks = Array.isArray(message.content) ? (message.content as Json[]) : [];
    blocks.forEach((block, index) => {
      const blockId = blocks.length > 1 ? `${id}:${index}` : id;
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        out.push({ id: blockId, ts: at, role: "assistant", kind: "text", text: clip(block.text.trim()) });
      } else if (block.type === "tool_use") {
        const name = String(block.name ?? "tool");
        const input = block.input as Json | undefined;
        state.toolCalls++;
        const file = input?.file_path ?? input?.notebook_path;
        if (EDIT_TOOLS.has(name) && typeof file === "string" && !state.filesTouched.includes(file)) {
          state.filesTouched.push(file);
          if (state.filesTouched.length > 300) state.filesTouched.shift();
        }
        out.push({
          id: blockId,
          ts: at,
          role: "assistant",
          kind: "tool",
          toolName: name,
          text: describeToolInput(name, input),
        });
      }
    });
  }
  return out;
}
