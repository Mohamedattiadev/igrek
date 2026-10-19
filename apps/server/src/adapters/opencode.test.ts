import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeArgs } from "../terminal-routes";
import { opencodeAdapter, parseOpencodeSession } from "./opencode";
import { emptyState } from "./types";

const FIXTURE = join(import.meta.dir, "../fixtures/opencode-session.json");

/** The tables Igrek reads, with the columns opencode 1.18 has (the rest are left out). */
function fakeDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, directory TEXT NOT NULL, title TEXT NOT NULL,
            time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)`);
  db.run(`CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL,
            time_updated INTEGER NOT NULL, data TEXT NOT NULL)`);
  db.run(`CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
            time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL)`);
  return db;
}

describe("opencode adapter", () => {
  test("replays a session in the format opencode 1.18 stores", async () => {
    const state = emptyState();
    const messages = parseOpencodeSession(state, await Bun.file(FIXTURE).text());
    expect(state.cwd).toBe("/work/demo");
    expect(state.title).toBe("Health route");
    // What opencode added itself (synthetic parts) is not what the user typed.
    expect(state.firstPrompt).toBe("Add a health route");
    expect(state.userMessages).toBe(1);
    expect(state.assistantMessages).toBe(3);
    expect(state.toolCalls).toBe(4);
    expect(state.toolErrors).toBe(2);
    expect(state.tokensIn).toBe(1200);
    // Reasoning tokens count as output.
    expect(state.tokensOut).toBe(120);
    expect(state.tokensCacheRead).toBe(6000);
    expect(state.tokensCacheWrite).toBe(300);
    expect(state.contextTokens).toBe(6500);
    expect(state.models["big-pickle"]).toBe(3);
    expect(state.filesTouched).toEqual(["/work/demo/src/health.ts"]);
    expect(state.packages).toEqual([{ manager: "npm", name: "hono" }]);
    expect(state.unverifiedClaims).toHaveLength(1);
    expect(state.startedAt).toBe(1792402188823);
    expect(messages.map((m) => m.kind)).toEqual([
      "prompt",
      "tool",
      "error",
      "tool",
      "tool",
      "error",
      "text",
      "tool",
      "error",
    ]);
    expect(messages.at(-1)?.text).toBe("Rate limit reached");
  });

  test("lists top-level sessions from the SQLite file and reads one back", () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-opencode-"));
    try {
      const path = join(dir, "opencode.db");
      const db = fakeDb(path);
      db.run("INSERT INTO session VALUES ('ses_a', NULL, '/work/demo', 'Demo', 1000, 2000)");
      db.run("INSERT INTO session VALUES ('ses_child', 'ses_a', '/work/demo', 'Sub-agent', 1500, 1600)");
      db.run(`INSERT INTO message VALUES ('msg_1', 'ses_a', 1100, 1100, '{"role":"user","time":{"created":1100}}')`);
      db.run(`INSERT INTO part VALUES ('prt_1', 'msg_1', 'ses_a', 1100, 3000, '{"type":"text","text":"Hello"}')`);
      const adapter = opencodeAdapter(path);
      const [file, ...rest] = adapter.listFiles();
      expect(rest).toEqual([]);
      expect(file).toMatchObject({ sessionId: "opencode-ses_a", path: `${path}#ses_a`, size: 1, mtime: 3000 });

      const state = emptyState();
      const messages = adapter.parseFile(state, adapter.readFile?.(file as never) ?? "", "opencode-ses_a");
      expect(state.cwd).toBe("/work/demo");
      expect(messages).toEqual([{ id: "msg_1", ts: 1100, role: "user", kind: "prompt", text: "Hello" }]);

      // A part added while opencode runs changes what the indexer compares.
      db.run(`INSERT INTO part VALUES ('prt_2', 'msg_1', 'ses_a', 1200, 3100, '{"type":"text","text":"More"}')`);
      expect(adapter.listFiles()[0]).toMatchObject({ size: 2, mtime: 3100 });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a missing database means no sessions, not an error", () => {
    expect(opencodeAdapter("/nonexistent/opencode.db").listFiles()).toEqual([]);
  });

  test("sessions reopen with opencode's own flags", () => {
    expect(resumeArgs("opencode", "opencode-ses_a", false)).toEqual(["--session", "ses_a"]);
    expect(resumeArgs("opencode", "opencode-ses_a", true)).toEqual(["--session", "ses_a", "--fork"]);
  });
});
