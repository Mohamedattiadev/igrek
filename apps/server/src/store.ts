import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type {
  AiTool,
  MemoryItem,
  MemorySection,
  ProjectListItem,
  SearchHit,
  SessionDetail,
  SessionListItem,
  SessionSummaryData,
  TranscriptMessage,
} from "@godeye/core";
import { emptyState, type ParsedMessage, type SessionState } from "./adapters/claude";
import { gitRemote, gitRoot } from "./adapters/git";
import { isActive, sessionHealth } from "./health";

interface SessionRow {
  id: string;
  project_id: string | null;
  tool: AiTool;
  cwd: string | null;
  git_branch: string | null;
  title: string | null;
  first_prompt: string | null;
  started_at: number | null;
  updated_at: number | null;
  user_messages: number;
  assistant_messages: number;
  tool_calls: number;
  tool_errors: number;
  recent_errors: string;
  compactions: number;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  context_tokens: number;
  models: string;
  files_touched: string;
  summary: string | null;
  summary_at: number | null;
  summary_messages: number;
  last_message_id: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  hidden: number;
  last_activity: number;
  hooks_installed: number;
}

function rowToState(row: SessionRow): SessionState {
  return {
    cwd: row.cwd ?? undefined,
    gitBranch: row.git_branch ?? undefined,
    title: row.title ?? undefined,
    firstPrompt: row.first_prompt ?? undefined,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    userMessages: row.user_messages,
    assistantMessages: row.assistant_messages,
    toolCalls: row.tool_calls,
    toolErrors: row.tool_errors,
    recentErrors: JSON.parse(row.recent_errors),
    compactions: row.compactions,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    tokensCacheRead: row.tokens_cache_read,
    tokensCacheWrite: row.tokens_cache_write,
    contextTokens: row.context_tokens,
    models: JSON.parse(row.models),
    filesTouched: JSON.parse(row.files_touched),
    lastMessageId: row.last_message_id ?? undefined,
  };
}

function fallbackTitle(row: Pick<SessionRow, "title" | "first_prompt">): string {
  if (row.title) return row.title;
  const prompt = row.first_prompt?.replace(/\s+/g, " ").trim();
  if (!prompt) return "Untitled session";
  return prompt.length > 80 ? `${prompt.slice(0, 80)}…` : prompt;
}

export class Store {
  constructor(private readonly db: Database) {}

  // ---- source files (incremental parsing) ------------------------------------

  fileOffset(path: string): { offset: number; size: number; mtime: number } | undefined {
    return this.db.query("SELECT offset, size, mtime FROM source_files WHERE path = ?").get(path) as
      | { offset: number; size: number; mtime: number }
      | undefined;
  }

  // ---- projects --------------------------------------------------------------

  private projectIdCache = new Map<string, string>();

  /** Maps a session's working folder to its project (repo root when inside git). */
  resolveProject(cwd: string): string {
    const cached = this.projectIdCache.get(cwd);
    if (cached) return cached;
    const root = existsSync(cwd) ? (gitRoot(cwd) ?? cwd) : cwd;
    const existing = this.db.query("SELECT id FROM projects WHERE path = ?").get(root) as { id: string } | undefined;
    let id = existing?.id;
    if (!id) {
      const remote = existsSync(root) ? gitRemote(root) : undefined;
      const identity = remote ?? `path:${root}`;
      id = createHash("sha1").update(identity).digest("hex").slice(0, 12);
      this.db
        .query(
          `INSERT INTO projects (id, name, path, git_remote, identity, workspace, created_at)
           VALUES (?, ?, ?, ?, ?, 'local', ?) ON CONFLICT(id) DO NOTHING`,
        )
        .run(id, basename(root) || root, root, remote ?? null, identity, Date.now());
    }
    this.projectIdCache.set(cwd, id);
    return id;
  }

  setProjectHidden(id: string, hidden: boolean): void {
    this.db.query("UPDATE projects SET hidden = ? WHERE id = ?").run(hidden ? 1 : 0, id);
  }

