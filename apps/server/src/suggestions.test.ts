import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { hasTests, projectGaps } from "./suggestions";

const folder = () => mkdtempSync(join(tmpdir(), "igrek-gaps-"));

describe("what a project lacks (plan.md 19.8)", () => {
  test("tests are found a few folders deep, in node_modules never", () => {
    const root = folder();
    mkdirSync(join(root, "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "node_modules", "x", "a.test.js"), "");
    expect(hasTests(root)).toBe(false);
    mkdirSync(join(root, "src", "cart"), { recursive: true });
    writeFileSync(join(root, "src", "cart", "total.spec.ts"), "");
    expect(hasTests(root)).toBe(true);
    const py = folder();
    writeFileSync(join(py, "test_app.py"), "");
    expect(hasTests(py)).toBe(true);
  });

  test("no tests, no README, cards waiting for review and open errors are each one gap", () => {
    const root = folder();
    const { sqlite } = openDb(":memory:");
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'shop', ?, 1)").run(root);
    expect(projectGaps(sqlite, "p", root)).toEqual([{ kind: "tests" }, { kind: "readme", missing: true }]);
    writeFileSync(join(root, "README.md"), "# shop");
    writeFileSync(join(root, "a.test.ts"), "");
    sqlite
      .query(
        "INSERT INTO board_tasks (id, project_id, title, description, status, ord, created_at, updated_at) VALUES ('t', 'p', 'x', '', 'review', 1, 1, 1)",
      )
      .run();
    sqlite
      .query(
        `INSERT INTO app_error_groups (id, project_id, fingerprint, message, count, first_at, last_at, urls, browsers, status)
         VALUES ('e', 'p', 'f', 'TypeError', 3, 1, 2, '[]', '[]', 'open')`,
      )
      .run();
    expect(projectGaps(sqlite, "p", root)).toEqual([
      { kind: "cards", count: 1 },
      { kind: "errors", count: 1 },
    ]);
  });
});
