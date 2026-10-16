import type { CommitItem, GitInfo } from "@godeye/core";

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
