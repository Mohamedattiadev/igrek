import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type Adapter,
  checkClaim,
  clip,
  noteFile,
  noteToolResult,
  type ParsedMessage,
  type SessionFile,
  type SessionState,
  touch,
} from "./types";

/**
 * Gemini CLI (plan.md 1.1). It keeps each chat as one JSON file:
 *   ~/.gemini/tmp/<sha256 of the project folder>/chats/session-<time>-<id>.json
 * with { sessionId, projectHash, startTime, lastUpdated, messages: [...] }.
 * The file is rewritten as the chat grows, so it's read whole each time it changes.
 * Written from the published format; not yet checked against a real install here.
 */

const GEMINI_DIR = join(process.env.GEMINI_CLI_HOME ?? join(homedir(), ".gemini"), "tmp");

function listGeminiFiles(root = GEMINI_DIR): SessionFile[] {
  const files: SessionFile[] = [];
  let hashes: string[] = [];
  try {
    hashes = readdirSync(root);
  } catch {
    return files;
  }
  for (const hash of hashes) {
    const dir = join(root, hash, "chats");
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/^session-.+\.json$/.test(name)) continue;
      const path = join(dir, name);
      try {
        const stat = statSync(path);
        if (stat.isFile())
          files.push({
            path,
            sessionId: `gemini-${name.replace(/^session-|\.json$/g, "")}`,
            size: stat.size,
            mtime: stat.mtimeMs,
          });
      } catch {
        // gone
      }
    }
  }
  return files;
}

/** Gemini names a project's folder after the SHA-256 of its path. */
export function geminiHash(path: string): string {
  return createHash("sha256").update(path).digest("hex");
}

type Json = Record<string, unknown>;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return (content as Json[])
      .map((p) => (typeof p === "string" ? p : typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n");
  return "";
}

const EDIT_TOOLS = new Set(["replace", "write_file", "edit", "edit_file", "smart_edit"]);

/** Reads a whole Gemini chat file into the session totals and its readable messages. */
function parseGeminiFile(
  state: SessionState,
  text: string,
  sessionId: string,
  cwdForHash: (hash: string) => string | undefined,
): ParsedMessage[] {
  let doc: Json;
  try {
    doc = JSON.parse(text) as Json;
  } catch {
    return [];
  }
  if (typeof doc.projectHash === "string") state.cwd = cwdForHash(doc.projectHash) ?? state.cwd;
  touch(state, doc.startTime);
  touch(state, doc.lastUpdated);
  const out: ParsedMessage[] = [];
  const messages = Array.isArray(doc.messages) ? (doc.messages as Json[]) : [];
  messages.forEach((m, i) => {
    const id = typeof m.id === "string" ? m.id : `${sessionId}:${i}`;
    const ts = touch(state, m.timestamp);
    const type = m.type;
    const content = clip(textOf(m.content).trim());
    if (type === "user") {
      if (!content) return;
      state.userMessages++;
      state.firstPrompt ??= content.slice(0, 500);
      state.title ??= content.split("\n")[0]?.slice(0, 80);
      out.push({ id, ts, role: "user", kind: "prompt", text: content });
      return;
    }
    if (type === "gemini" || type === "model" || type === "assistant") {
      state.assistantMessages++;
      if (typeof m.model === "string") state.models[m.model] = (state.models[m.model] ?? 0) + 1;
      const tokens = m.tokens as { input?: number; output?: number; cached?: number } | undefined;
      if (tokens) {
        state.tokensIn += tokens.input ?? 0;
        state.tokensOut += tokens.output ?? 0;
        state.tokensCacheRead += tokens.cached ?? 0;
        state.contextTokens = (tokens.input ?? 0) + (tokens.cached ?? 0);
      }
      if (content) {
        checkClaim(state, ts, content);
        out.push({ id, ts, role: "assistant", kind: "text", text: content });
      }
      const calls = Array.isArray(m.toolCalls) ? (m.toolCalls as Json[]) : [];
      calls.forEach((call, j) => {
        const name = typeof call.name === "string" ? call.name : "tool";
        const args = (call.args as Json) ?? {};
        state.toolCalls++;
        const file = args.file_path ?? args.absolute_path ?? args.path;
        if (EDIT_TOOLS.has(name) && typeof file === "string")
          noteFile(state, file.startsWith("/") || !state.cwd ? file : join(state.cwd, file));
        out.push({
          id: `${id}:t${j}`,
          ts,
          role: "assistant",
          kind: "tool",
          toolName: name,
          text: clip(JSON.stringify(args), 400),
        });
        const failed = call.status === "error" || call.status === "cancelled";
        const error = noteToolResult(
          state,
          ts,
          `${id}:e${j}`,
          failed,
          name,
          textOf((call.result as Json)?.output ?? call.resultDisplay ?? ""),
        );
        if (error) out.push(error);
      });
      return;
    }
    if (type === "error" && content) out.push({ id, ts, role: "user", kind: "error", text: content });
  });
  state.lastMessageId = typeof messages.at(-1)?.id === "string" ? (messages.at(-1)?.id as string) : state.lastMessageId;
  return out;
}

export interface WholeFileAdapter extends Adapter {
  /** Read the whole file again whenever it changes (instead of appended lines). */
  parseFile(state: SessionState, text: string, sessionId: string): ParsedMessage[];
}

export function geminiAdapter(root = GEMINI_DIR, projectPaths: () => string[] = () => []): WholeFileAdapter {
  return {
    tool: "gemini",
    listFiles: () => listGeminiFiles(root),
    applyLine: () => [],
    parseFile: (state, text, sessionId) => {
      const byHash = new Map(projectPaths().map((p) => [geminiHash(p), p]));
      return parseGeminiFile(state, text, sessionId, (hash) => byHash.get(hash));
    },
  };
}
