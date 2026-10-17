import type { CommitItem, GitChange, GitInfo } from "@godeye/core";

function git(cwd: string, args: string[]): string | undefined {
  try {
    const proc = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "ignore" });
    return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
  } catch {
    return undefined;
  }
}

const rootCache = new Map<string, string | null>();

/** Top-level folder of the git repo containing `dir`, or null when it isn't in one. */
export function gitRoot(dir: string): string | null {
  const cached = rootCache.get(dir);
  if (cached !== undefined) return cached;
  const root = git(dir, ["rev-parse", "--show-toplevel"]) ?? null;
  rootCache.set(dir, root);
  return root;
}

/**
 * Turns any remote URL form into "host/owner/repo" so the same repo cloned over
 * SSH on one machine and HTTPS on another gets the same identity (plan.md 1.2c).
 */
export function normalizeRemote(url: string): string {
  let value = url.trim().replace(/\.git$/, "");
  const scp = value.match(/^[\w.-]+@([^:]+):(.+)$/);
  if (scp) value = `${scp[1]}/${scp[2]}`;
  value = value.replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]+@/, "");
  return value.toLowerCase();
}

export function gitRemote(root: string): string | undefined {
  const url = git(root, ["remote", "get-url", "origin"]);
  return url ? normalizeRemote(url) : undefined;
}

const infoCache = new Map<string, { at: number; info: GitInfo }>();

/** Branch, ahead/behind, uncommitted changes and last commit. Cached for 15 s. */
export function gitInfo(root: string): GitInfo | undefined {
  const cached = infoCache.get(root);
  if (cached && Date.now() - cached.at < 15_000) return cached.info;

  const status = git(root, ["status", "--porcelain=v2", "--branch"]);
  if (status === undefined) return undefined;
  const info: GitInfo = { ahead: 0, behind: 0, hasUpstream: false, changed: 0 };
  for (const line of status.split("\n")) {
    if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
    else if (line.startsWith("# branch.upstream ")) info.hasUpstream = true;
    else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match) {
        info.ahead = Number(match[1]);
        info.behind = Number(match[2]);
      }
    } else if (line && !line.startsWith("#")) info.changed++;
  }
  const log = git(root, ["log", "-1", "--format=%H%x1f%s%x1f%an%x1f%ct"]);
  if (log) {
    const [hash = "", subject = "", author = "", at = "0"] = log.split("\x1f");
    info.lastCommit = { hash: hash.slice(0, 7), subject, author, at: Number(at) * 1000 };
  }
  info.remote = gitRemote(root);
  infoCache.set(root, { at: Date.now(), info });
  return info;
}

/** Commits since `sinceMs` (newest first), with the number of files each touched. */
export function gitLog(root: string, sinceMs: number, max = 300): CommitItem[] {
  const args = ["log", `-n${max}`, "--no-merges", "--format=%x1e%h%x1f%an%x1f%ct%x1f%s", "--name-only"];
  if (sinceMs > 0) args.push(`--since=@${Math.floor(sinceMs / 1000) + 1}`);
  const out = git(root, args);
  if (!out) return [];
  return out
    .split("\x1e")
    .filter(Boolean)
    .map((block) => {
      const [header = "", ...files] = block.trim().split("\n");
      const [hash = "", author = "", at = "0", subject = ""] = header.split("\x1f");
      return { hash, author, subject, at: Number(at) * 1000, files: files.filter(Boolean).length };
    });
}

