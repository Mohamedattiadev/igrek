import type { Database } from "bun:sqlite";
import { existsSync, renameSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/**
 * The product was called God Eye until 2026-10-18. What older installs wrote under
 * that name keeps working: old variable names are still read, the data folder and
 * the database file move to the new names once, and old names found in the user's
 * own files (hooks, MCP entries, git refs) are still recognised.
 */
const OLD = "godeye";
const NEW = "igrek";

/** IGREK_<name>, or the GODEYE_<name> an older setup still exports. */
export function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  return env[`IGREK_${name}`] ?? env[`GODEYE_${name}`];
}

/**
 * Set on everything Igrek starts itself, so hooks skip those runs. Both names, because
 * hook scripts written before the rename still check the old one.
 */
export const INTERNAL_ENV = { IGREK_INTERNAL: "1", GODEYE_INTERNAL: "1" };

/**
 * The default data folder, ~/.igrek. With `migrate`, an existing ~/.godeye is moved
 * there and a link is left at the old path, because hooks and MCP entries written into
 * the user's settings still name it. Without `migrate` (a second process such as the
 * MCP server) the old folder is used as long as it has not moved yet.
 */
export function defaultDataDir(home = homedir(), migrate = false): string {
  const dir = join(home, `.${NEW}`);
  const old = join(home, `.${OLD}`);
  if (existsSync(dir) || !existsSync(old)) return dir;
  if (!migrate) return old;
  try {
    renameSync(old, dir);
  } catch {
    return old;
  }
  try {
    symlinkSync(dir, old);
  } catch {
    // The data has moved; the link only helps old paths in the user's settings.
  }
  return dir;
}

/**
 * The database file, igrek.db. A godeye.db from before the rename is renamed first,
 * write-ahead log files before the main file, so a move cut short is finished on the
 * next start instead of opening an empty database.
 */
export function databaseFile(dataDir: string): string {
  const file = join(dataDir, `${NEW}.db`);
  const old = join(dataDir, `${OLD}.db`);
  if (existsSync(file) || !existsSync(old)) return file;
  try {
    for (const suffix of ["-wal", "-shm", ""]) if (existsSync(old + suffix)) renameSync(old + suffix, file + suffix);
    return file;
  } catch {
    return old;
  }
}

/**
 * Absolute paths into the data folder that were stored before it moved (each account's own
 * Claude folder, the transcripts read from it, team-run worktrees) are pointed at the new place.
 * The folder counts as moved when an account's stored folder is gone but a folder of the same
 * name sits in this data folder's accounts. Without this a moved account looks logged out, and
 * its transcripts would be read again from the start under the new path. Returns the old folder.
 */
export function relocateStoredPaths(sqlite: Database, dataDir: string): string | undefined {
  const dirs = sqlite.query("SELECT config_dir AS dir FROM accounts WHERE config_dir IS NOT NULL").all() as {
    dir: string;
  }[];
  const moved = dirs.find(
    ({ dir }) =>
      !existsSync(dir) && basename(dirname(dir)) === "accounts" && existsSync(join(dataDir, "accounts", basename(dir))),
  );
  if (!moved) return undefined;
  const old = dirname(dirname(moved.dir));
  if (old === dataDir) return undefined;
  const from = `${old}/`;
  const to = `${dataDir}/`;
  const prefix = [from.length, from] as const;
  sqlite.transaction(() => {
    sqlite
      .query("UPDATE accounts SET config_dir = ? || substr(config_dir, ?) WHERE substr(config_dir, 1, ?) = ?")
      .run(to, from.length + 1, ...prefix);
    // A transcript already known under the new path keeps that row; the stale one goes.
    sqlite
      .query("UPDATE OR IGNORE source_files SET path = ? || substr(path, ?) WHERE substr(path, 1, ?) = ?")
      .run(to, from.length + 1, ...prefix);
    sqlite.query("DELETE FROM source_files WHERE substr(path, 1, ?) = ?").run(...prefix);
    sqlite.query("UPDATE flow_runs SET data = replace(data, ?, ?) WHERE instr(data, ?) > 0").run(from, to, from);
  })();
  return old;
}

/** Old MCP tool names (godeye_search) still answer, for sessions and allow lists from before. */
export function currentToolName(name: string): string {
  return name.startsWith(`${OLD}_`) ? `${NEW}_${name.slice(OLD.length + 1)}` : name;
}
