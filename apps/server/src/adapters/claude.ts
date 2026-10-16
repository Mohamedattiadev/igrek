import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  type Adapter,
  checkClaim,
  clip,
  noteFile,
  notePackages,
  noteToolResult,
  type ParsedMessage,
  type SessionFile,
  type SessionState,
  touch,
} from "./types";

export const CLAUDE_PROJECTS_DIR = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");

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

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

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

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Json[]).map((part) => (typeof part.text === "string" ? part.text : "")).join("\n");
  }
  return "";
}

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

  const ts = touch(state, entry.timestamp);
  if (typeof entry.cwd === "string") state.cwd = entry.cwd;
  if (typeof entry.gitBranch === "string" && entry.gitBranch) state.gitBranch = entry.gitBranch;
  if (type === "system" && entry.subtype === "compact_boundary") state.compactions++;

  const id = (entry.uuid as string | undefined) ?? fallbackId;
  const at = ts;
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
        if (part.type === "tool_result") {
          const callId = String(part.tool_use_id ?? "");
          const failure = noteToolResult(
            state,
            at,
            `${id}:r:${callId}`,
            part.is_error === true,
            state.pendingTools?.[callId],
            resultText(part.content),
          );
          if (failure) out.push(failure);
          if (state.pendingTools) delete state.pendingTools[callId];
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
        checkClaim(state, at, block.text);
        out.push({ id: blockId, ts: at, role: "assistant", kind: "text", text: clip(block.text.trim()) });
      } else if (block.type === "tool_use") {
        const name = String(block.name ?? "tool");
        const input = block.input as Json | undefined;
        state.toolCalls++;
        state.pendingTools ??= {};
        if (typeof block.id === "string") state.pendingTools[block.id] = name;
        const file = input?.file_path ?? input?.notebook_path;
        if (EDIT_TOOLS.has(name) && typeof file === "string") noteFile(state, file);
        if (name === "Bash" && typeof input?.command === "string") notePackages(state, input.command);
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

export function claudeAdapter(root = CLAUDE_PROJECTS_DIR): Adapter {
  return { tool: "claude", listFiles: () => listSessionFiles(root), applyLine };
}