/** Updates remote-tracking branches so ahead/behind is current. Network call, user-triggered only. */
export function gitFetch(root: string): boolean {
  const proc = Bun.spawnSync(["git", "-C", root, "fetch", "--quiet", "--no-tags"], {
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  infoCache.delete(root);
  return proc.exitCode === 0;
}

/** Changed files in the working tree (git status). */
export function gitChanges(root: string): GitChange[] {
  // Not trimmed: the first entry's leading space is part of its status code.
  const proc = Bun.spawnSync(["git", "-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  if (proc.exitCode !== 0) return [];
  const out = proc.stdout.toString();
  const parts = out.split("\0").filter(Boolean);
  const changes: GitChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i] ?? "";
    const code = entry.slice(0, 2);
    const path = entry.slice(3);
    // Renames carry the old path as the next entry.
    if (code.startsWith("R") || code.startsWith("C")) i++;
    changes.push({ path, code, staged: code[0] !== " " && code[0] !== "?" });
  }
  return changes;
}

/** The committed version of a file, for side-by-side diffs (empty for new files). */
export function gitShowHead(root: string, path: string): string {
  return git(root, ["show", `HEAD:${path}`]) ?? "";
}

/** Commits the given files (or everything changed) with a message. Local only, never pushes. */
export function gitCommit(root: string, message: string, files?: string[]): { ok: boolean; output: string } {
  const add = Bun.spawnSync(["git", "-C", root, "add", "--", ...(files?.length ? files : ["."])], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (add.exitCode !== 0) return { ok: false, output: add.stderr.toString() };
  const commit = Bun.spawnSync(["git", "-C", root, "commit", "-m", message], { stdout: "pipe", stderr: "pipe" });
  infoCache.delete(root);
  return { ok: commit.exitCode === 0, output: `${commit.stdout}${commit.stderr}`.trim() };
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream?: string;
  at: number;
  subject: string;
}

export function gitBranches(root: string): GitBranch[] {
  const out = git(root, [
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(HEAD)\t%(refname:short)\t%(upstream:short)\t%(committerdate:unix)\t%(subject)",
    "refs/heads",
  ]);
  return (out ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [head, name, upstream, at, subject] = line.split("\t");
      return {
        name: name ?? "",
        current: head === "*",
        upstream: upstream || undefined,
        at: Number(at) * 1000,
        subject: subject ?? "",
      };
    });
}

export function gitWorktrees(root: string): { path: string; branch?: string; head: string }[] {
  const out = git(root, ["worktree", "list", "--porcelain"]) ?? "";
  return out
    .split("\n\n")
    .filter(Boolean)
    .map((block) => ({
      path: block.match(/^worktree (.+)$/m)?.[1] ?? "",
      branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1],
      head: (block.match(/^HEAD (\w+)$/m)?.[1] ?? "").slice(0, 7),
    }));
}

/** Switches branch (or creates one). Refuses when there are uncommitted changes, so nothing is lost or mixed. */
export function gitSwitch(root: string, branch: string, create: boolean): { ok: boolean; output: string } {
  if (!/^[\w./-]{1,100}$/.test(branch) || branch.startsWith("-") || branch.includes(".."))
    return { ok: false, output: "Invalid branch name" };
  if (gitChanges(root).some((c) => c.code !== "??"))
    return { ok: false, output: "Commit or save a snapshot of your changes first" };
  const proc = Bun.spawnSync(["git", "-C", root, "switch", ...(create ? ["-c"] : []), branch], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return { ok: proc.exitCode === 0, output: `${proc.stdout}${proc.stderr}`.trim() };
}

/** Per-line authorship: commit, author and time for each line of a file. */
export function gitBlame(
  root: string,
  path: string,
): { line: number; hash: string; author: string; at: number; summary: string }[] {
  const out = git(root, ["blame", "--line-porcelain", "--", path]);
  if (!out) return [];
  const lines: { line: number; hash: string; author: string; at: number; summary: string }[] = [];
  let current: { line: number; hash: string; author: string; at: number; summary: string } | undefined;
  for (const raw of out.split("\n")) {
    const head = raw.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (head) {
      current = { line: Number(head[2]), hash: head[1] as string, author: "", at: 0, summary: "" };
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("author ")) current.author = raw.slice(7);
    else if (raw.startsWith("author-time ")) current.at = Number(raw.slice(12)) * 1000;
    else if (raw.startsWith("summary ")) current.summary = raw.slice(8);
    else if (raw.startsWith("\t")) {
      lines.push(current);
      current = undefined;
    }
  }
  return lines;
}
