import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { check, RULES, readBaseline, schemaViolations } from "./db-check";

describe("database gate", () => {
  test("a careless table breaks the schema rules", () => {
    const db = new Database(":memory:");
    db.run(`CREATE TABLE notes (id TEXT PRIMARY KEY, project_id TEXT, body, createdAt TEXT, made_at TEXT);
            CREATE TABLE log (line TEXT);
            CREATE INDEX notes_a ON notes(project_id); CREATE INDEX notes_b ON notes(project_id, made_at);`);
    const found = schemaViolations(db);
    expect(found).toContain("pk-not-null:notes.id");
    expect(found).toContain("reference-fk:notes.project_id");
    expect(found).toContain("typed-columns:notes.body");
    expect(found).toContain("typed-columns:notes.made_at");
    expect(found).toContain("snake-case:notes.createdAt");
    expect(found).toContain("pk-required:log");
    expect(found).toContain("duplicate-index:notes.notes_a");
  });

  test("a lookup column without an index is caught", () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE a (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT REFERENCES b(id))");
    expect(schemaViolations(db)).toEqual(["reference-index:a.owner_id"]);
  });

  test("every known violation has a written reason", () => {
    const base = readBaseline();
    for (const v of base.violations) {
      const rule = v.split(":")[0] ?? "";
      expect(RULES[rule]).toBeDefined();
      expect(base.reasons[rule]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  // The ratchet: nothing new, nothing fixed but still listed, no shipped migration edited.
  test("God Eye's schema, queries and migrations keep the rules", () => {
    expect(check()).toEqual({ added: [], fixed: [], edited: [], unlocked: 0 });
  });
});
