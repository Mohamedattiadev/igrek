import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { Checkpoint } from "@igrek/core";

const REF_PREFIX = "refs/igrek/checkpoints/";
/** Checkpoints taken before the rename to Igrek stay listed and restorable. */
const OLD_REF_PREFIX = "refs/godeye/checkpoints/";
/** Untracked files larger than this are left out of snapshots (and left alone by restores). */
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;
/** Snapshots kept per repository; older refs are dropped. */
const KEEP = 200;
const SKIPPED = "skipped: ";

function git(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): { ok: boolean; out: string; err: string } {
  const proc = Bun.spawnSync(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

/**
 * Snapshots of the working tree taken before AI steps (plan.md 2.3), stored as
 * hidden git refs. Taking one never touches branches, the index or files;
 * untracked files are included, ignored files are not.
 */
export function createCheckpoint(root: string, label: string): Checkpoint | undefined {
  if (!git(root, ["rev-parse", "--is-inside-work-tree"]).ok) return undefined;
  // Build the tree in a throwaway index so the user's staging area stays as it was.
  const dir = mkdtempSync(join(tmpdir(), "igrek-ckpt-"));
  const index = join(dir, "index");
  try {
    const env = { GIT_INDEX_FILE: index };
    // Start from a copy of the real index: its file-stat cache means only changed files get hashed.
    const realIndex = git(root, ["rev-parse", "--git-path", "index"]).out.trim();
    const realPath = isAbsolute(realIndex) ? realIndex : join(root, realIndex);
    if (realIndex && existsSync(realPath)) copyFileSync(realPath, index);
    else if (git(root, ["rev-parse", "--verify", "-q", "HEAD"]).ok) git(root, ["read-tree", "HEAD"], env);
    const skipped = bigUntracked(root);
    const excludes = skipped.map((file) => `:(exclude,literal)${file}`);
    if (!git(root, ["add", "-A", "--", ".", ...excludes], env).ok) return undefined;
    const tree = git(root, ["write-tree"], env).out.trim();
    if (!tree) return undefined;
    const head = git(root, ["rev-parse", "--verify", "-q", "HEAD"]).out.trim();
    const at = Date.now();
    const message = `igrek checkpoint: ${label}${skipped.length ? `\n\n${skipped.map((f) => SKIPPED + f).join("\n")}` : ""}`;
    const commit = git(root, ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", message], {
      GIT_AUTHOR_NAME: "Igrek",
      GIT_AUTHOR_EMAIL: "checkpoint@igrek.local",
      GIT_COMMITTER_NAME: "Igrek",
      GIT_COMMITTER_EMAIL: "checkpoint@igrek.local",
    }).out.trim();
    if (!commit) return undefined;
    // Skip if nothing changed since the newest checkpoint.
    const latest = listCheckpoints(root)[0];
    if (latest && git(root, ["rev-parse", `${latest.id}^{tree}`]).out.trim() === tree) return latest;
    const id = commit.slice(0, 12);
    git(root, ["update-ref", `${REF_PREFIX}${at}-${id}`, commit]);
    prune(root);
    return { id, label, at };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Untracked, non-ignored files too big to copy into every snapshot (builds, dumps, videos). */
function bigUntracked(root: string): string[] {
  return git(root, ["ls-files", "-o", "--exclude-standard", "-z"])
    .out.split("\0")
    .filter((file) => {
      if (!file) return false;
      try {
        return statSync(join(root, file)).size > MAX_UNTRACKED_BYTES;
      } catch {
        return false;
      }
    })
    .slice(0, 500);
}

/** Drops the oldest snapshot refs beyond KEEP (their objects go with git's own gc). */
function prune(root: string): void {
  const refs = git(root, ["for-each-ref", "--sort=refname", "--format=%(refname)", OLD_REF_PREFIX, REF_PREFIX])
    .out.split("\n")
    .filter(Boolean);
  for (const ref of refs.slice(0, Math.max(0, refs.length - KEEP))) git(root, ["update-ref", "-d", ref]);
}

export function listCheckpoints(root: string, limit = 50): Checkpoint[] {
  const out = git(root, [
    "for-each-ref",
    "--sort=-refname",
    `--count=${limit}`,
    "--format=%(refname)%09%(objectname:short=12)%09%(contents:subject)",
    REF_PREFIX,
    OLD_REF_PREFIX,
  ]);
  if (!out.ok) return [];
  return out.out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref = "", id = "", subject = ""] = line.split("\t");
      const at = Number(ref.slice(ref.lastIndexOf("/") + 1).split("-")[0]);
      return { id, at, label: subject.replace(/^(igrek|godeye) checkpoint: /, "") };
    });
}

