import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type {
  AiTool,
  CommitItem,
  Digest,
  MemoryItem,
  MemorySection,
  PackageCheck,
  ProjectListItem,
  SearchHit,
  SessionDetail,
  SessionListItem,
  SessionSummaryData,
  ShareLevel,
  TimelineEntry,
  TranscriptMessage,
} from "@godeye/core";
import { gitRemote, gitRoot } from "./adapters/git";
import { emptyState, isPackageName, type ParsedMessage, type SessionState } from "./adapters/types";
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
  context_window: number | null;
  unverified_claims: string;
  packages: string;
  last_tool_failed: number;
  account_id: string | null;
  author_name?: string | null;
}

interface ProjectRow {
  id: string;
  account_id?: string | null;
  name: string;
  path: string;
  hidden: number;
  last_activity: number;
  hooks_installed: number;
  workspace?: string | null;
  share?: string | null;
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
    contextWindow: row.context_window ?? undefined,
    unverifiedClaims: JSON.parse(row.unverified_claims),
    packages: JSON.parse(row.packages),
    lastToolFailed: !!row.last_tool_failed,
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
      workspace: row.workspace === "team" ? "team" : "local",
      share: (row.share as ShareLevel | null) ?? "off",
      sessionCount: sessions.length,
      activeSessions: sessions.filter((s) => isActive(s.updated_at ?? 0, now)).length,
      lastActivity: row.last_activity,
      hidden: !!row.hidden,
      hooksInstalled: !!row.hooks_installed,
      accountId: row.account_id ?? undefined,
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
    accountId?: string;
    file: { path: string; offset: number; size: number; mtime: number };
    state: SessionState;
    messages: ParsedMessage[];
  }): string | null {
    const { sessionId, tool, file, state, messages, accountId } = args;
    const usage = state.usageEvents?.splice(0) ?? [];
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
             last_message_id, context_window, unverified_claims, packages, last_tool_failed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             project_id = excluded.project_id, cwd = excluded.cwd, git_branch = excluded.git_branch,
             title = excluded.title, first_prompt = excluded.first_prompt, started_at = excluded.started_at,
             updated_at = excluded.updated_at, user_messages = excluded.user_messages,
             assistant_messages = excluded.assistant_messages, tool_calls = excluded.tool_calls,
             tool_errors = excluded.tool_errors, recent_errors = excluded.recent_errors,
             compactions = excluded.compactions, tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out,
             tokens_cache_read = excluded.tokens_cache_read, tokens_cache_write = excluded.tokens_cache_write,
             context_tokens = excluded.context_tokens, models = excluded.models,
             files_touched = excluded.files_touched, last_message_id = excluded.last_message_id,
             context_window = excluded.context_window, unverified_claims = excluded.unverified_claims,
             packages = excluded.packages, last_tool_failed = excluded.last_tool_failed`,
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
          state.contextWindow ?? null,
          JSON.stringify(state.unverifiedClaims),
          JSON.stringify(state.packages),
          state.lastToolFailed ? 1 : 0,
        );
      for (const m of messages) insertMessage.run(m.id, sessionId, m.ts, m.role, m.kind, m.toolName ?? null, m.text);
      const insertUsage = this.db.query(
        `INSERT INTO usage (session_id, project_id, account_id, ts, model, input, output, cache_read, cache_write)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const u of usage) {
        insertUsage.run(
          sessionId,
          projectId,
          accountId ?? null,
          u.ts,
          u.model ?? null,
          u.input,
          u.output,
          u.cacheRead,
          u.cacheWrite,
        );
      }
      if (accountId) this.db.query("UPDATE sessions SET account_id = ? WHERE id = ?").run(accountId, sessionId);
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
      this.db.query("DELETE FROM usage WHERE session_id = ?").run(sessionId);
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
      contextWindow: row.context_window ?? undefined,
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
      author: row.author_name ?? undefined,
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
      mentionedMissing: mentionedMissing(messages, row.cwd),
      inView: {
        recentFiles: recentFiles(messages),
        memoryInjected: !!(row.project_id && this.projectRow(row.project_id)?.hooks_installed),
      },
      toolErrors: row.tool_errors,
      compactions: row.compactions,
      unverifiedClaims: JSON.parse(row.unverified_claims),
      packages: this.packageStatuses(JSON.parse(row.packages)),
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

  addMemory(
    projectId: string,
    section: MemorySection,
    text: string,
    sourceSession?: string,
    conflict?: { withId: string; reason: string },
  ): boolean {
    const exists = this.db
      .query(
        "SELECT 1 FROM memory_items WHERE project_id = ? AND lower(text) = lower(?) AND status IN ('active', 'conflict')",
      )
      .get(projectId, text);
    if (exists) return false;
    // Only flag a conflict against an item that is still active in this project.
    const other = conflict
      ? this.db
          .query("SELECT id FROM memory_items WHERE id = ? AND project_id = ? AND status = 'active'")
          .get(conflict.withId, projectId)
      : undefined;
    this.db
      .query(
        `INSERT INTO memory_items (id, project_id, section, text, source_session, created_at, status, conflict_with, conflict_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        projectId,
        section,
        text,
        sourceSession ?? null,
        Date.now(),
        other ? "conflict" : "active",
        other ? (conflict?.withId ?? null) : null,
        other ? (conflict?.reason ?? null) : null,
      );
    return true;
  }

  /** User's answer to a memory conflict: keep the new item, the old one, or both. */
  resolveConflict(id: string, keep: "new" | "old" | "both"): void {
    const row = this.db.query("SELECT conflict_with FROM memory_items WHERE id = ?").get(id) as
      | { conflict_with: string | null }
      | undefined;
    if (!row) return;
    this.db.transaction(() => {
      if (keep === "old") {
        this.db
          .query("UPDATE memory_items SET status = 'deleted', updated_at = ?, dirty = 1 WHERE id = ?")
          .run(Date.now(), id);
        return;
      }
      this.db
        .query(
          "UPDATE memory_items SET status = 'active', conflict_with = NULL, conflict_reason = NULL, updated_at = ?, dirty = 1 WHERE id = ?",
        )
        .run(Date.now(), id);
      if (keep === "new" && row.conflict_with) {
        this.db
          .query("UPDATE memory_items SET status = 'deleted', updated_at = ?, dirty = 1 WHERE id = ?")
          .run(Date.now(), row.conflict_with);
      }
    })();
  }

  /** Memory conflicts across all projects, for the inbox. */
  openConflicts(): { projectId: string; projectName: string; count: number }[] {
    return this.db
      .query(
        `SELECT m.project_id AS projectId, p.name AS projectName, COUNT(*) AS count FROM memory_items m
         JOIN projects p ON p.id = m.project_id WHERE m.status = 'conflict' GROUP BY m.project_id`,
      )
      .all() as { projectId: string; projectName: string; count: number }[];
  }

  updateMemory(id: string, text: string): void {
    this.db.query("UPDATE memory_items SET text = ?, updated_at = ?, dirty = 1 WHERE id = ?").run(text, Date.now(), id);
  }

  /** Active memory with ids, so the model can say which old fact a new one contradicts. */
  memoryForPrompt(projectId: string, limit = 40): { id: string; section: string; text: string }[] {
    return this.db
      .query(
        `SELECT id, section, text FROM memory_items WHERE project_id = ? AND status = 'active'
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(projectId, limit) as { id: string; section: string; text: string }[];
  }

  listMemory(projectId: string, includeConflicts = true): MemoryItem[] {
    const statuses = includeConflicts ? "('active', 'conflict')" : "('active')";
    const rows = this.db
      .query(
        `SELECT m.id, m.section, m.text, m.source_session, m.created_at, m.conflict_with, m.conflict_reason,
                m.author_name, o.text AS conflict_text
         FROM memory_items m LEFT JOIN memory_items o ON o.id = m.conflict_with
         WHERE m.project_id = ? AND m.status IN ${statuses} ORDER BY m.created_at DESC`,
      )
      .all(projectId) as {
      id: string;
      section: MemorySection;
      text: string;
      source_session: string | null;
      created_at: number;
      conflict_with: string | null;
      conflict_reason: string | null;
      conflict_text: string | null;
      author_name: string | null;
    }[];
    return rows.map((m) => ({
      id: m.id,
      section: m.section,
      text: m.text,
      sourceSession: m.source_session ?? undefined,
      createdAt: m.created_at,
      author: m.author_name ?? undefined,
      conflict: m.conflict_with
        ? { withId: m.conflict_with, withText: m.conflict_text ?? "", reason: m.conflict_reason ?? "" }
        : undefined,
    }));
  }

  deleteMemory(id: string): void {
    this.db
      .query("UPDATE memory_items SET status = 'deleted', updated_at = ?, dirty = 1 WHERE id = ?")
      .run(Date.now(), id);
  }

  // ---- search ----------------------------------------------------------------

  /**
   * Full-text search. Every word must match first; if that finds little, any word
   * may match, so questions like "when did we build the login page" still work.
   */
  search(query: string, limit = 30): SearchHit[] {
    const words = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}_.-]+/u)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word));
    if (words.length === 0) return [];
    // Quote every word so user input can't use FTS operators by accident.
    const quoted = words.map((word) => `"${word.replace(/"/g, '""')}"*`);
    const hits = this.runSearch(quoted.join(" "), limit);
    if (hits.length >= 3 || words.length === 1) return hits;
    const seen = new Set(hits.map((h) => h.messageId));
    return [...hits, ...this.runSearch(quoted.join(" OR "), limit).filter((h) => !seen.has(h.messageId))].slice(
      0,
      limit,
    );
  }

  private runSearch(match: string, limit: number): SearchHit[] {
    const rows = this.db
      .query(
        `SELECT m.id AS message_id, m.session_id, m.ts, s.project_id, s.title, s.first_prompt, p.name AS project_name,
                snippet(messages_fts, 0, '[[', ']]', '…', 16) AS snippet
         FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid
         JOIN sessions s ON s.id = m.session_id LEFT JOIN projects p ON p.id = s.project_id
         WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(match, limit) as {
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

  // ---- commits & timeline ----------------------------------------------------

  saveCommits(projectId: string, commits: CommitItem[]): number {
    const insert = this.db.query(
      "INSERT OR IGNORE INTO commits (project_id, hash, author, subject, at, files) VALUES (?, ?, ?, ?, ?, ?)",
    );
    let added = 0;
    this.db.transaction(() => {
      for (const c of commits) added += insert.run(projectId, c.hash, c.author, c.subject, c.at, c.files).changes;
    })();
    return added;
  }

  latestCommitAt(projectId: string): number {
    const row = this.db.query("SELECT MAX(at) AS at FROM commits WHERE project_id = ?").get(projectId) as {
      at: number | null;
    };
    return row.at ?? 0;
  }

  commitsBetween(projectId: string, from: number, to: number): CommitItem[] {
    return this.db
      .query(
        "SELECT hash, author, subject, at, files FROM commits WHERE project_id = ? AND at >= ? AND at < ? ORDER BY at DESC",
      )
      .all(projectId, from, to) as CommitItem[];
  }

  /** Sessions and commits interleaved, newest first (plan.md 1.5 timeline). */
  timeline(projectId: string, limit = 120): TimelineEntry[] {
    const sessions = this.listSessions(projectId, limit).map(
      (session): TimelineEntry => ({ kind: "session", at: session.updatedAt, session }),
    );
    const commits = (
      this.db
        .query("SELECT hash, author, subject, at, files FROM commits WHERE project_id = ? ORDER BY at DESC LIMIT ?")
        .all(projectId, limit) as CommitItem[]
    ).map((commit): TimelineEntry => ({ kind: "commit", at: commit.at, commit }));
    return [...sessions, ...commits].sort((a, b) => b.at - a.at).slice(0, limit);
  }

  sessionsBetween(projectId: string, from: number, to: number): SessionListItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM sessions WHERE project_id = ? AND updated_at >= ? AND started_at < ? ORDER BY updated_at DESC",
      )
      .all(projectId, from, to) as SessionRow[];
    return rows.map((row) => this.sessionItem(row));
  }

  // ---- digests ---------------------------------------------------------------

  saveDigest(projectId: string, digest: Digest): void {
    this.db
      .query(
        `INSERT INTO digests (project_id, period, day, data, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, period, day) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
      )
      .run(projectId, digest.period, digest.day, JSON.stringify(digest), digest.createdAt);
  }

  listDigests(projectId: string, limit = 14): Digest[] {
    return (
      this.db
        .query("SELECT data FROM digests WHERE project_id = ? ORDER BY day DESC, period ASC LIMIT ?")
        .all(projectId, limit) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Digest);
  }

  hasDigest(projectId: string, period: string, day: string): boolean {
    return !!this.db
      .query("SELECT 1 FROM digests WHERE project_id = ? AND period = ? AND day = ?")
      .get(projectId, period, day);
  }

  // ---- packages (hallucination check) ------------------------------------------

  private packageStatuses(packages: { manager: "npm" | "pip"; name: string }[]): PackageCheck[] {
    const lookup = this.db.query("SELECT status, detail FROM package_checks WHERE manager = ? AND name = ?");
    return packages
      .filter((p) => isPackageName(p.manager, p.name))
      .map((p) => {
        const row = lookup.get(p.manager, p.name) as
          | { status: PackageCheck["status"]; detail: string | null }
          | undefined;
        return { ...p, status: row?.status ?? "unknown", detail: row?.detail ?? undefined };
      });
  }

  /** Packages seen in sessions that were never checked (or checked over a week ago). */
  uncheckedPackages(limit = 20): { manager: "npm" | "pip"; name: string }[] {
    const seen = new Map<string, { manager: "npm" | "pip"; name: string }>();
    const rows = this.db
      .query("SELECT packages FROM sessions WHERE packages != '[]' ORDER BY updated_at DESC LIMIT 200")
      .all() as { packages: string }[];
    for (const row of rows) {
      for (const p of JSON.parse(row.packages) as { manager: "npm" | "pip"; name: string }[]) {
        if (isPackageName(p.manager, p.name)) seen.set(`${p.manager}:${p.name}`, p);
      }
    }
    // Clear answers are kept a week; "unknown" (registry didn't answer) is retried after an hour.
    const fresh = this.db.query(
      "SELECT 1 FROM package_checks WHERE manager = ? AND name = ? AND checked_at > CASE status WHEN 'unknown' THEN ? ELSE ? END",
    );
    const now = Date.now();
    return [...seen.values()]
      .filter((p) => !fresh.get(p.manager, p.name, now - 60 * 60_000, now - 7 * 24 * 60 * 60_000))
      .slice(0, limit);
  }

  savePackageCheck(check: PackageCheck): void {
    this.db
      .query(
        `INSERT INTO package_checks (manager, name, status, detail, checked_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(manager, name) DO UPDATE SET status = excluded.status, detail = excluded.detail,
           checked_at = excluded.checked_at`,
      )
      .run(check.manager, check.name, check.status, check.detail ?? null, Date.now());
  }

  // ---- manual project management -----------------------------------------------

  /** Adds a folder by hand (it doesn't need any AI sessions yet). */
  addProject(path: string): string {
    this.projectIdCache.delete(path);
    return this.resolveProject(path);
  }

  renameProject(id: string, name: string): void {
    this.db.query("UPDATE projects SET name = ? WHERE id = ?").run(name, id);
  }

  allProjectRows(): ProjectRow[] {
    return this.db.query("SELECT * FROM projects").all() as ProjectRow[];
  }

  counts(): { sessions: number; projects: number } {
    const s = this.db.query("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
    const p = this.db.query("SELECT COUNT(*) AS n FROM projects").get() as { n: number };
    return { sessions: s.n, projects: p.n };
  }

  projectForCwd(cwd: string): string | undefined {
    if (!cwd.startsWith("/")) return undefined;
    try {
      return this.resolveProject(cwd);
    } catch {
      return undefined;
    }
  }
}