  setHooksInstalled(id: string, installed: boolean): void {
    this.db.query("UPDATE projects SET hooks_installed = ? WHERE id = ?").run(installed ? 1 : 0, id);
  }

  projectRow(id: string): ProjectRow | undefined {
    return this.db.query("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
  }

  listProjects(): ProjectListItem[] {
    const rows = this.db.query("SELECT * FROM projects ORDER BY last_activity DESC").all() as ProjectRow[];
    return rows.map((row) => this.projectItem(row));
  }

  projectItem(row: ProjectRow): ProjectListItem {
    const sessions = this.db
      .query("SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC")
      .all(row.id) as SessionRow[];
    const now = Date.now();
    const recent = sessions.filter((s) => now - (s.updated_at ?? 0) < 24 * 60 * 60_000).map((s) => this.health(s));
    const worst = recent.sort((a, b) => a.score - b.score)[0];
    const lastSummary = sessions.find((s) => s.summary)?.summary;
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      workspace: "local",
      sessionCount: sessions.length,
      activeSessions: sessions.filter((s) => isActive(s.updated_at ?? 0, now)).length,
      lastActivity: row.last_activity,
      hidden: !!row.hidden,
      hooksInstalled: !!row.hooks_installed,
      tools: [...new Set(sessions.map((s) => s.tool))],
      health: worst,
      lastSummary: lastSummary ? (JSON.parse(lastSummary) as SessionSummaryData) : undefined,
    };
  }

  // ---- sessions --------------------------------------------------------------

  loadState(sessionId: string): SessionState {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(sessionId) as SessionRow | undefined;
    return row ? rowToState(row) : emptyState();
  }

