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

/**
 * pi coding agent (plan.md 16.3). Each session is one append-only JSONL file:
 *   ~/.pi/agent/sessions/--<folder with / as ->--/<timestamp>_<session id>.jsonl
 * The first line is a `session` header with the cwd; then `message` entries holding user,
 * assistant (with usage) and toolResult messages, plus compaction, model_change and session_info.
 * Entries form a tree (id/parentId) for in-place branches; God Eye reads them in file order.
 * Written from pi's docs/session-format.md (pi 1.3); not yet checked against a real install here.
 */

const PI_SESSIONS_DIR = process.env.PI_CODING_AGENT_SESSION_DIR ?? join(homedir(), ".pi", "agent", "sessions");

function listPiFiles(root = PI_SESSIONS_DIR): SessionFile[] {
  const files: SessionFile[] = [];
  let folders: string[] = [];
  try {
    folders = readdirSync(root);
  } catch {
    return files;
  }
  for (const folder of folders) {
    let names: string[] = [];
    try {
      names = readdirSync(join(root, folder));
    } catch {
      continue;
    }
    for (const name of names) {
      const match = name.match(/^[^_]+_(.+)\.jsonl$/);
      if (!match?.[1]) continue;
      const path = join(root, folder, name);
      try {
        const stat = statSync(path);
        if (stat.isFile()) files.push({ path, sessionId: `pi-${match[1]}`, size: stat.size, mtime: stat.mtimeMs });
      } catch {
        // Vanished between readdir and stat.
      }
    }
  }
  return files;
}

type Json = Record<string, unknown>;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Json[])
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

const EDIT_TOOLS = new Set(["edit", "write"]);

function noteUsage(state: SessionState, ts: number, model: string | undefined, usage: Json | undefined): void {
  if (!usage) return;
  const n = (key: string) => (typeof usage[key] === "number" ? (usage[key] as number) : 0);
  // pi counts reasoning inside `output` already.
  state.tokensIn += n("input");
  state.tokensOut += n("output");
  state.tokensCacheRead += n("cacheRead");
  state.tokensCacheWrite += n("cacheWrite");
  state.usageEvents ??= [];
  state.usageEvents.push({
    ts,
    model,
    input: n("input"),
    output: n("output"),
    cacheRead: n("cacheRead"),
    cacheWrite: n("cacheWrite"),
  });
}

function assistantMessages(state: SessionState, m: Json, id: string, ts: number): ParsedMessage[] {
  state.assistantMessages++;
  const model = typeof m.model === "string" ? m.model : undefined;
  if (model) state.models[model] = (state.models[model] ?? 0) + 1;
  const usage = m.usage as Json | undefined;
  noteUsage(state, ts, model, usage);
  if (usage)
    state.contextTokens = Number(usage.input ?? 0) + Number(usage.cacheRead ?? 0) + Number(usage.cacheWrite ?? 0);
  const out: ParsedMessage[] = [];
  const parts = Array.isArray(m.content) ? (m.content as Json[]) : [];
  const text = clip(textOf(parts).trim());
  if (text) {
    checkClaim(state, ts, text);
    out.push({ id, ts, role: "assistant", kind: "text", text });
  }
  parts.forEach((part, i) => {
    if (part.type !== "toolCall") return;
    const name = typeof part.name === "string" ? part.name : "tool";
    const args = (part.arguments as Json) ?? {};
    state.toolCalls++;
    state.pendingTools ??= {};
    if (typeof part.id === "string") state.pendingTools[part.id] = name;
    if (EDIT_TOOLS.has(name) && typeof args.path === "string")
      noteFile(state, args.path.startsWith("/") || !state.cwd ? args.path : join(state.cwd, args.path));
    const command = typeof args.command === "string" ? args.command : "";
    if (command) notePackages(state, command);
    const label = command ? `${name}: ${command}` : `${name}: ${JSON.stringify(args)}`;
    out.push({ id: `${id}:t${i}`, ts, role: "assistant", kind: "tool", toolName: name, text: clip(label, 300) });
  });
  if (m.stopReason === "error" && typeof m.errorMessage === "string")
    out.push({ id: `${id}:e`, ts, role: "user", kind: "error", text: clip(m.errorMessage, 600) });
  return out;
}

function messageEntry(state: SessionState, m: Json, id: string, ts: number): ParsedMessage[] {
  if (m.role === "user") {
    const text = textOf(m.content).trim();
    if (!text) return [];
    state.userMessages++;
    state.firstPrompt ??= clip(text, 500);
    return [{ id, ts, role: "user", kind: "prompt", text: clip(text) }];
  }
  if (m.role === "assistant") return assistantMessages(state, m, id, ts);
  if (m.role === "toolResult") {
    const callId = String(m.toolCallId ?? "");
    const name = typeof m.toolName === "string" ? m.toolName : state.pendingTools?.[callId];
    noteUsage(state, ts, undefined, m.usage as Json | undefined);
    const failure = noteToolResult(state, ts, `${id}:r`, m.isError === true, name, textOf(m.content));
    if (state.pendingTools) delete state.pendingTools[callId];
    return failure ? [failure] : [];
  }
  return [];
}

export function applyPiLine(state: SessionState, line: string, fallbackId: string): ParsedMessage[] {
  let entry: Json;
  try {
    entry = JSON.parse(line) as Json;
  } catch {
    return [];
  }
  const ts = touch(state, entry.timestamp);
  const id = typeof entry.id === "string" ? entry.id : fallbackId;
  switch (entry.type) {
    case "session":
      if (typeof entry.cwd === "string") state.cwd = entry.cwd;
      return [];
    case "session_info":
      if (typeof entry.name === "string" && entry.name) state.title = clip(entry.name, 80);
      return [];
    case "compaction":
      state.compactions++;
      noteUsage(state, ts, undefined, entry.usage as Json | undefined);
      return [];
    case "usage":
    case "branch_summary":
      noteUsage(state, ts, typeof entry.model === "string" ? entry.model : undefined, entry.usage as Json | undefined);
      return [];
    case "message": {
      state.lastMessageId = id;
      return messageEntry(state, (entry.message as Json) ?? {}, id, ts);
    }
    default:
      return [];
  }
}

export function piAdapter(root = PI_SESSIONS_DIR): Adapter {
  return { tool: "pi", listFiles: () => listPiFiles(root), applyLine: applyPiLine };
}
