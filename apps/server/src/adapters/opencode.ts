import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WholeFileAdapter } from "./gemini";
import {
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
 * opencode (plan.md 16.3). Unlike the other tools it keeps every session in one SQLite file,
 *   ~/.local/share/opencode/opencode.db
 * with a `session` row (folder, title, model), `message` rows (role, time, tokens as JSON) and
 * `part` rows (text, reasoning, tool calls with their state, step markers). Parts are updated in
 * place while a tool runs, so a session is read again from scratch whenever it changed, like
 * Gemini's files. Checked against opencode 1.18.34; the format is still moving, so every field
 * is optional here and the database is only ever opened read-only.
 */

const DATA_HOME = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
const OPENCODE_DB = process.env.OPENCODE_DB ?? join(DATA_HOME, "opencode", "opencode.db");

type Json = Record<string, unknown>;

function withDb<T>(path: string, fallback: T, read: (db: Database) => T): T {
  if (!existsSync(path)) return fallback;
  let db: Database | undefined;
  try {
    db = new Database(path, { readonly: true });
    return read(db);
  } catch {
    // Locked mid-migration or an older layout: try again on the next scan.
    return fallback;
  } finally {
    db?.close();
  }
}

/**
 * One entry per top-level session. Sub-agent sessions (parent_id) are left out: they belong to
 * the session that started them. `size` and `mtime` change whenever a part is added or updated.
 */
function listSessions(path: string): SessionFile[] {
  return withDb(path, [], (db) =>
    (
      db
        .query(
          `SELECT s.id AS id, s.time_updated AS updated,
                  (SELECT COUNT(*) FROM part p WHERE p.session_id = s.id) AS parts,
                  (SELECT MAX(p.time_updated) FROM part p WHERE p.session_id = s.id) AS partUpdated
             FROM session s WHERE s.parent_id IS NULL`,
        )
        .all() as { id: string; updated: number; parts: number; partUpdated: number | null }[]
    ).map((row) => ({
      path: `${path}#${row.id}`,
      sessionId: `opencode-${row.id}`,
      size: row.parts,
      mtime: Math.max(row.updated, row.partUpdated ?? 0),
    })),
  );
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** The session, its messages and their parts as one JSON text, for parseOpencodeSession. */
function readSession(path: string, sessionId: string): string {
  const id = sessionId.replace(/^opencode-/, "");
  return withDb(path, "{}", (db) => {
    const session = db
      .query("SELECT id, directory, title, time_created, time_updated FROM session WHERE id = ?")
      .get(id);
    const parts = db
      .query("SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY time_created, id")
      .all(id) as { id: string; message_id: string; data: string }[];
    const messages = (
      db.query("SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(id) as {
        id: string;
        time_created: number;
        data: string;
      }[]
    ).map((m) => ({
      id: m.id,
      created: m.time_created,
      info: parse(m.data),
      parts: parts.filter((p) => p.message_id === m.id).map((p) => ({ id: p.id, ...(parse(p.data) as Json) })),
    }));
    return JSON.stringify({ session, messages });
  });
}

const num = (value: unknown) => (typeof value === "number" ? value : 0);
const iso = (ms: unknown) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : undefined);

function noteUsage(state: SessionState, ts: number, model: string | undefined, tokens: Json | undefined): void {
  if (!tokens) return;
  const cache = (tokens.cache as Json | undefined) ?? {};
  // opencode counts reasoning apart from output; Igrek's output includes it, as for pi.
  const usage = {
    input: num(tokens.input),
    output: num(tokens.output) + num(tokens.reasoning),
    cacheRead: num(cache.read),
    cacheWrite: num(cache.write),
  };
  state.tokensIn += usage.input;
  state.tokensOut += usage.output;
  state.tokensCacheRead += usage.cacheRead;
  state.tokensCacheWrite += usage.cacheWrite;
  if (usage.input + usage.cacheRead + usage.cacheWrite > 0)
    state.contextTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  state.usageEvents ??= [];
  state.usageEvents.push({ ts, model, ...usage });
}

const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit"]);

/** Files the tool changed and packages its command installed; returns the line shown for the call. */
function noteToolInput(state: SessionState, name: string, input: Json): string {
  const file = typeof input.filePath === "string" ? input.filePath : undefined;
  if (file && EDIT_TOOLS.has(name)) noteFile(state, file.startsWith("/") || !state.cwd ? file : join(state.cwd, file));
  const command = typeof input.command === "string" ? input.command : "";
  if (command) notePackages(state, command);
  return command ? `${name}: ${command}` : `${name}: ${JSON.stringify(input)}`;
}

function toolPart(state: SessionState, part: Json, id: string, ts: number): ParsedMessage[] {
  const name = typeof part.tool === "string" ? part.tool : "tool";
  const run = (part.state as Json | undefined) ?? {};
  state.toolCalls++;
  const label = noteToolInput(state, name, (run.input as Json | undefined) ?? {});
  const out: ParsedMessage[] = [{ id, ts, role: "assistant", kind: "tool", toolName: name, text: clip(label, 300) }];
  // A tool still running has no result yet; it is counted once it finished.
  if (run.status === "completed" || run.status === "error") {
    const output = typeof run.error === "string" ? run.error : typeof run.output === "string" ? run.output : "";
    const failure = noteToolResult(state, ts, `${id}:r`, run.status === "error", name, output);
    if (failure) out.push(failure);
  }
  return out;
}

function assistantMessage(state: SessionState, info: Json, parts: Json[], ts: number): ParsedMessage[] {
  state.assistantMessages++;
  const model = typeof info.modelID === "string" ? info.modelID : undefined;
  if (model) state.models[model] = (state.models[model] ?? 0) + 1;
  noteUsage(state, ts, model, info.tokens as Json | undefined);
  const out: ParsedMessage[] = [];
  parts.forEach((part, i) => {
    const id = typeof part.id === "string" ? part.id : `${ts}:${i}`;
    if (part.type === "compaction") state.compactions++;
    if (part.type === "tool") out.push(...toolPart(state, part, id, ts));
    if (part.type !== "text" || part.synthetic === true || typeof part.text !== "string") return;
    const text = clip(part.text.trim());
    if (!text) return;
    checkClaim(state, ts, text);
    out.push({ id, ts, role: "assistant", kind: "text", text });
  });
  const error = info.error as Json | undefined;
  if (error) {
    const data = (error.data as Json | undefined) ?? {};
    const text = typeof data.message === "string" ? data.message : String(error.name ?? "Error");
    out.push({ id: `${ts}:e`, ts, role: "user", kind: "error", text: clip(text, 600) });
  }
  return out;
}

function userMessage(state: SessionState, parts: Json[], id: string, ts: number): ParsedMessage[] {
  // Synthetic parts are what opencode adds itself (file contents, reminders), not what was typed.
  const text = parts
    .filter((p) => p.type === "text" && p.synthetic !== true && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();
  if (parts.some((p) => p.type === "compaction")) state.compactions++;
  if (!text) return [];
  state.userMessages++;
  state.firstPrompt ??= clip(text, 500);
  return [{ id, ts, role: "user", kind: "prompt", text: clip(text) }];
}

export function parseOpencodeSession(state: SessionState, text: string): ParsedMessage[] {
  const data = parse(text) as {
    session?: Json;
    messages?: { id?: string; created?: number; info?: Json; parts?: Json[] }[];
  };
  const session = data.session ?? {};
  if (typeof session.directory === "string") state.cwd = session.directory;
  if (typeof session.title === "string" && session.title) state.title = clip(session.title, 80);
  touch(state, iso(session.time_created));
  touch(state, iso(session.time_updated));
  const out: ParsedMessage[] = [];
  for (const m of data.messages ?? []) {
    const info = m.info ?? {};
    const time = (info.time as Json | undefined) ?? {};
    const ts = touch(state, iso(time.created ?? m.created));
    const id = typeof m.id === "string" ? m.id : `${ts}`;
    const parts = m.parts ?? [];
    state.lastMessageId = id;
    if (info.role === "user") out.push(...userMessage(state, parts, id, ts));
    if (info.role === "assistant") out.push(...assistantMessage(state, info, parts, ts));
  }
  return out;
}

export function opencodeAdapter(path = OPENCODE_DB): WholeFileAdapter {
  return {
    tool: "opencode",
    listFiles: () => listSessions(path),
    applyLine: () => [],
    readFile: (file) => readSession(path, file.sessionId),
    parseFile: (state, text) => parseOpencodeSession(state, text),
  };
}
