import { copyFileSync, existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Checkpoint } from "@godeye/core";

const REF_PREFIX = "refs/godeye/checkpoints/";

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
  const dir = mkdtempSync(join(tmpdir(), "godeye-ckpt-"));
  const index = join(dir, "index");
  try {
    const env = { GIT_INDEX_FILE: index };
    // Start from a copy of the real index: its file-stat cache means only changed files get hashed.
    const realIndex = git(root, ["rev-parse", "--git-path", "index"]).out.trim();
    const realPath = isAbsolute(realIndex) ? realIndex : join(root, realIndex);
    if (realIndex && existsSync(realPath)) copyFileSync(realPath, index);
    else if (git(root, ["rev-parse", "--verify", "-q", "HEAD"]).ok) git(root, ["read-tree", "HEAD"], env);
    if (!git(root, ["add", "-A"], env).ok) return undefined;
    const tree = git(root, ["write-tree"], env).out.trim();
    if (!tree) return undefined;
    const head = git(root, ["rev-parse", "--verify", "-q", "HEAD"]).out.trim();
    const at = Date.now();
    const message = `godeye checkpoint: ${label}`;
    const commit = git(root, ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", message], {
      GIT_AUTHOR_NAME: "God Eye",
      GIT_AUTHOR_EMAIL: "checkpoint@godeye.local",
      GIT_COMMITTER_NAME: "God Eye",
      GIT_COMMITTER_EMAIL: "checkpoint@godeye.local",
    }).out.trim();
    if (!commit) return undefined;
    // Skip if nothing changed since the newest checkpoint.
    const latest = listCheckpoints(root)[0];
    if (latest && git(root, ["rev-parse", `${latest.id}^{tree}`]).out.trim() === tree) return latest;
    const id = commit.slice(0, 12);
    git(root, ["update-ref", `${REF_PREFIX}${at}-${id}`, commit]);
    return { id, label, at };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function listCheckpoints(root: string, limit = 50): Checkpoint[] {
  const out = git(root, [
    "for-each-ref",
    "--sort=-refname",
    `--count=${limit}`,
    "--format=%(refname)%09%(objectname:short=12)%09%(contents:subject)",
    REF_PREFIX,
  ]);
  if (!out.ok) return [];
  return out.out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref = "", id = "", subject = ""] = line.split("\t");
      const at = Number(ref.slice(REF_PREFIX.length).split("-")[0]);
      return { id, at, label: subject.replace(/^godeye checkpoint: /, "") };
    });
}

/** Files that differ between now and a checkpoint (to show before restoring). */
export function checkpointChanges(root: string, id: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "godeye-ckpt-"));
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
