import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectListItem } from "@godeye/core";
import { AiComments, draftFor, findAiComments } from "./aicomments";

describe("AI comments", () => {
  test("finds requests and questions in any comment style, and ignores ordinary comments", () => {
    const text = [
      "const a = 1; // ai: make this a constant in config!",
      "# cache the result ai!",
      "-- why is this slow ai?",
      "/* ai, rename this to total! */",
      "// plain note about the API",
      "const ai = 'ai!';",
    ].join("\n");
    expect(findAiComments("x.ts", text)).toEqual([
      { file: "x.ts", line: 1, ask: "make this a constant in config", kind: "change" },
      { file: "x.ts", line: 2, ask: "cache the result", kind: "change" },
      { file: "x.ts", line: 3, ask: "why is this slow", kind: "question" },
      { file: "x.ts", line: 4, ask: "rename this to total", kind: "change" },
    ]);
    expect(draftFor({ file: "x.ts", line: 2, ask: "cache it", kind: "change" })).toContain("remove that comment");
    expect(draftFor({ file: "x.ts", line: 2, ask: "neden yavaş", kind: "question" }, "tr")).toContain(
      "hiçbir şeyi değiştirme",
    );
  });

  test("only changed files of active git projects are read, and a removed comment leaves the inbox", () => {
    const dir = mkdtempSync(join(tmpdir(), "godeye-aic-"));
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
    git("init", "-q");
    writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "first");
    writeFileSync(join(dir, "a.ts"), "export const x = 1; // ai: add a test for x!\n");
    const project = { id: "p", name: "demo", path: dir, hidden: false, lastActivity: Date.now() } as ProjectListItem;
    const watcher = new AiComments(() => [project]);
    watcher.scan();
    expect(watcher.notices()).toHaveLength(1);
    expect(watcher.notices()[0]).toMatchObject({ kind: "aiComment", detail: "a.ts:1 add a test for x" });
    expect(watcher.notices()[0]?.link).toStartWith("/c/new?project=p&draft=");
    writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
    watcher.scan();
    expect(watcher.notices()).toEqual([]);
  });
});
