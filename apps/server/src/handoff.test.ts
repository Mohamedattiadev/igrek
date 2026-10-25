import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCode,
  checkBundle,
  claudeFolder,
  fromParts,
  type HandoffBundle,
  makeBundle,
  placeTranscript,
  stashChanges,
  toParts,
} from "./handoff";

function sh(cwd: string, ...args: string[]): string {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr}`);
  return p.stdout.toString().trim();
}

/** A shared repository with two computers' clones of it, A ahead of B by one pushed commit. */
function twoComputers() {
  const base = mkdtempSync(join(tmpdir(), "igrek-handoff-"));
  const origin = join(base, "origin.git");
  sh(base, "init", "--bare", "-b", "main", origin);
  const a = join(base, "a", "shop");
  const b = join(base, "b", "work", "shop");
  mkdirSync(join(base, "a"), { recursive: true });
  mkdirSync(join(base, "b", "work"), { recursive: true });
  sh(base, "clone", origin, a);
  writeFileSync(join(a, "app.ts"), "export const a = 1;\n");
  writeFileSync(join(a, ".gitignore"), "node_modules\n");
  sh(a, "add", ".");
  sh(a, "commit", "-m", "first");
  sh(a, "push", "origin", "main");
  sh(base, "clone", origin, b);
  // A goes on: a pushed commit B has not fetched, then work not committed yet.
  writeFileSync(join(a, "app.ts"), "export const a = 2;\n");
  sh(a, "commit", "-am", "second");
  sh(a, "push", "origin", "main");
  writeFileSync(join(a, "app.ts"), "export const a = 3; // not committed\n");
  mkdirSync(join(a, "src"));
  writeFileSync(join(a, "src", "cart.ts"), "export const cart = [];\n");
  writeFileSync(join(a, ".env"), "TOKEN=never-leaves\n");
  const transcript = join(base, "session.jsonl");
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: "user", cwd: a, message: { content: `edit ${a}/app.ts` } })}\n${JSON.stringify({ type: "assistant", cwd: a, message: { content: "done" } })}\n`,
  );
  return { base, a, b, transcript };
}

const bundleOf = (a: string, transcript: string) => {
  const made = makeBundle({
    id: "abcdef1234",
    sessionId: "sess-1",
    title: "Cart",
    from: "laptop",
    cwd: a,
    transcriptFile: transcript,
  });
  if (!("version" in made)) throw new Error(JSON.stringify(made));
  return made;
};

describe("going on with a chat on another computer", () => {
  test("the code ends up exactly as it was, the commit is fetched, .env stays, the session is placed", () => {
    const { a, b, transcript, base } = twoComputers();
    const bundle = bundleOf(a, transcript);
    expect(bundle.untracked.map((f) => f.path)).toEqual(["src/cart.ts"]);
    expect(checkBundle(bundle, b)).toEqual({ ok: true, fetched: true });
    expect(applyCode(bundle, b)).toEqual({ branch: "main" });
    expect(readFileSync(join(b, "app.ts"), "utf8")).toBe("export const a = 3; // not committed\n");
    expect(readFileSync(join(b, "src", "cart.ts"), "utf8")).toBe("export const cart = [];\n");
    expect(existsSync(join(b, ".env"))).toBe(false);
    expect(sh(b, "rev-parse", "HEAD")).toBe(sh(a, "rev-parse", "HEAD"));
    // Same diff on both computers: nothing differs, so nothing can conflict.
    expect(sh(b, "diff", "HEAD")).toBe(sh(a, "diff", "HEAD"));

    const projects = join(base, "claude-projects");
    const file = placeTranscript(bundle, b, projects);
    expect(file).toBe(join(claudeFolder(projects, b), "sess-1.jsonl"));
    const text = readFileSync(file, "utf8");
    expect(text).toContain(b);
    expect(text).not.toContain(a);
  });

  test("this computer's own unsaved work is never overwritten: it says which files", () => {
    const { a, b, transcript } = twoComputers();
    writeFileSync(join(b, "app.ts"), "mine\n");
    expect(checkBundle(bundleOf(a, transcript), b)).toEqual({ code: "dirty", files: ["app.ts"] });
  });

  test("a branch of the same name with its own commits stays; the work goes on a new branch", () => {
    const { a, b, transcript } = twoComputers();
    writeFileSync(join(b, "other.ts"), "x\n");
    sh(b, "add", ".");
    sh(b, "commit", "-m", "b's own");
    const before = sh(b, "rev-parse", "main");
    const result = applyCode(bundleOf(a, transcript), b);
    expect(result).toEqual({ branch: "igrek/continue-abcdef12" });
    expect(sh(b, "rev-parse", "main")).toBe(before);
    expect(readFileSync(join(b, "app.ts"), "utf8")).toBe("export const a = 3; // not committed\n");
  });

  test("commits that were never pushed come along in the bundle: nothing has to be pushed first", () => {
    const { a, b, transcript } = twoComputers();
    writeFileSync(join(a, "app.ts"), "export const a = 4;\n");
    sh(a, "commit", "-am", "not pushed");
    writeFileSync(join(a, "app.ts"), "export const a = 5; // not committed\n");
    const bundle = bundleOf(a, transcript);
    expect(bundle.commits).toBeDefined();
    expect(applyCode(bundle, b)).toEqual({ branch: "main" });
    expect(sh(b, "rev-parse", "HEAD")).toBe(sh(a, "rev-parse", "HEAD"));
    expect(readFileSync(join(b, "app.ts"), "utf8")).toBe("export const a = 5; // not committed\n");
  });

  test("a commit that is nowhere to be found is named, and nothing is changed", () => {
    const { a, b, transcript } = twoComputers();
    const bundle = { ...bundleOf(a, transcript), head: "0123456789abcdef0123456789abcdef01234567", commits: undefined };
    const head = sh(b, "rev-parse", "HEAD");
    expect(checkBundle(bundle, b)).toEqual({ code: "missing-commit", head: bundle.head });
    expect(sh(b, "rev-parse", "HEAD")).toBe(head);
  });

  test("this computer's unsaved work can be put aside first, and comes back with git stash pop", () => {
    const { a, b, transcript } = twoComputers();
    writeFileSync(join(b, "app.ts"), "mine\n");
    expect(stashChanges(b, "igrek: before hand-off")).toBe(true);
    expect(applyCode(bundleOf(a, transcript), b)).toEqual({ branch: "main" });
    expect(sh(b, "stash", "list")).toContain("igrek: before hand-off");
  });

  test("a bundle survives being cut into the hub's parts", () => {
    const { a, transcript } = twoComputers();
    const bundle: HandoffBundle = { ...bundleOf(a, transcript), diff: "x".repeat(900_000) };
    const parts = toParts(bundle);
    expect(fromParts(parts)).toEqual(bundle);
  });
});
