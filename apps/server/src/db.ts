import { Database } from "bun:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settingsTable = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  gitRemote: text("git_remote"),
  workspace: text("workspace").notNull().default("local"),
  createdAt: integer("created_at").notNull(),
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
