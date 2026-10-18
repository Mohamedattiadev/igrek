import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkpointChanges, createCheckpoint, listCheckpoints, restoreCheckpoint } from "./checkpoints";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "godeye-ckpt-repo-"));
  const run = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "ignore" })
      .stdout.toString()
      .trim();
  run("init", "-q");
  run("config", "user.email", "t@t");
  run("config", "user.name", "t");
  writeFileSync(join(root, ".gitignore"), "secret.env\n");
  writeFileSync(join(root, "app.ts"), "v1");
  run("add", ".");
  run("commit", "-qm", "init");
  return { root, run };
}

describe("checkpoints", () => {
  test("checkpoints taken before the rename to Igrek are still listed and restorable", () => {
    const { root, run } = repo();
    const old = createCheckpoint(root, "old one");
    expect(old).toBeDefined();
    const ref = run("for-each-ref", "--format=%(refname)", "refs/igrek/checkpoints/");
    run("update-ref", ref.replace("refs/igrek/", "refs/godeye/"), ref);
    run("update-ref", "-d", ref);
    const [listed] = listCheckpoints(root);
    expect(listed?.label).toBe("old one");
    writeFileSync(join(root, "app.ts"), "changed");
    expect(restoreCheckpoint(root, listed?.id ?? "").ok).toBe(true);
    expect(readFileSync(join(root, "app.ts"), "utf8")).toBe("v1");
  });

  test("snapshot and restore bring back edits, deleted and new files — without touching git history", () => {
    const { root, run } = repo();
    writeFileSync(join(root, "draft.md"), "untracked work");
    writeFileSync(join(root, "secret.env"), "KEY=1");
    const status = run("status", "--porcelain");
    const head = run("rev-parse", "HEAD");

    const checkpoint = createCheckpoint(root, "before AI turn");
    expect(checkpoint).toBeDefined();
    // Taking a checkpoint changes nothing visible.
    expect(run("status", "--porcelain")).toBe(status);
    expect(run("rev-parse", "HEAD")).toBe(head);

    // The "AI" edits, deletes and adds files.
    writeFileSync(join(root, "app.ts"), "broken");
    Bun.spawnSync(["rm", join(root, "draft.md")]);
    writeFileSync(join(root, "junk.ts"), "new");
    expect(checkpointChanges(root, checkpoint?.id ?? "").sort()).toEqual(["app.ts", "draft.md", "junk.ts"]);

    const result = restoreCheckpoint(root, checkpoint?.id ?? "");
    expect(result.ok).toBe(true);
    expect(readFileSync(join(root, "app.ts"), "utf8")).toBe("v1");
    expect(readFileSync(join(root, "draft.md"), "utf8")).toBe("untracked work");
    expect(existsSync(join(root, "junk.ts"))).toBe(false);
    // Ignored files are left alone.
    expect(readFileSync(join(root, "secret.env"), "utf8")).toBe("KEY=1");
    expect(run("rev-parse", "HEAD")).toBe(head);
    // The restore itself can be undone.
    expect(result.backup).toBeDefined();
    expect(listCheckpoints(root).map((c) => c.label)).toContain("before restore");
  });

  test("no duplicate checkpoint when nothing changed", () => {
    const { root } = repo();
    const a = createCheckpoint(root, "one");
    const b = createCheckpoint(root, "two");
    expect(b?.id).toBe(a?.id);
    expect(listCheckpoints(root)).toHaveLength(1);
  });

  test("outside git it quietly does nothing", () => {
    expect(createCheckpoint(mkdtempSync(join(tmpdir(), "godeye-nogit-")), "x")).toBeUndefined();
  });
});

describe("checkpoint limits", () => {
  test("big untracked files stay out of the snapshot and survive a restore", () => {
    const { root } = repo();
    const big = join(root, "dump.bin");
    writeFileSync(big, Buffer.alloc(3 * 1024 * 1024, 1));
    const checkpoint = createCheckpoint(root, "with a big file");
    expect(checkpoint).toBeDefined();
    const id = checkpoint?.id ?? "";
    const tree = Bun.spawnSync(["git", "-C", root, "ls-tree", "-r", "--name-only", id]).stdout.toString();
    expect(tree).not.toContain("dump.bin");
    writeFileSync(join(root, "app.ts"), "changed");
    expect(restoreCheckpoint(root, id).ok).toBe(true);
    expect(readFileSync(join(root, "app.ts"), "utf8")).toBe("v1");
    expect(existsSync(big)).toBe(true);
  });

  test("a restore can itself be undone", () => {
    const { root } = repo();
    const checkpoint = createCheckpoint(root, "start");
    writeFileSync(join(root, "app.ts"), "ai work");
    const result = restoreCheckpoint(root, checkpoint?.id ?? "");
    expect(readFileSync(join(root, "app.ts"), "utf8")).toBe("v1");
    expect(result.backup).toBeDefined();
    expect(restoreCheckpoint(root, result.backup?.id ?? "").ok).toBe(true);
    expect(readFileSync(join(root, "app.ts"), "utf8")).toBe("ai work");
  });
});
