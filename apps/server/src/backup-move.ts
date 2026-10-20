import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { keyFrom } from "./backup";

/**
 * Moving Igrek to another computer (plan.md 11): the whole data folder in one file, locked with
 * a password because it holds the database and the vault's key. Left out is what belongs to this
 * computer or can be made again: AI logins (log in again there; sharing a login's tokens between
 * two computers logs one of them out), working copies, downloaded models, caches and logs.
 */
const LEAVE_OUT = new Set([
  "accounts",
  "worktrees",
  "models",
  "runner",
  "trash",
  "logs",
  "preview",
  "launch-shots",
  "agents",
  "session.key",
  "server.pid",
  "server.log",
  // The database goes in as a consistent copy, never the live file and its write-ahead log.
  "igrek.db",
  "igrek.db-wal",
  "igrek.db-shm",
  "godeye.db",
  "godeye.db-wal",
  "godeye.db-shm",
]);
/** What stays with this computer when a moved-in folder replaces the data folder. */
const KEEP_HERE = ["accounts", "models", "session.key"];
const MAGIC = new TextEncoder().encode("IGREK-MOVE-1\n");
const MAX_BYTES = 1024 * 1024 * 1024;

const incomingOf = (dataDir: string) => `${dataDir}.incoming`;

function tar(args: string[]): void {
  const proc = Bun.spawnSync(["tar", ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`tar failed: ${proc.stderr.toString().trim() || proc.exitCode}`);
}

/** The data folder as one encrypted file (AES-256-GCM, key from the password with PBKDF2). */
export async function exportDataFolder(
  dataDir: string,
  sqlite: Database,
  password: string,
): Promise<Uint8Array<ArrayBuffer>> {
  if (password.length < 8) throw new Error("Choose a password of at least 8 characters");
  const work = mkdtempSync(join(tmpdir(), "igrek-move-"));
  try {
    const snapshot = join(work, "igrek.db");
    sqlite.query("VACUUM INTO ?").run(snapshot);
    const entries = readdirSync(dataDir).filter((name) => !LEAVE_OUT.has(name) && !name.endsWith(".incoming"));
    const archive = join(work, "data.tgz");
    tar(["-czf", archive, "-C", dataDir, ...entries, "-C", work, "igrek.db"]);
    const plain = readFileSync(archive);
    if (plain.length > MAX_BYTES) throw new Error("The data folder is too large to move in one file");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(password, salt), plain),
    );
    const out = new Uint8Array(MAGIC.length + salt.length + iv.length + sealed.length);
    out.set(MAGIC, 0);
    out.set(salt, MAGIC.length);
    out.set(iv, MAGIC.length + salt.length);
    out.set(sealed, MAGIC.length + salt.length + iv.length);
    return out;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Names inside the archive that would land outside the folder are refused before anything is unpacked. */
function safeEntries(archive: string): void {
  const proc = Bun.spawnSync(["tar", "-tzf", archive], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error("The file is damaged");
  for (const name of proc.stdout.toString().split("\n").filter(Boolean))
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("The file is damaged");
}

/**
 * Unpacks a moved-in data folder next to this one; it replaces the data folder on the next start
 * (applyMovedIn), since the running server holds the database open.
 */
export async function stageDataFolder(dataDir: string, file: Uint8Array, password: string): Promise<void> {
  const head = file.subarray(0, MAGIC.length);
  if (file.length < MAGIC.length + 28 || !head.every((byte, i) => byte === MAGIC[i]))
    throw new Error("This is not an Igrek move file");
  const salt = file.subarray(MAGIC.length, MAGIC.length + 16);
  const iv = file.subarray(MAGIC.length + 16, MAGIC.length + 28);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      await keyFrom(password, salt),
      file.subarray(MAGIC.length + 28) as unknown as BufferSource,
    );
  } catch {
    throw new Error("Wrong password, or the file is damaged");
  }
  const work = mkdtempSync(join(tmpdir(), "igrek-move-"));
  const incoming = incomingOf(dataDir);
  try {
    const archive = join(work, "data.tgz");
    await Bun.write(archive, new Uint8Array(plain));
    safeEntries(archive);
    rmSync(incoming, { recursive: true, force: true });
    mkdirSync(incoming, { recursive: true, mode: 0o700 });
    tar(["-xzf", archive, "-C", incoming]);
  } catch (err) {
    rmSync(incoming, { recursive: true, force: true });
    throw err;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** A moved-in folder is waiting to replace the data folder at the next start. */
export const movedInWaiting = (dataDir: string) => existsSync(join(incomingOf(dataDir), "igrek.db"));

/**
 * At start, before the database opens: a staged folder becomes the data folder. The old one is
 * kept beside it (nothing is deleted), and this computer's logins, models and browser session
 * come along into the new one. Returns where the old folder went.
 */
export function applyMovedIn(dataDir: string, now = Date.now()): string | undefined {
  const incoming = incomingOf(dataDir);
  if (!movedInWaiting(dataDir)) return undefined;
  const kept = join(dirname(dataDir), `${basename(dataDir)}.before-move-${now}`);
  renameSync(dataDir, kept);
  renameSync(incoming, dataDir);
  for (const name of KEEP_HERE)
    if (existsSync(join(kept, name)) && !existsSync(join(dataDir, name)))
      renameSync(join(kept, name), join(dataDir, name));
  return kept;
}
