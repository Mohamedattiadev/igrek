import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { Settings } from "@igrek/core";
import { Bus } from "./bus";
import { CrossCheck } from "./crosscheck";
import { migrate } from "./db";

function setup(reply: string, autoSummarize = true) {
  const db = new Database(":memory:");
  migrate(db);
  const now = Date.now();
  db.query("INSERT INTO projects (id, name, path, created_at, share) VALUES ('p', 'Shop', '/a/shop', ?, 'full')").run(
    now,
  );
  const add = db.query(
    "INSERT INTO memory_items (id, project_id, section, text, created_at, author_id, author_name) VALUES (?, 'p', 'decision', ?, ?, ?, ?)",
  );
  add.run("mine", "Prices are stored as floats", now, null, null);
  add.run("theirs", "Prices are stored as integer cents", now, "u-kerim", "Kerim");
  const prompts: string[] = [];
  const check = new CrossCheck(
    db,
    new Bus(),
    () => ({ autoSummarize, language: "tr" }) as Settings,
    "/tmp",
    async (prompt) => {
      prompts.push(prompt);
      return reply;
    },
  );
  const row = () =>
    db.query("SELECT status, conflict_with, conflict_reason, dirty FROM memory_items WHERE id = 'theirs'").get();
  return { check, prompts, row };
}

describe("cross-person conflicts", () => {
  test("a teammate's decision that contradicts yours is flagged and shared back", async () => {
    const { check, prompts, row } = setup('{"contradicts": "mine", "reason": "Fiyat biçimi farklı"}');
    expect(await check.check("p", "theirs")).toBe(true);
    expect(prompts[0]).toContain("[mine]");
    expect(prompts[0]).not.toContain("[theirs]");
    expect(row()).toEqual({
      status: "conflict",
      conflict_with: "mine",
      conflict_reason: "Fiyat biçimi farklı",
      dirty: 1,
    });
  });

  test("no contradiction, an unknown id, or background AI turned off changes nothing", async () => {
    for (const [reply, auto] of [
      ['{"contradicts": null}', true],
      ['{"contradicts": "made-up"}', true],
      ['{"contradicts": "mine"}', false],
    ] as const) {
      const { check, row } = setup(reply, auto);
      expect(await check.check("p", "theirs")).toBe(false);
      expect(row()).toMatchObject({ status: "active", conflict_with: null });
    }
  });
});
