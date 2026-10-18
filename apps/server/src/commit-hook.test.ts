import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitHookState, hookScript, installCommitHook, removeCommitHook } from "./commit-hook";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "gd-hook-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", root, "-c", "user.email=t@t", "-c", "user.name=t", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
  git("init", "-q");
  writeFileSync(join(root, "app.txt"), "good\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "grep -q good app.txt" } }));
  writeFileSync(join(root, "bun.lock"), "");
  return { root, git };
}

describe("commit hook", () => {
  test("stops a commit whose checks fail and lets a good one through; removed cleanly", () => {
    const { root, git } = repo();
    expect(commitHookState(root)).toBe("none");
    expect(installCommitHook(root)).toBe("ours");
    git("add", ".");
    expect(git("commit", "-qm", "good").exitCode).toBe(0);
    writeFileSync(join(root, "app.txt"), "bad\n");
    git("add", ".");
    const blocked = git("commit", "-qm", "bad");
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.stdout.toString() + blocked.stderr.toString()).toContain("commit stopped");
    expect(removeCommitHook(root)).toBe("none");
  });

  test("another tool's hook is left alone", () => {
    const { root } = repo();
    const file = join(root, ".git/hooks/pre-commit");
    writeFileSync(file, "#!/bin/sh\nnpx lint-staged\n");
    expect(commitHookState(root)).toBe("other");
    expect(() => installCommitHook(root)).toThrow("already has a pre-commit hook");
    expect(removeCommitHook(root)).toBe("other");
  });

  test("arguments are quoted for the shell", () => {
    expect(hookScript([["npm", "run", "it's"]])).toContain(`npm run 'it'\\''s'`);
  });
});
