import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorktree, mergeWorktree, removeWorktree, workFolder, worktreeDiff } from "./worktrees";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "igrek-wt-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "one\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  return dir;
}

describe("auto-mode sandbox (worktrees)", () => {
  test("the agent works in its own copy; your folder is untouched until you merge", () => {
    const dir = repo();
    const wt = createWorktree(dir, "abc123", mkdtempSync(join(tmpdir(), "igrek-wts-")));
    expect(wt?.branch).toBe("igrek/auto-abc123");
    expect(wt?.baseBranch).toBe("main");
    if (!wt) return;
    writeFileSync(join(workFolder(wt), "a.txt"), "one\ntwo\n");
    writeFileSync(join(workFolder(wt), "b.txt"), "new\n");
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("one\n");
    const diff = worktreeDiff(wt);
    expect(diff.files.map((f) => f.path).sort()).toEqual(["a.txt", "b.txt"]);
    expect(diff.patch).toContain("+two");
    expect(mergeWorktree(dir, wt, "Add two").merged).toBe(true);
    expect(readFileSync(join(dir, "a.txt"), "utf8")).toBe("one\ntwo\n");
    removeWorktree(dir, wt);
    const branches = Bun.spawnSync(["git", "-C", dir, "branch"]).stdout.toString();
    expect(branches).not.toContain("igrek/auto");
  });

  test("not a git repo: no copy", () => {
    expect(createWorktree(mkdtempSync(join(tmpdir(), "igrek-nogit-")), "x", tmpdir())).toBeUndefined();
  });
});
