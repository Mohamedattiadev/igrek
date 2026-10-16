import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

export const CODEX_SESSIONS_DIR = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/** Codex stores sessions as sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl. */
export function listCodexFiles(root = CODEX_SESSIONS_DIR): SessionFile[] {
  const files: SessionFile[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (depth < 3) {
        walk(path, depth + 1);
        continue;
      }
      const match = entry.match(UUID);
      if (!match?.[1]) continue;
      try {
        const stat = statSync(path);
        if (stat.isFile()) files.push({ path, sessionId: `codex-${match[1]}`, size: stat.size, mtime: stat.mtimeMs });
      } catch {
        // Vanished between readdir and stat.
      }
    }
  };
  walk(root, 0);
  return files;
}

type Json = Record<string, unknown>;

function contentText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return (content as Json[])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** Codex wraps its own context in tags (<environment_context>, <user_instructions>); those aren't prompts. */
function isInjected(text: string): boolean {
  return /^\s*<(environment_context|user_instructions|user_shell_command|turn_aborted)/.test(text);
}

function parseArgs(raw: unknown): Json {
  if (typeof raw !== "string") return (raw as Json) ?? {};
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return { raw };
  }
}

function commandOf(args: Json): string {
  const command = args.command ?? args.cmd ?? args.raw;
  if (Array.isArray(command)) return command.slice(-1).join(" ");
  return typeof command === "string" ? command : "";
}

const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

function notePatch(state: SessionState, patch: string): void {
  for (const match of patch.matchAll(PATCH_FILE)) {
    const file = match[1]?.trim();
    if (!file) continue;
    noteFile(state, file.startsWith("/") || !state.cwd ? file : join(state.cwd, file));
  }
}

/** Reads the exit status Codex embeds in a function_call_output. */
function outputFailed(output: unknown): { failed: boolean; text: string } {
  const raw = typeof output === "string" ? output : JSON.stringify(output ?? "");
  try {
    const parsed = JSON.parse(raw) as { output?: string; metadata?: { exit_code?: number } };
    const code = parsed.metadata?.exit_code;
    return { failed: typeof code === "number" && code !== 0, text: parsed.output ?? raw };
  } catch {
    return { failed: /exit code:? [1-9]|error:/i.test(raw.slice(0, 200)), text: raw };
  }
}

export function applyCodexLine(state: SessionState, line: string, fallbackId: string): ParsedMessage[] {
  let entry: Json;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  const at = touch(state, entry.timestamp);
  const payload = (entry.payload ?? {}) as Json;
  const type = entry.type as string | undefined;
  const id = `${fallbackId}`;

  if (type === "session_meta") {
    if (typeof payload.cwd === "string") state.cwd = payload.cwd;
    const git = payload.git as Json | undefined;
    if (typeof git?.branch === "string") state.gitBranch = git.branch;
    return [];
  }
  if (type === "turn_context") {
    if (typeof payload.cwd === "string") state.cwd = payload.cwd;
    if (typeof payload.model === "string") state.models[payload.model] = (state.models[payload.model] ?? 0) + 1;
    return [];
  }
  if (type === "compacted") {
    state.compactions++;
    return [];
  }
  if (type === "event_msg" && payload.type === "token_count") {
    const info = payload.info as Json | undefined;
    const total = info?.total_token_usage as Record<string, number> | undefined;
    const last = info?.last_token_usage as Record<string, number> | undefined;
    if (total) {
      // Codex reports running totals, and its input count already includes cached tokens.
      state.tokensCacheRead = total.cached_input_tokens ?? 0;
      state.tokensIn = Math.max(0, (total.input_tokens ?? 0) - state.tokensCacheRead);
      state.tokensOut = (total.output_tokens ?? 0) + (total.reasoning_output_tokens ?? 0);
    }
    if (last) {
      state.contextTokens = last.input_tokens ?? state.contextTokens;
      const cached = last.cached_input_tokens ?? 0;
      state.usageEvents ??= [];
      state.usageEvents.push({
        ts: at,
        model: Object.keys(state.models).at(-1),
        input: Math.max(0, (last.input_tokens ?? 0) - cached),
        output: (last.output_tokens ?? 0) + (last.reasoning_output_tokens ?? 0),
        cacheRead: cached,
        cacheWrite: 0,
      });
    }
    if (typeof info?.model_context_window === "number") state.contextWindow = info.model_context_window;
    return [];
  }
  if (type !== "response_item") return [];

  const kind = payload.type as string | undefined;
  if (kind === "message") {
    const text = contentText(payload.content).trim();
    if (!text) return [];
    if (payload.role === "user") {
      if (isInjected(text)) return [];
      state.userMessages++;
      state.firstPrompt ??= clip(text, 500);
      return [{ id, ts: at, role: "user", kind: "prompt", text: clip(text) }];
    }
    if (payload.role === "assistant") {
      state.assistantMessages++;
      checkClaim(state, at, text);
      return [{ id, ts: at, role: "assistant", kind: "text", text: clip(text) }];
    }
    return [];
  }

  if (kind === "function_call" || kind === "custom_tool_call" || kind === "local_shell_call") {
    const name = String(payload.name ?? (kind === "local_shell_call" ? "shell" : "tool"));
    const args = parseArgs(payload.arguments ?? payload.input ?? payload.action);
    const command = commandOf(args);
    state.toolCalls++;
    state.pendingTools ??= {};
    if (typeof payload.call_id === "string") state.pendingTools[payload.call_id] = name;
    if (name === "apply_patch") notePatch(state, String(payload.input ?? args.input ?? args.raw ?? ""));
    else if (command.includes("*** Begin Patch")) notePatch(state, command);
    if (command) notePackages(state, command);
    const label = name === "apply_patch" ? "apply_patch" : `${name}: ${command || JSON.stringify(args)}`;
    return [{ id, ts: at, role: "assistant", kind: "tool", toolName: name, text: clip(label, 300) }];
  }

  if (kind === "function_call_output" || kind === "custom_tool_call_output") {
    const callId = String(payload.call_id ?? "");
    const { failed, text } = outputFailed(payload.output);
    const failure = noteToolResult(state, at, `${id}:r`, failed, state.pendingTools?.[callId], text);
    if (state.pendingTools) delete state.pendingTools[callId];
    return failure ? [failure] : [];
  }
  return [];
}

export function codexAdapter(root = CODEX_SESSIONS_DIR, accountId?: string): Adapter {
  return { tool: "codex", accountId, listFiles: () => listCodexFiles(root), applyLine: applyCodexLine };
}
