import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type EmbedderStatus } from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import type { Embed } from "./embedder";
import { Lessons } from "./lessons";
import { Library } from "./library";
import { Store } from "./store";

const offline: Embed = {
  status: (): EmbedderStatus => ({ state: "missing", model: "x", sizeMb: 1 }),
  ready: () => false,
  embed: async () => [],
};

function setup(reply: (prompt: string) => string) {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "godeye-lessons-"));
  const projectId = store.addProject(dir);
  const library = new Library(sqlite, new Bus(), join(dir, ".lib"), offline);
  const prompts: string[] = [];
  const lessons = new Lessons(
    sqlite,
    store,
    new Bus(),
    new StopRegistry(),
    () => DEFAULT_SETTINGS,
    dir,
    library,
    offline,
    async (p) => {
      prompts.push(p);
      return reply(p);
    },
  );
  const session = (id: string, at: number, messages: [string, string, string][]) => {
    sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at) VALUES (?, ?, 'claude', 'work', ?, ?)",
      )
      .run(id, projectId, at - 1000, at);
    messages.forEach(([role, kind, text], i) => {
      sqlite
        .query("INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES (?, ?, ?, ?, ?, ?)")
        .run(`${id}-${i}`, id, at - 900 + i, role, kind, text);
    });
  };
  return { sqlite, store, projectId, library, lessons, prompts, session };
}

const MIGRATION_LESSON =
  '{"lesson":{"title":"Migration ran on the live database","what":"A schema change was run straight on the real data and broke the users table.","why":"No copy was tested first.","fix":"Restored from the backup.","prevent":"Before changing the schema, run the migration on a copy of the database first."}}';

describe("lessons book", () => {
  test("a failed test in a finished session becomes a lesson; the same mistake again is a repeat", async () => {
    const { lessons, prompts, session, projectId } = setup(() => MIGRATION_LESSON);
    const now = Date.now();
    session("s1", now - 20 * 60_000, [
      ["user", "prompt", "add an age column"],
      ["assistant", "error", "bun test\n(fail) users > keeps old rows\n 3 pass\n 1 fail"],
      ["assistant", "text", "Restoring from the backup and rerunning."],
    ]);
    // Still active: not scanned until it has been quiet for 10 minutes.
    session("s2", now - 60_000, [["assistant", "error", "error TS2322: Type 'x' is not assignable"]]);
    expect(lessons.scanSessions(now)).toBe(1);
    expect(lessons.scanSessions(now)).toBe(0);
    expect(await lessons.processCandidates()).toBe(1);
    expect(prompts[0]).toContain("(fail) users > keeps old rows");
    expect(prompts[0]).toContain("Restoring from the backup");

    const [lesson] = lessons.list({ projectId });
    expect(lesson).toMatchObject({
      kind: "test",
      title: "Migration ran on the live database",
      repeats: 1,
      source: "session:s1:s1-1",
    });

    // The user says it's wrong somewhere else, and the write-up is the same mistake: a repeat, not a new lesson.
    lessons.capture({ projectId, kind: "wrong", source: "session:s9:m1", detail: "USER: bu yanlış, tabloyu bozdun" });
    await lessons.processCandidates();
    expect(lessons.list({ projectId })).toHaveLength(1);
    expect(lessons.list({ projectId })[0]?.repeats).toBe(2);
  });

  test("lessons come back before similar work, and only then", async () => {
    const { lessons, projectId } = setup(() => "");
    await lessons.add({
      projectId,
      title: "Migration ran on the live database",
      what: "The users table broke.",
      prevent: "Before changing the schema, run the migration on a copy of the database first.",
    });
    const context = await lessons.promptContext("Add a phone column to the users table with a migration", projectId);
    expect(context).toContain("run the migration on a copy");
    expect(await lessons.promptContext("Make the login button blue", projectId)).toBeUndefined();
    expect(lessons.list({ projectId })[0]?.uses).toBe(1);
  });

  test("a repeated lesson becomes a rule in the project memory", async () => {
    const { lessons, projectId, store } = setup(() => "");
    const l = await lessons.add({
      projectId,
      title: "Forgot the PATH",
      prevent: "Export PATH with bun before running the tests.",
    });
    const again = await lessons.add({
      projectId,
      title: "Forgot the PATH",
      prevent: "Export PATH with bun before running the tests.",
    });
    expect(again.id).toBe(l.id);
    expect(again.repeats).toBe(2);
    lessons.makeRule(l.id, "project", () => undefined);
    expect(lessons.get(l.id)?.status).toBe("rule");
    expect(
      store.listMemory(projectId, false).some((m) => m.section === "convention" && m.text.includes("Export PATH")),
    ).toBe(true);
  });

  test("reverted commits and restored checkpoints are caught", async () => {
    const { lessons, sqlite, projectId } = setup(() => '{"lesson": null}');
    sqlite
      .query(
        "INSERT INTO commits (project_id, hash, author, subject, at, files) VALUES (?, 'abc', 'me', 'Revert \"Add cache\"', ?, 2)",
      )
      .run(projectId, Date.now());
    expect(lessons.scanCommits()).toBe(1);
    lessons.checkpointRestored(projectId, "cp1", "an AI turn", ["src/a.ts"]);
    lessons.toolFailed(projectId, "test", "bun test", "1 fail", 1);
    // The model said there's nothing to learn: no lesson is written.
    expect(await lessons.processCandidates(10)).toBe(0);
    expect(lessons.list({ projectId })).toEqual([]);
  });
});
