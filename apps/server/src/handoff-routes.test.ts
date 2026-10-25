import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { Bus } from "./bus";
import { openDb } from "./db";
import type { HandoffBundle } from "./handoff";
import { Handoffs, partsWithSum, registerHandoffRoutes } from "./handoff-routes";

function sh(cwd: string, ...args: string[]): void {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  if (p.exitCode !== 0) throw new Error(p.stderr.toString());
}

/** One computer: its own Igrek (database, hand-offs) and its clone of the shared repository. */
function computer(base: string, name: string, origin: string) {
  const path = join(base, name, "shop");
  mkdirSync(join(base, name), { recursive: true });
  sh(base, "clone", "-q", origin, path);
  const { sqlite } = openDb(":memory:");
  sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'shop', ?, 1)").run(path);
  const handoffs = new Handoffs(join(base, name, "handoffs"), new Bus());
  const app = new Hono();
  const sent: { parts: string[]; sum: string }[] = [];
  const claude = join(base, name, "claude-projects");
  registerHandoffRoutes(app, {
    db: sqlite,
    handoffs,
    projectPath: () => path,
    send: async (_p, _id, parts, sum) => {
      sent.push({ parts, sum });
      return true;
    },
    claudeProjects: () => [claude],
  });
  const call = (url: string, body?: unknown, method = "POST") =>
    app.request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { path, sqlite, handoffs, call, sent, claude };
}

describe("hand-off routes", () => {
  test("a chat goes from one computer to the other as a file, and the chat can resume there", async () => {
    const base = mkdtempSync(join(tmpdir(), "igrek-handoff-r-"));
    const origin = join(base, "origin.git");
    sh(base, "init", "-q", "--bare", "-b", "main", origin);
    const seed = join(base, "seed");
    sh(base, "clone", "-q", origin, seed);
    writeFileSync(join(seed, "app.ts"), "1\n");
    sh(seed, "add", ".");
    sh(seed, "commit", "-qm", "first");
    sh(seed, "push", "-q", "origin", "main");
    const a = computer(base, "a", origin);
    const b = computer(base, "b", origin);

    writeFileSync(join(a.path, "app.ts"), "2, not committed\n");
    const transcript = join(base, "s.jsonl");
    writeFileSync(transcript, `${JSON.stringify({ cwd: a.path, text: "hi" })}\n`);
    a.sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, cwd, title, started_at, updated_at) VALUES ('s1', 'p1', 'claude', ?, 'Cart', 1, 1)",
      )
      .run(a.path);
    a.sqlite
      .query("INSERT INTO source_files (path, session_id, offset, size, mtime) VALUES (?, 's1', 0, 0, 0)")
      .run(transcript);

    const file = (await (await a.call("/api/sessions/s1/elsewhere", { via: "file" })).json()) as HandoffBundle;
    expect(file.title).toBe("Cart");
    const item = (await (await b.call("/api/handoffs", file)).json()) as { id: string; changes: number };
    expect(item.changes).toBe(1);
    expect((await b.call(`/api/handoffs/${item.id}/check`, { projectId: "p1" })).status).toBe(200);
    const done = (await (await b.call(`/api/handoffs/${item.id}/continue`, { projectId: "p1" })).json()) as {
      projectId: string;
      sessionId: string;
      branch: string;
    };
    expect(done).toEqual({ projectId: "p1", sessionId: "s1", branch: "main" });
    expect(readFileSync(join(b.path, "app.ts"), "utf8")).toBe("2, not committed\n");
    const folders = readdirSync(b.claude);
    expect(readFileSync(join(b.claude, folders[0] ?? "", "s1.jsonl"), "utf8")).toContain(b.path);
    expect((await (await b.call("/api/handoffs", undefined, "GET")).json()) as unknown[]).toEqual([]);

    // Through the hub the same bundle travels in parts.
    expect((await a.call("/api/sessions/s1/elsewhere", { via: "team" })).status).toBe(200);
    expect(a.sent).toHaveLength(1);
  });

  test("parts arriving in any order make the bundle; a wrong checksum is dropped", () => {
    const base = mkdtempSync(join(tmpdir(), "igrek-handoff-p-"));
    const handoffs = new Handoffs(join(base, "h"), new Bus());
    const bundle = {
      version: 1,
      id: "bundle01",
      sessionId: "s",
      title: "t",
      from: "x",
      at: 1,
      cwd: "/a",
      branch: "main",
      head: "h",
      diff: "d".repeat(700_000),
      untracked: [],
      transcript: "",
    } as HandoffBundle;
    const { parts, sum } = partsWithSum(bundle);
    expect(parts.length).toBeGreaterThan(0);
    const order = parts.map((_, i) => i).reverse();
    for (const i of order)
      handoffs.receivePart("p1", { id: "bundle01", i, n: parts.length, sum, data: parts[i] ?? "" });
    expect(handoffs.list().map((h) => h.id)).toEqual(["bundle01"]);
    handoffs.receivePart("p1", { id: "bundle02", i: 0, n: 1, sum: "wrong", data: parts[0] ?? "" });
    expect(handoffs.list().map((h) => h.id)).toEqual(["bundle01"]);
  });
});
