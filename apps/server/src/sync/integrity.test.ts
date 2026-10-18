import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hub } from "../../../hub/src/hub";
import { createHubServer } from "../../../hub/src/server";
import { Bus } from "../bus";
import { migrate } from "../db";
import { Sync } from "./client";
import { encodeInvite } from "./crypto";

const dir = mkdtempSync(join(tmpdir(), "igrek-chain-"));
const hub = new Hub(join(dir, "hub.db"));
const handler = createHubServer(hub);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const hubUrl = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

function device(name: string) {
  const db = new Database(":memory:");
  migrate(db);
  return { db, sync: new Sync(db, new Bus(), join(dir, `${name}.json`), () => name) };
}

async function until(check: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

const memory = (db: Database, id: string, text: string) => {
  const now = Date.now();
  db.query(
    "INSERT INTO memory_items (id, project_id, section, text, created_at, updated_at) VALUES (?, 'p', 'decision', ?, ?, ?)",
  ).run(id, text, now, now);
};
const has = (db: Database, id: string) => !!db.query("SELECT 1 FROM memory_items WHERE id = ?").get(id);

describe("event chain integrity", () => {
  const a = device("ayse");
  const b = device("bora");

  test("each event links to the one before it", async () => {
    await hub.createUser({ username: "ayse", password: "ayse-password-1", role: "admin", mustChange: false });
    await a.sync.connect({ hub: hubUrl, username: "ayse", password: "ayse-password-1" });
    a.db
      .query(
        "INSERT INTO projects (id, name, path, identity, created_at, share) VALUES ('p', 'Shop', '/a/shop', 'github.com/a/shop', ?, 'summary')",
      )
      .run(Date.now());
    memory(a.db, "k1", "Use Postgres");
    memory(a.db, "k2", "Money is stored in cents");
    memory(a.db, "k3", "Tests run in CI");
    await until(() => a.sync.status().connected);
    await a.sync.flush();
    await until(
      () => (hub.db.query("SELECT COUNT(*) AS n FROM events WHERE kind = 'memory'").get() as { n: number }).n === 3,
    );
    const chain = hub.db.query("SELECT n, prev FROM events WHERE kind = 'memory' ORDER BY n").all() as {
      n: number;
      prev: string;
    }[];
    expect(chain.map((e) => e.n)).toEqual([1, 2, 3]);
    expect(chain[0]?.prev).toBe("");
    expect(chain[1]?.prev).toMatch(/^[0-9a-f]{32}$/);
  });

  test("an event the hub lost is noticed, and the sender sends its state again", async () => {
    // The hub loses the middle event before Bora joins.
    hub.db.query("DELETE FROM events WHERE kind = 'memory' AND n = 2").run();
    const decisions: string[] = [];
    b.sync.onTeammateDecision = (_project, id) => decisions.push(id);
    await hub.createUser({ username: "bora", password: "temp-password-1", role: "member" });
    await b.sync.connect({
      invite: encodeInvite({ hub: hubUrl, username: "bora", password: "temp-password-1", key: a.sync.teamKey() ?? "" }),
      newPassword: "bora-password-1",
    });
    await until(() => has(b.db, "k3"));
    // The hole is filled by Ayşe's resend, then closed by her "resent" marker.
    await until(() => has(b.db, "k2"));
    await until(() => b.sync.integrity().missing === 0);
    expect(b.sync.integrity().broken).toBe(0);
    // Each new teammate decision is handed to the cross-person conflict check once.
    expect(decisions.sort()).toEqual(["k1", "k2", "k3"]);
  });

  test("an event missed on the way is fetched again from the hub", async () => {
    // Bora's device drops one event as it arrives (a flaky connection).
    const apply = b.sync.applyEvents.bind(b.sync);
    let dropped = false;
    b.sync.applyEvents = async (project, events, options) => {
      const kept = events.filter((e) => {
        if (!dropped && !options?.repair && e.kind === "memory") {
          dropped = true;
          return false;
        }
        return true;
      });
      return apply(project, kept, options);
    };
    memory(a.db, "k4", "Use feature flags");
    await a.sync.flush();
    memory(a.db, "k5", "Deploy on Tuesdays");
    await a.sync.flush();
    await until(() => has(b.db, "k5"));
    await until(() => has(b.db, "k4"));
    expect(dropped).toBe(true);
    expect(b.sync.integrity().missing).toBe(0);
  });
});
