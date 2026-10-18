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
/** Faz 2.5: servers over SSH and their audit log (kept here so the schema has no feature imports). */
const SERVER_MIGRATION = `CREATE TABLE servers (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     target TEXT NOT NULL,
     port INTEGER,
     tag TEXT NOT NULL DEFAULT 'other',
     health TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE remote_audit (
     id TEXT PRIMARY KEY,
     server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
     command TEXT NOT NULL,
     risk TEXT NOT NULL,
     actor TEXT NOT NULL,
     reason TEXT,
     started_at INTEGER NOT NULL,
     exit_code INTEGER,
     output TEXT,
     duration_ms INTEGER
   );
   CREATE INDEX remote_audit_server ON remote_audit(server_id, started_at DESC);`;

export const migrations: string[] = [
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
  // Faz 7.1: the library: items, their parts (with meaning vectors) and a word index.
  `CREATE TABLE library_items (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     author TEXT,
     source TEXT NOT NULL,
     url TEXT,
     persona_ids TEXT NOT NULL DEFAULT '[]',
     status TEXT NOT NULL,
     progress REAL NOT NULL DEFAULT 0,
     chunks INTEGER NOT NULL DEFAULT 0,
     embedded INTEGER NOT NULL DEFAULT 0,
     error TEXT,
     size INTEGER,
     hash TEXT,
     file TEXT,
     uses INTEGER NOT NULL DEFAULT 0,
     added_at INTEGER NOT NULL,
     published_at INTEGER
   );
   CREATE TABLE library_chunks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
     ord INTEGER NOT NULL,
     location TEXT,
     text TEXT NOT NULL,
     embedding BLOB
   );
   CREATE INDEX library_chunks_item ON library_chunks(item_id, ord);
   CREATE VIRTUAL TABLE library_fts USING fts5(text, tokenize = 'unicode61 remove_diacritics 2');`,
  // Faz 7.2: the lessons book, the mistakes waiting to be written up, and where the scan stopped.
  `CREATE TABLE lessons (
     id TEXT PRIMARY KEY,
     project_id TEXT,
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     what TEXT NOT NULL,
     why TEXT NOT NULL,
     fix TEXT NOT NULL,
     prevent TEXT NOT NULL,
     source TEXT,
     repeats INTEGER NOT NULL DEFAULT 1,
     uses INTEGER NOT NULL DEFAULT 0,
     status TEXT NOT NULL DEFAULT 'active',
     rule_target TEXT,
     vector BLOB,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     last_used INTEGER
   );
   CREATE INDEX lessons_project ON lessons(project_id, status);
   CREATE TABLE lesson_candidates (
     source TEXT PRIMARY KEY,
     project_id TEXT,
     kind TEXT NOT NULL,
     detail TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     done INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE lesson_state (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  // Faz 7.1b: the knowledge engine: sources per persona, rated news, what was seen, tech mentions, package updates.
  `CREATE TABLE knowledge_sources (
     persona_id TEXT PRIMARY KEY,
     data TEXT NOT NULL
   );
   CREATE TABLE news_items (
     id TEXT PRIMARY KEY,
     persona_id TEXT NOT NULL,
     title TEXT NOT NULL,
     url TEXT NOT NULL,
     source TEXT NOT NULL,
     published_at INTEGER,
     importance INTEGER NOT NULL,
     verdict TEXT NOT NULL,
     summary TEXT NOT NULL,
     why TEXT NOT NULL,
     affects TEXT NOT NULL DEFAULT '[]',
     mentions INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX news_items_persona ON news_items(persona_id, created_at);
   CREATE TABLE news_seen (
     key TEXT PRIMARY KEY,
     at INTEGER NOT NULL
   );
   CREATE TABLE tech_mentions (
     week TEXT NOT NULL,
     term TEXT NOT NULL,
     count INTEGER NOT NULL,
     PRIMARY KEY (week, term)
   );
   CREATE TABLE package_updates (
     project_id TEXT NOT NULL,
     name TEXT NOT NULL,
     current TEXT NOT NULL,
     latest TEXT NOT NULL,
     major INTEGER NOT NULL DEFAULT 1,
     released_at INTEGER,
     notes TEXT,
     at INTEGER NOT NULL,
     PRIMARY KEY (project_id, name, latest)
   );`,
  // Faz 8: team runs (flows) and the task board.
  `CREATE TABLE flow_runs (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX flow_runs_project ON flow_runs(project_id, created_at);
   CREATE TABLE board_tasks (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     run_id TEXT,
     origin TEXT,
     ord REAL NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX board_tasks_project ON board_tasks(project_id, status, ord);`,
  // Faz 9: scheduled work.
  `CREATE TABLE schedules (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Faz 11: secrets found in commits.
  `CREATE TABLE secret_findings (
     project_id TEXT NOT NULL,
     hash TEXT NOT NULL,
     file TEXT NOT NULL,
     line INTEGER NOT NULL,
     hint TEXT NOT NULL,
     at INTEGER NOT NULL,
     dismissed INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (project_id, hash, file, line)
   );`,
  // Faz 12: uptime monitors, domains and certificates.
  `CREATE TABLE uptime_monitors (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     url TEXT NOT NULL,
     project_id TEXT,
     interval_sec INTEGER NOT NULL DEFAULT 300,
     state TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE uptime_checks (
     monitor_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     up INTEGER NOT NULL,
     status INTEGER,
     ms INTEGER,
     error TEXT
   );
   CREATE INDEX uptime_checks_at ON uptime_checks(monitor_id, at);
   CREATE TABLE domain_watches (
     id TEXT PRIMARY KEY,
     host TEXT NOT NULL UNIQUE,
     project_id TEXT,
     state TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE log_sources (
     id TEXT PRIMARY KEY,
     project_id TEXT,
     source TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE app_error_keys (
     project_id TEXT PRIMARY KEY,
     key TEXT NOT NULL UNIQUE
   );
   CREATE TABLE app_error_releases (
     project_id TEXT NOT NULL,
     release TEXT NOT NULL,
     first_at INTEGER NOT NULL,
     PRIMARY KEY (project_id, release)
   );
   CREATE TABLE app_error_groups (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     fingerprint TEXT NOT NULL,
     message TEXT NOT NULL,
     stack TEXT,
     count INTEGER NOT NULL,
     first_at INTEGER NOT NULL,
     last_at INTEGER NOT NULL,
     first_release TEXT,
     last_release TEXT,
     suspects TEXT,
     urls TEXT NOT NULL,
     browsers TEXT NOT NULL,
     status TEXT NOT NULL,
     UNIQUE (project_id, fingerprint)
   );`,
  // Faz 12: databases and backups.
  `CREATE TABLE db_connections (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     kind TEXT NOT NULL,
     project_id TEXT,
     prod INTEGER NOT NULL DEFAULT 0,
     read_only INTEGER NOT NULL DEFAULT 0,
     address TEXT NOT NULL,
     display TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE backup_jobs (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE backup_runs (
     id TEXT PRIMARY KEY,
     job_id TEXT NOT NULL,
     data TEXT NOT NULL,
     started_at INTEGER NOT NULL
   );
   CREATE INDEX backup_runs_job ON backup_runs(job_id, started_at);`,
  // Faz 12: project wiki and whiteboards (shared with the team like memory, end-to-end encrypted).
  `CREATE TABLE wiki_pages (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     slug TEXT NOT NULL,
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     author_name TEXT,
     deleted INTEGER NOT NULL DEFAULT 0,
     dirty INTEGER NOT NULL DEFAULT 1
   );
   CREATE INDEX wiki_pages_project ON wiki_pages(project_id, slug);
   CREATE TABLE boards (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     category TEXT,
     title TEXT NOT NULL,
     scene TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     author_name TEXT,
     deleted INTEGER NOT NULL DEFAULT 0,
     dirty INTEGER NOT NULL DEFAULT 1
   );
   CREATE INDEX boards_project ON boards(project_id);
   CREATE TABLE board_versions (
     id TEXT PRIMARY KEY,
     board_id TEXT NOT NULL,
     at INTEGER NOT NULL,
     scene TEXT NOT NULL,
     author_name TEXT
   );
   CREATE INDEX board_versions_board ON board_versions(board_id, at);`,
  // Faz 12: your own deadlines and milestones on the calendar.
  `CREATE TABLE calendar_events (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     title TEXT NOT NULL,
     at INTEGER NOT NULL,
     project_id TEXT,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX calendar_events_at ON calendar_events(at);`,
  // Faz 12: the vault: your own secrets (encrypted) and rotation reminders for every key.
  `CREATE TABLE vault_items (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     value TEXT NOT NULL,
     note TEXT,
     project_id TEXT,
     changed_at INTEGER NOT NULL
   );
   CREATE TABLE vault_rotation (
     ref TEXT PRIMARY KEY,
     every_days INTEGER NOT NULL DEFAULT 0,
     last_hash TEXT,
     changed_at INTEGER
   );`,
  // Faz 12: the cost panel.
  `CREATE TABLE cost_items (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Faz 12: product analytics from the app's own events (user ids hashed) and its database.
  `CREATE TABLE app_events_daily (
     project_id TEXT NOT NULL,
     day TEXT NOT NULL,
     event TEXT NOT NULL,
     count INTEGER NOT NULL,
     PRIMARY KEY (project_id, day, event)
   );
   CREATE TABLE app_users_daily (
     project_id TEXT NOT NULL,
     day TEXT NOT NULL,
     user_hash TEXT NOT NULL,
     PRIMARY KEY (project_id, day, user_hash)
   );
   CREATE TABLE analytics_sources (
     project_id TEXT PRIMARY KEY,
     data TEXT NOT NULL
   );`,
  // Faz 12: plugins (folders with a manifest), off until the user approves their permissions.
  `CREATE TABLE plugins (
     id TEXT PRIMARY KEY,
     source TEXT NOT NULL,
     enabled INTEGER NOT NULL DEFAULT 0,
     installed_at INTEGER NOT NULL
   );`,
  // Faz 13: model arena matches.
  `CREATE TABLE arena_matches (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Faz 13: MCP servers the user adds (env values encrypted).
  `CREATE TABLE mcp_servers (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     env TEXT,
     created_at INTEGER NOT NULL
   );`,
  // Faz 13: project status (archived projects use no background resources) and milestone done flags.
  `ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
   ALTER TABLE calendar_events ADD COLUMN done INTEGER NOT NULL DEFAULT 0;`,
  // Faz 13: the evening recap of each day ("what did we do today").
  `CREATE TABLE day_recaps (
     day TEXT PRIMARY KEY,
     text TEXT NOT NULL,
     stats TEXT NOT NULL,
     at INTEGER NOT NULL
   );`,
  // Faz 13: notification bridges (Telegram, Discord, your own SMTP); their secrets are encrypted.
  `CREATE TABLE bridges (
     id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     secret TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );`,
  // Faz 13: response times the app sends (per endpoint and day, as a histogram).
  `CREATE TABLE app_perf (
     project_id TEXT NOT NULL,
     day TEXT NOT NULL,
     route TEXT NOT NULL,
     count INTEGER NOT NULL,
     total_ms REAL NOT NULL,
     errors INTEGER NOT NULL,
     buckets TEXT NOT NULL,
     PRIMARY KEY (project_id, day, route)
   );`,
  // Faz 13: incidents (war rooms) and their postmortems.
  `CREATE TABLE incidents (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     data TEXT NOT NULL,
     started_at INTEGER NOT NULL
   );`,
  // Faz 13: feedback from the product's own users.
  `CREATE TABLE feedback (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     data TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE INDEX feedback_project ON feedback(project_id, at);`,
  // Faz 13: the weekly CEO report.
  `CREATE TABLE weekly_reports (
     week TEXT PRIMARY KEY,
     text TEXT NOT NULL,
     at INTEGER NOT NULL
   );`,
  // Faz 14: the learning center: the user's favorites, notes, reports and finished steps; the
  // newest versions of the technologies; translations of sheets and roadmaps into other languages.
  `CREATE TABLE learn_marks (
     key TEXT NOT NULL,
     kind TEXT NOT NULL,
     value TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (key, kind)
   );
   CREATE TABLE learn_latest (
     sheet TEXT PRIMARY KEY,
     latest TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE TABLE learn_translations (
     kind TEXT NOT NULL,
     id TEXT NOT NULL,
     lang TEXT NOT NULL,
     version TEXT NOT NULL,
     data TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (kind, id, lang)
   );`,
  `CREATE TABLE chat_history (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     session_id TEXT NOT NULL,
     title TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX chat_history_updated ON chat_history(updated_at);`,
  `ALTER TABLE chat_history ADD COLUMN queue TEXT NOT NULL DEFAULT '[]';`,
  `CREATE TABLE tool_rules (
     project_id TEXT NOT NULL,
     rule TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (project_id, rule)
   );`,
  // Indexes for the columns queries filter on, found by EXPLAIN QUERY PLAN over the code (plan.md 15.3).
  `CREATE INDEX sessions_updated ON sessions(updated_at);
   CREATE INDEX commits_at ON commits(at);
   CREATE INDEX deploys_at ON deploys(at);
   CREATE INDEX library_items_hash ON library_items(hash);
   CREATE INDEX comments_project ON comments(project_id);
   CREATE INDEX team_messages_project ON team_messages(project_id);
   CREATE INDEX app_events_daily_day ON app_events_daily(day);
   CREATE INDEX app_users_daily_day ON app_users_daily(day);
   CREATE INDEX app_error_groups_open ON app_error_groups(status, last_at);
   CREATE INDEX team_messages_inbox ON team_messages(outgoing, status);`,
  // Projects whose own hooks, MCP servers and skills the user said a chat may load (plan.md 16.4).
  `CREATE TABLE project_trust (
     project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     fingerprint TEXT NOT NULL,
     decided_at INTEGER NOT NULL
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
