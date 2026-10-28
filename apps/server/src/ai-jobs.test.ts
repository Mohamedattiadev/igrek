import { describe, expect, test } from "bun:test";
import { AiJobs, AnswerCache, callerKind, estimateTokens } from "./ai-jobs";
import { openDb } from "./db";
import { Store } from "./store";

describe("Igrek's own AI jobs (plan.md 19.3)", () => {
  test("each job is written down by kind; the week shows what reached Claude and what was saved", () => {
    const { sqlite } = openDb(":memory:");
    const jobs = new AiJobs(sqlite);
    const now = Date.now();
    jobs.record("summarizer", "haiku", "claude", { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 300 }, now);
    jobs.record("summarizer", "haiku", "cache", { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 }, now);
    jobs.record("team-chat-routes", "sonnet", "local", { input: 400, output: 100, cacheRead: 0, cacheWrite: 0 }, now);
    jobs.record("old", "haiku", "claude", { input: 9, output: 9, cacheRead: 0, cacheWrite: 0 }, now - 9 * 86_400_000);
    const week = jobs.since(now - 7 * 86_400_000);
    expect(week.kinds).toEqual([
      { kind: "summarizer", jobs: 2, tokens: 1500, local: 0, cached: 1 },
      { kind: "team-chat-routes", jobs: 1, tokens: 0, local: 1, cached: 0 },
    ]);
    expect(week).toMatchObject({ tokens: 1500, saved: 1700 });
  });

  test("the same small question within a day is answered from memory; the oldest answers go first", () => {
    const cache = new AnswerCache(1000, 2);
    const a = cache.key("haiku", "title this", []);
    expect(cache.key("haiku", "title this", ["--x"])).not.toBe(a);
    cache.set(a, "Checkout", 0);
    expect(cache.get(a, 500)).toBe("Checkout");
    expect(cache.get(a, 2000)).toBeUndefined();
    cache.set("1", "one", 0);
    cache.set("2", "two", 0);
    cache.set("3", "three", 0);
    expect(cache.get("1", 1)).toBeUndefined();
    expect(cache.get("3", 1)).toBe("three");
  });

  test("the kind is the file that asked, past the job runner itself", () => {
    const stack = [
      "Error",
      "    at runClaude (/app/apps/server/src/summarizer.ts:170:3)",
      "    at answer (/app/apps/server/src/team-chat-routes.ts:90:9)",
    ].join("\n");
    expect(callerKind(stack)).toBe("team-chat-routes");
    expect(callerKind("Error\n    at x (native)")).toBe("other");
    expect(estimateTokens("12345678")).toBe(2);
  });

  test("a chat Claude compacted since its last summary is summarized at once, before the quiet ones", () => {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const now = Date.now();
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'p', '/tmp/p', 1)").run();
    const add = (id: string, updated: number, messages: number, compactions: number) =>
      sqlite
        .query(
          "INSERT INTO sessions (id, project_id, tool, updated_at, user_messages, compactions) VALUES (?, 'p', 'claude', ?, ?, ?)",
        )
        .run(id, updated, messages, compactions);
    add("quiet", now - 60 * 60_000, 6, 0);
    add("busy-compacted", now - 1000, 3, 1);
    add("busy", now - 1000, 9, 0);
    expect(store.sessionsNeedingSummary(now)).toEqual(["busy-compacted", "quiet"]);
    // The usage limit nearly full: only the compacted one, whose memory would be lost.
    expect(store.sessionsNeedingSummary(now, true)).toEqual(["busy-compacted"]);
    store.saveSummary("busy-compacted", { generatedAt: now } as never, 3);
    expect(store.sessionsNeedingSummary(now)).toEqual(["quiet"]);
  });
});
