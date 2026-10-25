import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { scrub } from "@igrek/core";

/**
 * Going on with a chat on another computer (asked for by the user): the same Claude Code session, the
 * same code to the last unsaved line, no new prompt and no git conflict. The computer that had it
 * packs the session's transcript, its branch and commit, and its uncommitted changes (new files too,
 * never .env files); the other one checks that it can take them without losing anything of its own,
 * puts the code in exactly the same state, places the transcript where its Claude Code looks, and the
 * chat resumes. Nothing here moves anything: the routes send the bundle through the hub or as a file.
 */
export interface HandoffBundle {
  version: 1;
  id: string;
  sessionId: string;
  title: string;
  from: string;
  at: number;
  /** The project folder on the computer that made it (the transcript names it). */
  cwd: string;
  branch: string;
  head: string;
  /** `git diff --binary HEAD`: every uncommitted change to tracked files. */
  diff: string;
  /** New files git does not ignore, base64 (no .env files, nothing over 2 MB). */
  untracked: { path: string; data: string }[];
  /** The Claude Code session file, secrets scrubbed, gzip then base64. */
  transcript: string;
  /** Commits not on any remote yet, as a git bundle (base64), so nothing has to be pushed first. */
  commits?: string;
}

export type HandoffProblem =
  | { code: "not-git" }
  | { code: "dirty"; files: string[] }
  | { code: "missing-commit"; head: string }
  | { code: "apply-failed"; detail: string }
  | { code: "file-exists"; path: string };

const ENV_FILE = /(^|\/)\.env(\..*)?$/;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_UNTRACKED = 20 * 1024 * 1024;

function git(cwd: string, args: string[], input?: string): { ok: boolean; out: string; err: string } {
  const proc = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString(), err: proc.stderr.toString().trim() };
}

