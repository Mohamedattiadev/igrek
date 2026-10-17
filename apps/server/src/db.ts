import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SERVER_MIGRATION } from "./servers";

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Ordered schema migrations. Each entry runs once; the index is stored in
 * PRAGMA user_version. Never edit an entry after it ships — append a new one.
 */
const migrations: string[] = [
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE projects (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     path TEXT NOT NULL UNIQUE,
     git_remote TEXT,
     workspace TEXT NOT NULL DEFAULT 'local',
     created_at INTEGER NOT NULL
   );`,
  // Faz 1: sessions, messages, full-text search and project memory.
  `ALTER TABLE projects ADD COLUMN identity TEXT;
   ALTER TABLE projects ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE projects ADD COLUMN last_activity INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE projects ADD COLUMN hooks_installed INTEGER NOT NULL DEFAULT 0;

   CREATE TABLE source_files (
     path TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     offset INTEGER NOT NULL DEFAULT 0,
     size INTEGER NOT NULL DEFAULT 0,
     mtime INTEGER NOT NULL DEFAULT 0
   );

   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
     tool TEXT NOT NULL,
     cwd TEXT,
     git_branch TEXT,
     title TEXT,
     first_prompt TEXT,
     started_at INTEGER,
     updated_at INTEGER,
     user_messages INTEGER NOT NULL DEFAULT 0,
     assistant_messages INTEGER NOT NULL DEFAULT 0,
     tool_calls INTEGER NOT NULL DEFAULT 0,
     tool_errors INTEGER NOT NULL DEFAULT 0,
     recent_errors TEXT NOT NULL DEFAULT '[]',
     compactions INTEGER NOT NULL DEFAULT 0,
     tokens_in INTEGER NOT NULL DEFAULT 0,
     tokens_out INTEGER NOT NULL DEFAULT 0,
     tokens_cache_read INTEGER NOT NULL DEFAULT 0,
     tokens_cache_write INTEGER NOT NULL DEFAULT 0,
     context_tokens INTEGER NOT NULL DEFAULT 0,
     models TEXT NOT NULL DEFAULT '{}',
     files_touched TEXT NOT NULL DEFAULT '[]',
     summary TEXT,
     summary_at INTEGER,
     summary_messages INTEGER NOT NULL DEFAULT 0,
     last_message_id TEXT
   );
   CREATE INDEX sessions_project ON sessions(project_id, updated_at DESC);

   CREATE TABLE messages (
     id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     ts INTEGER,
     role TEXT NOT NULL,
     kind TEXT NOT NULL,
     tool_name TEXT,
     text TEXT NOT NULL
   );
   CREATE INDEX messages_session ON messages(session_id, ts);

   CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='rowid');
   CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
     INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
   END;
   CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
     INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
   END;

   CREATE TABLE memory_items (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     section TEXT NOT NULL,
     text TEXT NOT NULL,
     source_session TEXT,
     created_at INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'active'
   );
   CREATE INDEX memory_project ON memory_items(project_id, section);`,
  // Faz 1 part 2: Codex, hallucination checks, commits, digests, memory conflicts.
  `ALTER TABLE sessions ADD COLUMN context_window INTEGER;
   ALTER TABLE sessions ADD COLUMN unverified_claims TEXT NOT NULL DEFAULT '[]';
   ALTER TABLE sessions ADD COLUMN packages TEXT NOT NULL DEFAULT '[]';
   ALTER TABLE sessions ADD COLUMN last_tool_failed INTEGER NOT NULL DEFAULT 0;

   CREATE TABLE commits (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     hash TEXT NOT NULL,
     author TEXT NOT NULL,
     subject TEXT NOT NULL,
     at INTEGER NOT NULL,
     files INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (project_id, hash)
   );
   CREATE INDEX commits_project ON commits(project_id, at DESC);

   CREATE TABLE digests (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     period TEXT NOT NULL,
     day TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (project_id, period, day)
   );

   ALTER TABLE memory_items ADD COLUMN conflict_with TEXT;
   ALTER TABLE memory_items ADD COLUMN conflict_reason TEXT;
   ALTER TABLE memory_items ADD COLUMN updated_at INTEGER;

   CREATE TABLE package_checks (
     manager TEXT NOT NULL,
     name TEXT NOT NULL,
     status TEXT NOT NULL,
     detail TEXT,
     checked_at INTEGER NOT NULL,
     PRIMARY KEY (manager, name)
   );`,
  // Faz 2: idea box and prompt library.
  `CREATE TABLE ideas (
     id TEXT PRIMARY KEY,
     text TEXT NOT NULL,
     project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
     status TEXT NOT NULL DEFAULT 'new',
     triage TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE prompts (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     tags TEXT NOT NULL DEFAULT '[]',
     uses INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // Faz 2.5: servers over SSH and their audit log.
  SERVER_MIGRATION,
  // Faz 3: accounts, per-message usage and limit snapshots. Transcripts are re-read once
  // (summaries, memory and commits are kept) so past usage lands in the new table.
  `CREATE TABLE accounts (
     id TEXT PRIMARY KEY,
     provider TEXT NOT NULL,
     label TEXT NOT NULL,
     config_dir TEXT,
     email TEXT,
     plan TEXT,
     logged_in INTEGER NOT NULL DEFAULT 0,
     active INTEGER NOT NULL DEFAULT 0,
     checked_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE usage (
     session_id TEXT NOT NULL,
     project_id TEXT,
     account_id TEXT,
     ts INTEGER NOT NULL,
     model TEXT,
     input INTEGER NOT NULL,
     output INTEGER NOT NULL,
     cache_read INTEGER NOT NULL,
     cache_write INTEGER NOT NULL
   );
   CREATE INDEX usage_ts ON usage(ts);
   CREATE INDEX usage_session ON usage(session_id);
   CREATE TABLE rate_limits (
     account_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     five_hour REAL,
     five_hour_resets INTEGER,
     week REAL,
     week_resets INTEGER
   );
   CREATE INDEX rate_limits_account ON rate_limits(account_id, at);
   ALTER TABLE sessions ADD COLUMN account_id TEXT;
   ALTER TABLE projects ADD COLUMN account_id TEXT;
   DELETE FROM messages;
   DELETE FROM source_files;
   UPDATE sessions SET user_messages = 0, assistant_messages = 0, tool_calls = 0, tool_errors = 0,
     recent_errors = '[]', compactions = 0, tokens_in = 0, tokens_out = 0, tokens_cache_read = 0,
     tokens_cache_write = 0, context_tokens = 0, models = '{}', files_touched = '[]', last_message_id = NULL,
     unverified_claims = '[]', packages = '[]', last_tool_failed = 0, first_prompt = NULL;`,
  // Faz 4: team sync. Rows that came from teammates carry their author; own rows have none.
  `ALTER TABLE projects ADD COLUMN share TEXT NOT NULL DEFAULT 'off';
   ALTER TABLE sessions ADD COLUMN author_id TEXT;
   ALTER TABLE sessions ADD COLUMN author_name TEXT;
   ALTER TABLE memory_items ADD COLUMN author_id TEXT;
   ALTER TABLE memory_items ADD COLUMN author_name TEXT;
   ALTER TABLE memory_items ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE sync_cursors (
     scope TEXT NOT NULL,
     key TEXT NOT NULL,
     value INTEGER NOT NULL,
     PRIMARY KEY (scope, key)
   );`,
  // Faz 4.5: prompt enhancer. What was sent (original or enhanced), to learn what works.
  `CREATE TABLE enhancements (
     id TEXT PRIMARY KEY,
     at INTEGER NOT NULL,
     project_id TEXT,
     intent TEXT NOT NULL,
     mode TEXT NOT NULL,
     original TEXT NOT NULL,
     final TEXT,
     choice TEXT NOT NULL DEFAULT 'pending'
   );
   CREATE INDEX enhancements_at ON enhancements(at);`,
  // Faz 5: category pages. Every scan is kept small (scores + findings) so the trend has history.
  `CREATE TABLE insight_scans (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     at INTEGER NOT NULL,
     overall INTEGER NOT NULL,
     scores TEXT NOT NULL,
     data TEXT NOT NULL
   );
   CREATE INDEX insight_scans_project ON insight_scans(project_id, at);
   CREATE TABLE category_texts (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     category TEXT NOT NULL,
     texts TEXT NOT NULL,
     files_hash TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (project_id, category)
   );`,
  // Faz 4.5.4: link what was sent to the session, so outcomes can be compared.
  `ALTER TABLE enhancements ADD COLUMN session_id TEXT;`,
  // Faz 5: the project's own tools (run on request) and per-project scoring choices.
  `CREATE TABLE insight_tools (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     result TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (project_id, kind)
   );
   CREATE TABLE insight_config (
     project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
     data TEXT NOT NULL
   );`,
  // Faz 5.6: a server's .env linked to the project, and who changed which setting (names only, never values).
  `CREATE TABLE project_remote_env (
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     server_id TEXT NOT NULL,
     path TEXT NOT NULL,
     PRIMARY KEY (project_id, server_id, path)
   );
   CREATE TABLE env_changes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     file TEXT NOT NULL,
     key TEXT NOT NULL,
     action TEXT NOT NULL,
     author_id TEXT,
     author_name TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX env_changes_project ON env_changes(project_id, at);`,
  // Faz 1.2b / 1.2c: a project's environments on servers and the deploys made to them.
  `CREATE TABLE project_envs (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     server_id TEXT NOT NULL,
     path TEXT NOT NULL,
     branch TEXT NOT NULL DEFAULT 'main',
     deploy_command TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   );
   CREATE TABLE deploys (
     id TEXT PRIMARY KEY,
     env_id TEXT NOT NULL,
     project_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     from_head TEXT NOT NULL,
     to_head TEXT NOT NULL,
     command TEXT NOT NULL,
     exit_code INTEGER NOT NULL,
     output TEXT NOT NULL,
     ms INTEGER NOT NULL
   );
   CREATE INDEX deploys_project ON deploys(project_id, at);
   ALTER TABLE projects ADD COLUMN git_flow INTEGER NOT NULL DEFAULT 1;`,
  // Faz 4.2: a session kept to yourself even in a shared project.
  `ALTER TABLE sessions ADD COLUMN private INTEGER NOT NULL DEFAULT 0;`,
  // Faz 4.4: comments with @mentions, and messages to one teammate (prompt suggestions, handoffs).
  `CREATE TABLE comments (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     target_kind TEXT NOT NULL,
     target_id TEXT NOT NULL,
     author_id TEXT,
     author_name TEXT,
     text TEXT NOT NULL,
     mentions TEXT NOT NULL DEFAULT '[]',
     at INTEGER NOT NULL,
     sent INTEGER NOT NULL DEFAULT 0,
     read INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX comments_target ON comments(target_kind, target_id);
   CREATE TABLE team_messages (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     project_id TEXT NOT NULL,
     from_id TEXT,
     from_name TEXT,
     to_id TEXT NOT NULL,
     session_id TEXT,
     title TEXT,
     text TEXT NOT NULL,
     at INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'new',
     outgoing INTEGER NOT NULL DEFAULT 0,
     sent INTEGER NOT NULL DEFAULT 0
   );`,
  // Faz 4.1 integrity: the last event seen from each device (and our own), and the holes found in between.
  `CREATE TABLE sync_chain (
     project TEXT NOT NULL,
     device TEXT NOT NULL,
     n INTEGER NOT NULL,
     hash TEXT NOT NULL,
     PRIMARY KEY (project, device)
   );
   CREATE TABLE sync_gaps (
     project TEXT NOT NULL,
     device TEXT NOT NULL,
     from_n INTEGER NOT NULL,
     to_n INTEGER NOT NULL,
     found_at INTEGER NOT NULL,
     asked_at INTEGER,
     PRIMARY KEY (project, device, from_n)
   );`,
  // A local project a teammate also shares: receive their work, send nothing of yours until you choose to.
  `ALTER TABLE projects ADD COLUMN team_linked INTEGER NOT NULL DEFAULT 0;`,
  // Teammates' notes in your language (plan.md 7.4), translated once and kept.
  `CREATE TABLE translations (
     hash TEXT NOT NULL,
     lang TEXT NOT NULL,
     text TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (hash, lang)
   );`,
  // Faz 6: personas the user made or changed, their opinions notebook, which session ran as
  // which persona, and team meetings.
  `CREATE TABLE personas (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE persona_opinions (
     id TEXT PRIMARY KEY,
     persona_id TEXT NOT NULL,
     project_id TEXT,
     claim TEXT NOT NULL,
     reasoning TEXT NOT NULL DEFAULT '',
     evidence TEXT NOT NULL DEFAULT '',
     confidence TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     replaces TEXT,
     replaced_by TEXT,
     changed_because TEXT,
     source TEXT
   );
   CREATE INDEX persona_opinions_persona ON persona_opinions(persona_id, project_id, created_at);
   CREATE TABLE persona_sessions (
     session_id TEXT PRIMARY KEY,
     persona_id TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE TABLE meetings (
     id TEXT PRIMARY KEY,
     project_id TEXT,
     question TEXT NOT NULL,
     status TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX meetings_project ON meetings(project_id, created_at);`,
  // Faz 6.1b: test users' own profiles and their runs in a real browser.
  `CREATE TABLE tester_profiles (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE tester_runs (
     id TEXT PRIMARY KEY,
     project_id TEXT,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX tester_runs_project ON tester_runs(project_id, created_at);`,
];

export function migrate(sqlite: Database): number {
  const current = (sqlite.query("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let version = current; version < migrations.length; version++) {
    sqlite.transaction(() => {
      sqlite.run(migrations[version] as string);
      sqlite.run(`PRAGMA user_version = ${version + 1}`);
    })();
  }
  return migrations.length;
}

export function openDb(dataDir: string | ":memory:") {
  const sqlite = new Database(dataDir === ":memory:" ? ":memory:" : join(dataDir, "godeye.db"), { create: true });
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  migrate(sqlite);
  return { sqlite, db: drizzle(sqlite) };
}

export type Db = ReturnType<typeof openDb>["db"];