/** Words too common to search on (English and Turkish). */
const STOPWORDS = new Set(
  (
    "the a an and or of to in on at for with by is are was were be been it this that what when where which who how did do does we you i me my our " +
    "ve ile bir bu şu o ne ne zaman nerede nasıl hangi kim mi mı mu mü de da ki için gibi olan biz ben sen siz yaptık yapmıştık"
  ).split(" "),
);

/** Paths like `src/app.ts` that the AI wrote in backticks in its replies. */
const MENTIONED_PATH = /`((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+\.[a-z0-9]{1,6})`/gi;

/**
 * File paths the AI talked about that don't exist (plan.md 1.9). A cheap signal
 * of invented files; paths that existed once and were deleted also show up.
 */
function mentionedMissing(messages: TranscriptMessage[], cwd: string | null): string[] {
  if (!cwd || !existsSync(cwd)) return [];
  const found = new Set<string>();
  for (const m of messages) {
    if (m.kind !== "text" || m.role !== "assistant") continue;
    for (const match of m.text.matchAll(MENTIONED_PATH)) {
      const path = match[1] ?? "";
      if (path.includes("://") || path.startsWith("node_modules/")) continue;
      const full = isAbsolute(path) ? path : join(cwd, path);
      if (!existsSync(full)) found.add(path);
      if (found.size >= 15) return [...found];
    }
  }
  return [...found];
}

/** Files the AI read or edited in its latest steps: roughly what it has in view. */
function recentFiles(messages: TranscriptMessage[]): string[] {
  const files: string[] = [];
  for (let i = messages.length - 1; i >= 0 && files.length < 12; i--) {
    const m = messages[i];
    if (
      m?.kind !== "tool" ||
      !m.toolName ||
      !["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(m.toolName)
    )
      continue;
    const path = m.text.slice(m.text.indexOf(":") + 1).trim();
    if (path.startsWith("/") && !files.includes(path)) files.push(path);
  }
  return files;
}
