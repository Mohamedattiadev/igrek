import { expect, test } from "bun:test";
import { continuation } from "./chat-routes";
import { openDb } from "./db";
import { Store } from "./store";

test("my session resumes in its folder; a teammate's goes on as a new chat with their words as context", () => {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  sqlite
    .query(
      `INSERT INTO sessions (id, tool, cwd, title, author_id, author_name) VALUES
       ('mine', 'claude', '/home/ati/shop', 'Cart', NULL, NULL), ('theirs', 'claude', '/Users/kerim/shop', 'Cart', 'u-kerim', 'Kerim')`,
    )
    .run();
  sqlite
    .query(
      `INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES
       ('m1', 'theirs', 1, 'user', 'prompt', 'Fix the coupon total'), ('m2', 'theirs', 2, 'assistant', 'text', 'Fixed in cart.ts')`,
    )
    .run();
  expect(continuation(store, undefined, undefined)).toEqual({});
  expect(continuation(store, "mine", store.sessionRow("mine"))).toEqual({ resume: "mine", cwd: "/home/ati/shop" });
  const theirs = continuation(store, "theirs", store.sessionRow("theirs"));
  // Claude's file of it is on Kerim's computer: no resume, and not their folder either.
  expect(theirs.resume).toBeUndefined();
  expect(theirs.cwd).toBeUndefined();
  expect(theirs.note).toContain("Kerim's session");
  expect(theirs.note).toContain("Kerim: Fix the coupon total\n\nClaude: Fixed in cart.ts");
  // Mine, but Claude's file of it is gone: resuming would fail, so it goes on from what was kept.
  sqlite
    .query(
      "INSERT INTO source_files (path, session_id, offset, size, mtime) VALUES ('/nowhere/mine.jsonl', 'mine', 0, 0, 0)",
    )
    .run();
  const moved = continuation(store, "mine", store.sessionRow("mine"));
  expect(moved.resume).toBeUndefined();
  expect(moved.note).toContain("no longer on this computer");
});
