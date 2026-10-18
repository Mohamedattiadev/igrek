import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { capabilitiesOf } from "@godeye/core";
import { resumeArgs } from "../terminal-routes";
import { applyPiLine, piAdapter } from "./pi";
import { emptyState, type ParsedMessage } from "./types";

const FIXTURE = join(import.meta.dir, "../fixtures/pi-session.jsonl");

describe("pi adapter", () => {
  test("replays a session written in pi's documented format", async () => {
    const state = emptyState();
    const messages: ParsedMessage[] = [];
    const lines = (await Bun.file(FIXTURE).text()).trim().split("\n");
    for (const [i, line] of lines.entries()) messages.push(...applyPiLine(state, line, `x:${i}`));
    expect(state.cwd).toBe("/work/demo");
    expect(state.title).toBe("Health route");
    expect(state.firstPrompt).toBe("Add a health route");
    expect(state.userMessages).toBe(1);
    expect(state.assistantMessages).toBe(2);
    expect(state.toolCalls).toBe(2);
    expect(state.toolErrors).toBe(1);
    expect(state.compactions).toBe(1);
    expect(state.tokensIn).toBe(1400);
    expect(state.tokensOut).toBe(320);
    expect(state.tokensCacheRead).toBe(12000);
    expect(state.contextTokens).toBe(7200);
    expect(state.models["claude-sonnet-4-5"]).toBe(2);
    expect(state.filesTouched).toEqual(["/work/demo/src/health.ts"]);
    expect(state.packages).toEqual([{ manager: "npm", name: "hono" }]);
    // "All tests pass" right after a failed step is flagged.
    expect(state.unverifiedClaims).toHaveLength(1);
    expect(messages.map((m) => m.kind)).toEqual(["prompt", "text", "tool", "tool", "error", "text"]);
    expect(messages.find((m) => m.kind === "error")?.toolName).toBe("bash");
  });

  test("finds session files and names them by id", () => {
    const root = mkdtempSync(join(tmpdir(), "gd-pi-"));
    try {
      mkdirSync(join(root, "--work-demo--"));
      writeFileSync(join(root, "--work-demo--", "2026-10-18T10-00-00_7d2f0c1e.jsonl"), "{}\n");
      writeFileSync(join(root, "--work-demo--", "notes.txt"), "");
      const files = piAdapter(root).listFiles();
      expect(files.map((f) => f.sessionId)).toEqual(["pi-7d2f0c1e"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("tool capabilities", () => {
  test("resume arguments come from the capability table", () => {
    expect(resumeArgs("claude", "abc", true)).toEqual(["--resume", "abc", "--fork-session"]);
    expect(resumeArgs("codex", "codex-abc", true)).toEqual(["resume", "abc"]);
    expect(resumeArgs("pi", "pi-abc", false)).toEqual(["--session", "abc"]);
    expect(resumeArgs("pi", "pi-abc", true)).toEqual(["--fork", "abc"]);
    expect(resumeArgs("gemini", "gemini-abc", false)).toEqual([]);
  });

  test("unknown tools can do nothing extra", () => {
    expect(capabilitiesOf("cursor")).toMatchObject({ resume: false, chat: false, sideQuestion: false });
    expect(capabilitiesOf("claude").chat).toBe(true);
  });
});