  /** Persists one parsing step atomically: messages, totals and the new file offset. */
  saveChunk(args: {
    sessionId: string;
    tool: AiTool;
    file: { path: string; offset: number; size: number; mtime: number };
    state: SessionState;
    messages: ParsedMessage[];
  }): string | null {
    const { sessionId, tool, file, state, messages } = args;
    const projectId = state.cwd ? this.resolveProject(state.cwd) : null;
    const insertMessage = this.db.query(
      `INSERT OR IGNORE INTO messages (id, session_id, ts, role, kind, tool_name, text) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO sessions (id, project_id, tool, cwd, git_branch, title, first_prompt, started_at, updated_at,
             user_messages, assistant_messages, tool_calls, tool_errors, recent_errors, compactions,
             tokens_in, tokens_out, tokens_cache_read, tokens_cache_write, context_tokens, models, files_touched,
             last_message_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = excluded.project_id, cwd = excluded.cwd, git_branch = excluded.git_branch,
             title = excluded.title, first_prompt = excluded.first_prompt, started_at = excluded.started_at,
             updated_at = excluded.updated_at, user_messages = excluded.user_messages,
             assistant_messages = excluded.assistant_messages, tool_calls = excluded.tool_calls,
             tool_errors = excluded.tool_errors, recent_errors = excluded.recent_errors,
             compactions = excluded.compactions, tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out,
             tokens_cache_read = excluded.tokens_cache_read, tokens_cache_write = excluded.tokens_cache_write,
             context_tokens = excluded.context_tokens, models = excluded.models,
             files_touched = excluded.files_touched, last_message_id = excluded.last_message_id`,
        )
        .run(
          sessionId,
          projectId,
          tool,
          state.cwd ?? null,
          state.gitBranch ?? null,
          state.title ?? null,
          state.firstPrompt ?? null,
          state.startedAt ?? null,
          state.updatedAt ?? null,
          state.userMessages,
          state.assistantMessages,
          state.toolCalls,
          state.toolErrors,
          JSON.stringify(state.recentErrors),
          state.compactions,
          state.tokensIn,
          state.tokensOut,
          state.tokensCacheRead,
          state.tokensCacheWrite,
          state.contextTokens,
          JSON.stringify(state.models),
          JSON.stringify(state.filesTouched),
          state.lastMessageId ?? null,
        );
      for (const m of messages) insertMessage.run(m.id, sessionId, m.ts, m.role, m.kind, m.toolName ?? null, m.text);
      this.db
        .query(
          `INSERT INTO source_files (path, session_id, offset, size, mtime) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET offset = excluded.offset, size = excluded.size, mtime = excluded.mtime`,
        )
        .run(file.path, sessionId, file.offset, file.size, file.mtime);
      if (projectId && state.updatedAt) {
        this.db
          .query("UPDATE projects SET last_activity = MAX(last_activity, ?) WHERE id = ?")
          .run(state.updatedAt, projectId);
      }
    })();
    return projectId;
  }

  /** Forgets a transcript so it is parsed again from the start (file was rewritten). */
  resetSession(sessionId: string, path: string): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM messages WHERE session_id = ?").run(sessionId);
      this.db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
      this.db.query("DELETE FROM source_files WHERE path = ?").run(path);
    })();
  }

  private health(row: SessionRow) {
    return sessionHealth({
      contextTokens: row.context_tokens,
      models: JSON.parse(row.models),
      userMessages: row.user_messages,
      recentErrors: JSON.parse(row.recent_errors),
      compactions: row.compactions,
      updatedAt: row.updated_at ?? 0,
    });
  }

  private sessionItem(row: SessionRow): SessionListItem {
    return {
      id: row.id,
      projectId: row.project_id,
      tool: row.tool,
      title: fallbackTitle(row),
      startedAt: row.started_at ?? 0,
      updatedAt: row.updated_at ?? 0,
      userMessages: row.user_messages,
      toolCalls: row.tool_calls,
      gitBranch: row.git_branch ?? undefined,
      active: isActive(row.updated_at ?? 0),
      health: this.health(row),
      summary: row.summary ? JSON.parse(row.summary) : undefined,
      models: JSON.parse(row.models),
      tokens: {
        input: row.tokens_in,
        output: row.tokens_out,
        cacheRead: row.tokens_cache_read,
        cacheWrite: row.tokens_cache_write,
      },
    };
  }

  listSessions(projectId: string, limit = 200): SessionListItem[] {
    const rows = this.db
      .query("SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?")
      .all(projectId, limit) as SessionRow[];
    return rows.map((row) => this.sessionItem(row));
  }

  sessionRow(id: string): SessionRow | undefined {
    return this.db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  }

  sessionDetail(id: string, messageLimit = 400): SessionDetail | undefined {
    const row = this.sessionRow(id);
    if (!row) return undefined;
    const messages = (
      this.db
        .query(
          `SELECT * FROM (SELECT id, ts, role, kind, tool_name, text FROM messages WHERE session_id = ?
           ORDER BY ts DESC, rowid DESC LIMIT ?) ORDER BY ts ASC`,
        )
        .all(id, messageLimit) as {
        id: string;
        ts: number;
        role: "user" | "assistant";
        kind: TranscriptMessage["kind"];
        tool_name: string | null;
        text: string;
      }[]
    ).map((m) => ({
      id: m.id,
      ts: m.ts,
      role: m.role,
      kind: m.kind,
      toolName: m.tool_name ?? undefined,
      text: m.text,
    }));
    const filesTouched: string[] = JSON.parse(row.files_touched);
    return {
      ...this.sessionItem(row),
      cwd: row.cwd ?? undefined,
      firstPrompt: row.first_prompt ?? undefined,
      filesTouched,
      missingFiles: filesTouched.filter((file) => !existsSync(file)),
      toolErrors: row.tool_errors,
      compactions: row.compactions,
      messages,
    };
  }

  /** Condensed transcript for summarizing: every prompt and reply, newest kept when trimming. */
  transcriptForSummary(id: string, maxChars = 16_000): string {
    const rows = this.db
      .query("SELECT role, kind, text FROM messages WHERE session_id = ? AND kind != 'tool' ORDER BY ts ASC, rowid ASC")
      .all(id) as { role: string; kind: string; text: string }[];
    const lines = rows.map((r) => `${r.role === "user" ? "USER" : "AI"}: ${r.text.slice(0, 1500)}`);
    const first = lines[0] ?? "";
    let body = "";
    for (let i = lines.length - 1; i > 0; i--) {
      const next = `${lines[i]}\n\n${body}`;
      if (next.length + first.length > maxChars) break;
      body = next;
    }
    return `${first}\n\n${body}`.trim();
  }

  saveSummary(id: string, summary: SessionSummaryData, atMessages: number): void {
    this.db
      .query("UPDATE sessions SET summary = ?, summary_at = ?, summary_messages = ? WHERE id = ?")
      .run(JSON.stringify(summary), summary.generatedAt, atMessages, id);
  }

  /** Sessions idle for a while whose summary is missing or stale. */
  sessionsNeedingSummary(now = Date.now()): string[] {
    const rows = this.db
      .query(
        `SELECT id FROM sessions WHERE project_id IS NOT NULL AND user_messages >= 2
           AND updated_at < ? AND updated_at > ?
           AND (summary IS NULL OR user_messages - summary_messages >= 5)
         ORDER BY updated_at DESC LIMIT 20`,
      )
      .all(now - 5 * 60_000, now - 7 * 24 * 60 * 60_000) as { id: string }[];
    return rows.map((r) => r.id);
  }

  // ---- memory ----------------------------------------------------------------

  addMemory(projectId: string, section: MemorySection, text: string, sourceSession?: string): boolean {
    const exists = this.db
      .query("SELECT 1 FROM memory_items WHERE project_id = ? AND lower(text) = lower(?) AND status = 'active'")
      .get(projectId, text);
    if (exists) return false;
    this.db
      .query(
        `INSERT INTO memory_items (id, project_id, section, text, source_session, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), projectId, section, text, sourceSession ?? null, Date.now());
    return true;
  }

  listMemory(projectId: string): MemoryItem[] {
    return (
      this.db
        .query(
          `SELECT id, section, text, source_session, created_at FROM memory_items
           WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC`,
        )
        .all(projectId) as {
        id: string;
        section: MemorySection;
        text: string;
        source_session: string | null;
        created_at: number;
      }[]
    ).map((m) => ({
      id: m.id,
      section: m.section,
      text: m.text,
      sourceSession: m.source_session ?? undefined,
      createdAt: m.created_at,
    }));
  }

  deleteMemory(id: string): void {
    this.db.query("UPDATE memory_items SET status = 'deleted' WHERE id = ?").run(id);
  }

  // ---- search ----------------------------------------------------------------

  search(query: string, limit = 30): SearchHit[] {
    // Quote every word so user input can't use FTS operators by accident.
    const terms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => `"${word.replace(/"/g, '""')}"*`)
      .join(" ");
    if (!terms) return [];
    const rows = this.db
      .query(
        `SELECT m.id AS message_id, m.session_id, m.ts, s.project_id, s.title, s.first_prompt, p.name AS project_name,
                snippet(messages_fts, 0, '[[', ']]', '…', 16) AS snippet
         FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid
         JOIN sessions s ON s.id = m.session_id LEFT JOIN projects p ON p.id = s.project_id
         WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(terms, limit) as {
      message_id: string;
      session_id: string;
      ts: number;
      project_id: string | null;
      title: string | null;
      first_prompt: string | null;
      project_name: string | null;
      snippet: string;
    }[];
    return rows.map((r) => ({
      sessionId: r.session_id,
      projectId: r.project_id,
      projectName: r.project_name ?? undefined,
      sessionTitle: fallbackTitle(r),
      messageId: r.message_id,
      snippet: r.snippet,
      ts: r.ts,
    }));
  }

  counts(): { sessions: number; projects: number } {
    const s = this.db.query("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    const p = this.db.query("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
    return { sessions: s.n, projects: p.n };
  }

  projectForCwd(cwd: string): string | undefined {
    try {
      return this.resolveProject(cwd);
    } catch {
      return undefined;
    }
  }
}
