import { existsSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Sandbox for auto mode (plan.md 0): the agent works in its own git worktree on its own branch,
 * never in your folder. You look at what it changed, then merge it (asked every time) or throw it away.
 */
export interface Worktree {
  path: string;
  branch: string;
  /** Commit it started from, and the branch you were on. */
  base: string;
  baseBranch?: string;
  /** The project folder inside the repo (when the project isn't the repo root). */
  sub: string;
}

function run(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const proc = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim(), err: proc.stderr.toString().trim() };
}

export function createWorktree(projectPath: string, id: string, dir: string): Worktree | undefined {
  const root = run(projectPath, ["rev-parse", "--show-toplevel"]);
  const head = run(projectPath, ["rev-parse", "HEAD"]);
  if (!root.ok || !head.ok) return undefined; // not a git repo (or no commit yet)
  mkdirSync(dir, { recursive: true });
  const path = join(dir, id);
  const branch = `godeye/auto-${id}`;
  const added = run(root.out, ["worktree", "add", "-b", branch, path, head.out]);
  if (!added.ok) throw new Error(`Couldn't make a separate copy: ${added.err}`);
  const current = run(root.out, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    path,
    branch,
    base: head.out,
    baseBranch: current.ok && current.out !== "HEAD" ? current.out : undefined,
    sub: relative(root.out, projectPath),
  };
}

/** Folder the agent should work in (the same sub-folder of the repo, inside the copy). */
export function workFolder(wt: Worktree): string {
  return wt.sub ? join(wt.path, wt.sub) : wt.path;
}

/** Everything the agent changed since it started, committed or not, new files included. */
export function worktreeDiff(wt: Worktree): {
  files: { path: string; added: number; removed: number }[];
  patch: string;
} {
  if (!existsSync(wt.path)) return { files: [], patch: "" };
  run(wt.path, ["add", "-A"]);
  const numstat = run(wt.path, ["diff", "--cached", "--numstat", wt.base]).out;
  const patch = run(wt.path, ["diff", "--cached", wt.base]).out;
  const files = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [a, r, ...p] = line.split("\t");
      return { path: p.join("\t"), added: Number(a) || 0, removed: Number(r) || 0 };
    });
  return { files, patch: patch.length > 400_000 ? `${patch.slice(0, 400_000)}\n…` : patch };
}

/** Brings the agent's work into the branch you're on. Your folder must have no unsaved changes in the same files. */
/** The user's own git identity when set; otherwise a stand-in so the commit doesn't fail. */
function identity(cwd: string): string[] {
  const has = (key: string) => run(cwd, ["config", key]).out.trim() !== "";
  return [
    ...(has("user.name") ? [] : ["-c", "user.name=God Eye"]),
    ...(has("user.email") ? [] : ["-c", "user.email=god-eye@localhost"]),
  ];
}

export function mergeWorktree(projectPath: string, wt: Worktree, title: string): { merged: boolean; message: string } {
  const root = run(projectPath, ["rev-parse", "--show-toplevel"]).out || projectPath;
  run(wt.path, ["add", "-A"]);
  const pending = run(wt.path, ["diff", "--cached", "--quiet"]);
  if (!pending.ok) {
    const commit = run(wt.path, [
      "-c",
      "user.name=God Eye",
      "-c",
      "user.email=god-eye@localhost",
      "commit",
      "-m",
      `Auto chat: ${title.slice(0, 72)}`,
    ]);
    if (!commit.ok) return { merged: false, message: commit.err };
  }
  if (!run(root, ["rev-list", "--count", `${wt.base}..${wt.branch}`]).out.match(/^[1-9]/))
    return { merged: false, message: "Nothing to merge" };
  const merge = run(root, [...identity(root), "merge", "--no-ff", "--no-edit", wt.branch]);
  if (!merge.ok) {
    run(root, ["merge", "--abort"]);
    return { merged: false, message: merge.err || merge.out };
  }
  return { merged: true, message: merge.out };
}

export function removeWorktree(projectPath: string, wt: Worktree): void {
  const root = run(projectPath, ["rev-parse", "--show-toplevel"]).out || projectPath;
  run(root, ["worktree", "remove", "--force", wt.path]);
  run(root, ["branch", "-D", wt.branch]);
}
