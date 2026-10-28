import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeCard, emptyOrg, foldOrg, newCard, type OrgState } from "@igrek/core";
import { Hub } from "../../../hub/src/hub";
import { createHubServer } from "../../../hub/src/server";
import { MemberClient, type MemberStore } from "../../../web/src/member/client";
import { Bus } from "../bus";
import { migrate } from "../db";
import { Org } from "../org";
import { Sync } from "./client";

// Sync, proven (plan.md 20.10): three devices end up with the same company, whatever the order
// events arrive in, across the hub restarting and the network dropping; a lost event is noticed by
// comparing with the hub and fetched again.
const dir = mkdtempSync(join(tmpdir(), "igrek-proof-"));
const hubDb = join(dir, "hub.db");
let hub = new Hub(hubDb);
let handler = createHubServer(hub);
let server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const port = server.port;
const hubUrl = `http://127.0.0.1:${port}`;
afterAll(() => server.stop(true));

function memoryStore(): MemberStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

async function until(check: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

function igrek(name: string): { sync: Sync; org: Org } {
  const db = new Database(":memory:");
  migrate(db);
  const bus = new Bus();
  const sync = new Sync(db, bus, join(dir, `${name}.json`), () => name);
  const org = new Org({
    db,
    bus,
    me: () => sync.memberList().find((m) => m.id === sync.identity().id),
    people: () => sync.memberList(),
    hub: (path, init) => sync.hub(path, init),
    publish: (kind, id, value) => sync.publishOrg(kind, id, value),
  });
  sync.org = org;
  return { sync, org };
}

/** What two copies must agree on: every card's fields that matter, and every message. */
function fingerprint(s: OrgState): string {
  const cards = Object.values(s.cards)
    .map((c) => ({ id: c.id, title: c.title, status: c.status, assignee: c.assignee ?? "", conflict: !!c.conflict }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const posts = Object.values(s.posts)
    .map((p) => `${p.id}:${p.text}:${p.deleted ? 1 : 0}`)
    .sort();
  return JSON.stringify({ cards, posts });
}

describe("the same everywhere (plan.md 20.10)", () => {
  test("events folded in any order give the same company", () => {
    const base = newCard({ title: "Deploy", assignee: "k" }, "gm", 1000);
    const a = changeCard(base, { status: "doing" }, "k", "started", 2000);
    const b = changeCard(base, { title: "Deploy Friday" }, "gm", "renamed", 2500);
    const c = changeCard(a, { status: "done" }, "k", "done", 3000);
    const events = [base, a, b, c];
    const orders = [
      [0, 1, 2, 3],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ];
    const results = orders.map((order) => {
      const s = emptyOrg();
      for (const i of order)
        foldOrg(s, "org-card", events[i] as never, { author: (events[i] as { updatedBy: string }).updatedBy, at: 0 });
      return fingerprint(s);
    });
    expect(new Set(results).size).toBe(1);
  });

  const gm = igrek("gm");
  const kerim = igrek("kerim");
  const browser = new MemberClient(memoryStore(), hubUrl);
  const all = () => [gm.org.state, kerim.org.state, browser.org];

  test("three devices write at once and agree", async () => {
    await hub.createUser({ username: "hoca", password: "hoca-password-1", role: "admin", mustChange: false });
    await hub.createUser({ username: "kerim", password: "kerim-password-1", role: "member", mustChange: false });
    await hub.createUser({ username: "ayse", password: "ayse-password-1", role: "member", mustChange: false });
    await gm.sync.connect({ hub: hubUrl, username: "hoca", password: "hoca-password-1" });
    await until(() => gm.sync.status().connected);
    await kerim.sync.connect({ hub: hubUrl, username: "kerim", password: "kerim-password-1" });
    await browser.signIn("ayse", "ayse-password-1");
    for (const r of (await gm.sync.keyRequests()).requests) await gm.sync.approveDevice(r.deviceId).catch(() => 0);
    await browser.resume();
    await until(() => kerim.sync.status().connected && browser.state.phase === "ready");
    await Bun.sleep(3200);
    await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => gm.org.post({ channel: "general", text: `gm ${i}` })),
      ...Array.from({ length: 5 }, (_, i) => kerim.org.post({ channel: "general", text: `kerim ${i}` })),
      ...Array.from({ length: 5 }, (_, i) => browser.orgPost({ channel: "general", text: `ayse ${i}` })),
    ]);
    await until(() => all().every((s) => Object.keys(s.posts).length === 15));
    expect(new Set(all().map(fingerprint)).size).toBe(1);
  }, 40_000);

  test("the network drops, two devices change the same card, nothing is lost and both see the same", async () => {
    const card = (await gm.org.act(
      "org-card",
      newCard({ title: "Invoice PDF" }, gm.sync.identity().id ?? "") as never,
    )) as { id: string };
    await until(() => !!kerim.org.state.cards[card.id] && !!browser.org.cards[card.id]);
    const socket = kerim.sync as unknown as { close: () => void; open: () => void };
    socket.close();
    const base = gm.org.state.cards[card.id];
    if (!base) throw new Error("no card");
    await kerim.org.act(
      "org-card",
      changeCard(base, { title: "Invoice PDF and email" }, kerim.sync.identity().id ?? "", "renamed") as never,
    );
    await Bun.sleep(20);
    await gm.org.act(
      "org-card",
      changeCard(base, { status: "doing" }, gm.sync.identity().id ?? "", "started") as never,
    );
    socket.open();
    await until(() => kerim.sync.status().connected);
    await kerim.sync.flush();
    await until(() => all().every((s) => s.cards[card.id]?.history.length === 3));
    const states = all().map((s) => s.cards[card.id]);
    expect(states.every((c) => c?.status === "doing" && c?.conflict?.fields.title === "Invoice PDF and email")).toBe(
      true,
    );
    expect(new Set(all().map(fingerprint)).size).toBe(1);
  }, 40_000);

  test("the hub restarts while people write; when it is back everything arrives", async () => {
    server.stop(true);
    await Bun.sleep(300);
    await gm.org.post({ channel: "general", text: "while the hub was down (gm)" });
    await browser.orgPost({ channel: "general", text: "while the hub was down (ayse)" });
    expect(gm.org.waiting()).toBeGreaterThan(0);
    expect(browser.waiting()).toBeGreaterThan(0);
    hub = new Hub(hubDb);
    handler = createHubServer(hub);
    server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handler.fetch, websocket: handler.websocket });
    await until(() => gm.sync.status().connected && kerim.sync.status().connected, 30_000);
    await gm.sync.flush();
    await until(
      () => all().every((s) => Object.values(s.posts).filter((p) => p.text.startsWith("while the hub")).length === 2),
      30_000,
    );
    expect(gm.org.waiting()).toBe(0);
    expect(browser.waiting()).toBe(0);
    expect(new Set(all().map(fingerprint)).size).toBe(1);
  }, 60_000);

  test("the last event lost on the way is noticed by comparing with the hub and fetched again", async () => {
    // Kerim's computer misses one of the manager's messages.
    const kerimSync = kerim.sync as unknown as { receive: (raw: string) => Promise<void> };
    const receive = kerimSync.receive.bind(kerim.sync);
    let dropped = false;
    kerimSync.receive = async (raw: string) => {
      const m = JSON.parse(raw) as { op: string; events?: { kind: string }[] };
      if (!dropped && m.op === "events" && m.events?.some((e) => e.kind === "org-post")) {
        dropped = true;
        return;
      }
      return receive(raw);
    };
    const lost = (await gm.org.post({ channel: "general", text: "the one that gets lost" })) as { id: string };
    await until(() => dropped && !!browser.org.posts[lost.id]);
    kerimSync.receive = receive;
    // Nothing comes after it, so no gap in the chain gives it away: only comparing with the hub does.
    await Bun.sleep(500);
    expect(kerim.org.state.posts[lost.id]).toBeUndefined();
    const result = await kerim.sync.compare();
    expect(result.behind).toBeGreaterThan(0);
    await until(() => !!kerim.org.state.posts[lost.id]);
    expect((await kerim.sync.compare()).behind).toBe(0);
    expect(kerim.sync.status().integrity?.matches).toBe(true);
    expect((await browser.compare()).behind).toBe(0);
    expect(new Set(all().map(fingerprint)).size).toBe(1);
  }, 40_000);
});
