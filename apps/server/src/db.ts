import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