/** Files that differ between now and a checkpoint (to show before restoring). */
export function checkpointChanges(root: string, id: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "igrek-ckpt-"));
  try {
    const env = { GIT_INDEX_FILE: join(dir, "index") };
    git(root, ["read-tree", id], env);
    git(root, ["add", "-A"], env);
    return git(root, ["diff", "--cached", "--name-only", id], env).out.split("\n").filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Puts the working tree back exactly as it was at the checkpoint. A new
 * checkpoint of the current state is taken first, so a restore can be undone too.
 */
export function restoreCheckpoint(root: string, id: string): { ok: boolean; backup?: Checkpoint; error?: string } {
  if (!/^[0-9a-f]{7,40}$/.test(id)) return { ok: false, error: "Unknown checkpoint" };
  if (!git(root, ["cat-file", "-e", `${id}^{commit}`]).ok) return { ok: false, error: "Unknown checkpoint" };
  const backup = createCheckpoint(root, "before restore");
  const keep = new Set(git(root, ["ls-tree", "-r", "--name-only", id]).out.split("\n").filter(Boolean));
  // Big untracked files the snapshot left out are kept as they are now.
  for (const line of git(root, ["log", "-1", "--format=%b", id]).out.split("\n"))
    if (line.startsWith(SKIPPED)) keep.add(line.slice(SKIPPED.length));
  // Remove files that didn't exist at the checkpoint (tracked or untracked, never ignored ones).
  for (const file of git(root, ["ls-files", "-co", "--exclude-standard"]).out.split("\n").filter(Boolean)) {
    if (!keep.has(file)) {
      try {
        unlinkSync(join(root, file));
      } catch {
        // Already gone.
      }
    }
  }
  const restore = git(root, ["restore", `--source=${id}`, "--worktree", "--", "."]);
  return restore.ok ? { ok: true, backup } : { ok: false, backup, error: restore.err.trim() };
}

/** A path inside the repository as git names it, never one that climbs out of it. */
function safeRelative(file: string): boolean {
  return !!file && !isAbsolute(file) && !file.split(/[\\/]/).includes("..") && !file.includes("\0");
}

/** One file as it was at the checkpoint; undefined when it did not exist then. */
export function checkpointFile(root: string, id: string, file: string): Buffer | undefined {
  if (!/^[0-9a-f]{7,40}$/.test(id) || !safeRelative(file)) return undefined;
  const proc = Bun.spawnSync(["git", "-C", root, "show", `${id}:${file}`], { stdout: "pipe", stderr: "pipe" });
  return proc.exitCode === 0 ? Buffer.from(proc.stdout) : undefined;
}

/**
 * Puts one file back as it was at the checkpoint (a file that did not exist then is removed). The
 * current state is saved first, so this can be undone like a whole restore.
 */
export function restoreCheckpointFile(
  root: string,
  id: string,
  file: string,
): { ok: boolean; backup?: Checkpoint; error?: string } {
  if (!/^[0-9a-f]{7,40}$/.test(id) || !git(root, ["cat-file", "-e", `${id}^{commit}`]).ok)
    return { ok: false, error: "Unknown checkpoint" };
  if (!safeRelative(file)) return { ok: false, error: "Not a file in this project" };
  const backup = createCheckpoint(root, `before undoing ${file}`);
  const before = checkpointFile(root, id, file);
  const path = join(root, file);
  try {
    if (before === undefined) {
      if (existsSync(path)) unlinkSync(path);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, before);
    }
    return { ok: true, backup };
  } catch (err) {
    return { ok: false, backup, error: (err as Error).message };
  }
}
