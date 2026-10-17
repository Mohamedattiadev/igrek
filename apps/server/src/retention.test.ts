import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { netLog, recordRequest } from "./netlog";
import { Retention } from "./retention";

describe("retention and network log", () => {
  test("old transcript copies with a summary are dropped; recent ones and summaries stay", () => {
    const dir = mkdtempSync(join(tmpdir(), "godeye-ret-"));
    const { sqlite } = openDb(":memory:");
    const now = Date.now();
    for (const [id, age, summary] of [
      ["old", 100, "{}"],
      ["old-nosummary", 100, null],
      ["new", 1, "{}"],
    ] as const) {
      sqlite
        .query("INSERT INTO sessions (id, tool, updated_at, summary) VALUES (?, 'claude', ?, ?)")
        .run(id, now - age * 86_400_000, summary);
      sqlite
        .query("INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES (?, ?, ?, 'user', 'prompt', 'hi')")
        .run(`m-${id}`, id, now);
    }
    mkdirSync(join(dir, "worktrees", "flow-gone"), { recursive: true });
    writeFileSync(join(dir, "godeye.db"), "");
    const flows = { list: () => [] } as never;
    const r = new Retention(sqlite, dir, flows, () => now + 2 * 86_400_000);
    expect(r.usage(30).prunable).toBe(1);
    const out = r.prune(30);
    expect(out.sessions).toBe(1);
    expect(out.worktrees).toBe(1);
    expect(
      (sqlite.query("SELECT session_id FROM messages ORDER BY session_id").all() as { session_id: string }[]).map(
        (m) => m.session_id,
      ),
    ).toEqual(["new", "old-nosummary"]);
    expect(sqlite.query("SELECT summary FROM sessions WHERE id = 'old'").get()).toEqual({ summary: "{}" });
  });

  test("internet addresses are counted without queries or tokens; local ones are not", () => {
    netLog.clear();
    recordRequest("https://api.osv.dev/v1/querybatch?key=secret");
    recordRequest("https://api.osv.dev/v1/querybatch");
    recordRequest("http://localhost:7777/api/x");
    recordRequest("https://api.telegram.org/bot123:ABC/sendMessage");
    expect([...netLog.keys()].sort()).toEqual(["api.osv.dev", "api.telegram.org"]);
    expect(netLog.get("api.osv.dev")).toMatchObject({ count: 2, paths: ["/v1/querybatch"] });
    expect(netLog.get("api.telegram.org")?.paths).toEqual(["/bot…/sendMessage"]);
  });
});