/** Claude Code's folder for a project: the path with every character but letters and digits as "-". */
export function claudeFolder(projectsDir: string, cwd: string): string {
  return join(projectsDir, resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-"));
}

export function makeBundle(args: {
  id: string;
  sessionId: string;
  title: string;
  from: string;
  cwd: string;
  transcriptFile: string;
  now?: number;
}): HandoffBundle | HandoffProblem {
  const root = git(args.cwd, ["rev-parse", "--show-toplevel"]);
  if (!root.ok) return { code: "not-git" };
  const branch = git(args.cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
  const head = git(args.cwd, ["rev-parse", "HEAD"]).out.trim();
  const diff = git(args.cwd, ["diff", "--binary", "HEAD"]).out;
  const untracked: HandoffBundle["untracked"] = [];
  let total = 0;
  for (const path of git(args.cwd, ["ls-files", "--others", "--exclude-standard", "-z"]).out.split("\0")) {
    if (!path || ENV_FILE.test(path)) continue;
    const full = join(args.cwd, path);
    const size = statSync(full, { throwIfNoEntry: false })?.size ?? 0;
    if (size > MAX_FILE || total + size > MAX_UNTRACKED) continue;
    total += size;
    untracked.push({ path, data: readFileSync(full).toString("base64") });
  }
  const transcript = gzipSync(scrub(readFileSync(args.transcriptFile, "utf8"))).toString("base64");
  const commits = unpushedCommits(args.cwd);
  return {
    version: 1,
    id: args.id,
    sessionId: args.sessionId,
    title: args.title,
    from: args.from,
    at: args.now ?? Date.now(),
    cwd: resolve(args.cwd),
    branch,
    head,
    diff,
    untracked,
    transcript,
    ...(commits ? { commits } : {}),
  };
}

/** Commits on no remote, packed with `git bundle` (it records which remote commits they need). */
function unpushedCommits(cwd: string): string | undefined {
  if (
    !git(cwd, ["rev-list", "--count", "HEAD", "--not", "--remotes"])
      .out.trim()
      .match(/^[1-9]/)
  )
    return undefined;
  const dir = mkdtempSync(join(tmpdir(), "igrek-commits-"));
  try {
    const file = join(dir, "commits.bundle");
    // With no remote at all, the whole history goes (a project that was never pushed anywhere).
    const hasRemote = git(cwd, ["remote"]).out.trim() !== "";
    const made = git(cwd, ["bundle", "create", file, "HEAD", ...(hasRemote ? ["--not", "--remotes"] : [])]);
    return made.ok ? readFileSync(file).toString("base64") : undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The commits that came with the bundle, taken in (only objects: no branch or file changes). */
function fetchBundled(bundle: HandoffBundle, cwd: string): void {
  if (!bundle.commits) return;
  const dir = mkdtempSync(join(tmpdir(), "igrek-commits-"));
  try {
    const file = join(dir, "commits.bundle");
    writeFileSync(file, Buffer.from(bundle.commits, "base64"));
    git(cwd, ["fetch", "--quiet", file, "HEAD"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** This computer's own unsaved work, put aside with `git stash` (git stash pop brings it back). */
export function stashChanges(cwd: string, label: string): boolean {
  return git(cwd, ["stash", "push", "--include-untracked", "--message", label]).ok;
}

/** What would happen here, before anything is touched. */
export function checkBundle(bundle: HandoffBundle, cwd: string): { ok: true; fetched: boolean } | HandoffProblem {
  if (!git(cwd, ["rev-parse", "--show-toplevel"]).ok) return { code: "not-git" };
  const dirty = git(cwd, ["status", "--porcelain", "-z"])
    .out.split("\0")
    .filter(Boolean)
    .map((l) => l.slice(3));
  if (dirty.length) return { code: "dirty", files: dirty.slice(0, 20) };
  let fetched = false;
  if (!git(cwd, ["cat-file", "-e", `${bundle.head}^{commit}`]).ok) {
    // Only fetching, never pulling or merging: the commit may simply not be here yet, or came along.
    // The remotes first: the commits that came along build on what is there.
    git(cwd, ["fetch", "--all", "--quiet"]);
    if (!git(cwd, ["cat-file", "-e", `${bundle.head}^{commit}`]).ok) fetchBundled(bundle, cwd);
    fetched = true;
    if (!git(cwd, ["cat-file", "-e", `${bundle.head}^{commit}`]).ok)
      return { code: "missing-commit", head: bundle.head };
  }
  for (const f of bundle.untracked) if (existsSync(join(cwd, f.path))) return { code: "file-exists", path: f.path };
  return { ok: true, fetched };
}

/**
 * The code exactly as it was there: the same commit on a branch of the same name (moved forward when
 * it was only behind; a new igrek/continue-… branch when it has commits of its own, so none of them is
 * touched), then the uncommitted changes and new files on top.
 */
export function applyCode(bundle: HandoffBundle, cwd: string): { branch: string } | HandoffProblem {
  const ready = checkBundle(bundle, cwd);
  if (!("ok" in ready)) return ready;
  const branch = checkoutBranch(bundle, cwd);
  if (typeof branch !== "string") return branch;
  if (bundle.diff.trim()) {
    const applied = git(cwd, ["apply", "--binary", "--whitespace=nowarn", "-"], bundle.diff);
    if (!applied.ok) return { code: "apply-failed", detail: applied.err.slice(0, 500) };
  }
  for (const f of bundle.untracked) {
    const full = join(cwd, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(f.data, "base64"));
  }
  return { branch };
}

/** The bundle's commit checked out, on the branch it was on when that is safe, else on a new one. */
function checkoutBranch(bundle: HandoffBundle, cwd: string): string | HandoffProblem {
  const local = git(cwd, ["rev-parse", "--verify", "--quiet", `refs/heads/${bundle.branch}`]).out.trim();
  const fresh = `igrek/continue-${bundle.id.slice(0, 8)}`;
  const failed = (step: string): HandoffProblem => ({ code: "apply-failed", detail: step });
  // Detached there, or this computer's branch of that name has commits of its own: a new branch.
  if (bundle.branch === "HEAD" || (local && local !== bundle.head && !isAncestor(cwd, local, bundle.head)))
    return git(cwd, ["checkout", "-b", fresh, bundle.head]).ok ? fresh : failed("checkout");
  if (!local) return git(cwd, ["checkout", "-b", bundle.branch, bundle.head]).ok ? bundle.branch : failed("checkout");
  // Only behind: it moves forward, nothing of its own is lost.
  if (!git(cwd, ["checkout", bundle.branch]).ok) return failed("checkout");
  if (local !== bundle.head && !git(cwd, ["merge", "--ff-only", "--quiet", bundle.head]).ok)
    return failed("fast-forward");
  return bundle.branch;
}

function isAncestor(cwd: string, older: string, newer: string): boolean {
  return git(cwd, ["merge-base", "--is-ancestor", older, newer]).ok;
}

/** The transcript where this computer's Claude Code looks for it, with the other computer's folder renamed. */
export function placeTranscript(bundle: HandoffBundle, cwd: string, projectsDir: string): string {
  const text = gunzipSync(Buffer.from(bundle.transcript, "base64")).toString("utf8");
  const here = resolve(cwd);
  // Inside JSON a path is escaped the same way on both sides; replacing the whole folder string is enough.
  const moved = bundle.cwd === here ? text : text.split(bundle.cwd).join(here);
  const folder = claudeFolder(projectsDir, here);
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${bundle.sessionId}.jsonl`);
  writeFileSync(file, moved);
  return file;
}

/** Bundles split to fit the hub's events (512 KB each, with room for encryption). */
const PART_SIZE = 300 * 1024;

export function toParts(bundle: HandoffBundle): string[] {
  const text = gzipSync(JSON.stringify(bundle)).toString("base64");
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += PART_SIZE) parts.push(text.slice(i, i + PART_SIZE));
  return parts;
}

export function fromParts(parts: string[]): HandoffBundle {
  return JSON.parse(gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8")) as HandoffBundle;
}
