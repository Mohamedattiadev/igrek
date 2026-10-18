import { existsSync, renameSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

/** Old MCP tool names (godeye_search) still answer, for sessions and allow lists from before. */
export function currentToolName(name: string): string {
  return name.startsWith(`${OLD}_`) ? `${NEW}_${name.slice(OLD.length + 1)}` : name;
}
