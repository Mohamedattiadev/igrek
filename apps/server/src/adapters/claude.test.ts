import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyLine } from "./claude";
import { emptyState, type ParsedMessage } from "./types";

/**
 * A recorded Claude Code session (plan.md 16.4): a slice of a real transcript with tool calls, failed
 * steps and compactions, every text replaced by x's of the same length (scripts kept nothing
 * private: paths, prompts, answers and file names are gone; types, tool names, ids and token
 * counts stay). Replaying it pins down how the adapter reads the real format.
 */
describe("Claude Code adapter on a recorded session", () => {
  const state = emptyState();
  const messages: ParsedMessage[] = [];
  const lines = readFileSync(join(import.meta.dir, "../fixtures/claude-session.jsonl"), "utf8").split("\n");
  for (const [i, line] of lines.entries()) if (line) messages.push(...applyLine(state, line, `line-${i}`));

  test("counts turns, steps, failures and compactions", () => {
    expect(state).toMatchObject({
      userMessages: 5,
      assistantMessages: 53,
      toolCalls: 62,
      toolErrors: 41,
      compactions: 6,
      lastToolFailed: true,
      cwd: "/home/user/demo",
      gitBranch: "main",
    });
    expect(state.recentErrors).toHaveLength(20);
  });

  test("adds up tokens per model and keeps the context size of the last answer", () => {
    expect(state).toMatchObject({
      tokensIn: 106,
      tokensOut: 54535,
      tokensCacheRead: 14145739,
      tokensCacheWrite: 97886,
      contextTokens: 46890,
      models: { "claude-sonnet-5-5": 53 },
    });
    expect(state.usageEvents).toHaveLength(53);
  });

  test("turns the transcript into readable messages", () => {
    const roles: Record<string, number> = {};
    for (const m of messages) roles[m.role] = (roles[m.role] ?? 0) + 1;
    expect(roles).toEqual({ user: 46, assistant: 78 });
    expect(messages.every((m) => m.id && m.ts > 0)).toBe(true);
    expect(state.startedAt).toBeLessThan(state.updatedAt ?? 0);
  });
});
