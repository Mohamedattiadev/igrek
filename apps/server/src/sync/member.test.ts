import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hub } from "../../../hub/src/hub";
import { createHubServer } from "../../../hub/src/server";
import { MemberClient, type MemberStore } from "../../../web/src/member/client";
import { Board } from "../board";
import { Bus } from "../bus";
import { migrate } from "../db";
import type { Flows } from "../flows";
import { Chat } from "../team-chat";
import { Sync } from "./client";

// A web member (plan.md 4.3) against a real hub and a real Igrek: what the browser does,
// minus the page itself. Encryption and decryption happen in the "browser" (MemberClient).
const dir = mkdtempSync(join(tmpdir(), "igrek-member-"));
const hub = new Hub(join(dir, "hub.db"));
const handler = createHubServer(hub);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const hubUrl = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

function memoryStore(): MemberStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

async function until(check: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

describe("web member", () => {
  const db = new Database(":memory:");
  migrate(db);
  const admin = new Sync(db, new Bus(), join(dir, "admin.json"), () => "admin");
  const board = new Board(db, new Bus(), {} as Flows);
  admin.board = board;
  const browser = new MemberClient(memoryStore(), hubUrl);

  test("signs in, waits for an admin's approval, then reads the team's work in the browser", async () => {
    await hub.createUser({ username: "mohamed", password: "first-password-1", role: "admin", mustChange: false });
    await admin.connect({ hub: hubUrl, username: "mohamed", password: "first-password-1" });
    await until(() => admin.status().connected);
    await hub.createUser({ username: "ayse", password: "ayse-password-1", role: "member", mustChange: false });
    const now = Date.now();
    db.query(
      "INSERT INTO projects (id, name, path, identity, created_at, share) VALUES ('p1', 'Shop', '/home/m/shop', 'github.com/m/shop', ?, 'full')",
    ).run(now);
    db.query(
      "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at, user_messages) VALUES ('s1', 'p1', 'claude', 'Add checkout', ?, ?, 2)",
    ).run(now - 1000, now);
    db.query(
      "INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES ('m1', 's1', ?, 'user', 'text', 'Add a checkout page')",
    ).run(now);
    board.add({ projectId: "p1", title: "Rate limit the login" });
    await admin.flush();

    await browser.signIn("ayse", "ayse-password-1");
    // No key yet: the browser shows who to ask, with its device's fingerprint.
    expect(browser.state.phase).toBe("waitingForKey");
    const { requests } = await admin.keyRequests();
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) await admin.approveDevice(r.deviceId).catch(() => 0);

    await browser.resume();
    expect(browser.state.phase).toBe("ready");
    await until(() => [...browser.projects.values()].some((p) => p.sessions.has("s1")));
    const shop = [...browser.projects.values()][0];
    expect(shop?.name).toBe("Shop");
    expect(shop?.sessions.get("s1")).toMatchObject({ title: "Add checkout", author: "mohamed" });
    await until(() => (shop?.messages.get("s1")?.length ?? 0) > 0);
    expect(shop?.messages.get("s1")?.[0]?.text).toBe("Add a checkout page");
    await until(() => (shop?.tasks.size ?? 0) > 0);
  });

  test("what the web member writes reaches Igrek, and the hub only stores ciphertext", async () => {
    const shop = [...browser.projects.values()][0];
    if (!shop) throw new Error("no project");
    await browser.comment(shop.key, "session", "s1", "Looks good, ship it");
    const [card] = [...shop.tasks.values()];
    await browser.claim(shop.key, card?.id ?? "", true);
    await until(() => !!db.query("SELECT 1 FROM comments WHERE text = 'Looks good, ship it'").get());
    expect(db.query("SELECT author_name FROM comments WHERE text = 'Looks good, ship it'").get()).toEqual({
      author_name: "ayse",
    });
    await until(() => board.get(card?.id ?? "")?.claimedBy?.name === "ayse");
    // A card left from the browser lands on Igrek's board, with its author.
    await browser.addTask(shop.key, "Write the release notes");
    await until(() => board.list("p1").some((t) => t.title === "Write the release notes"));
    expect(board.list("p1").find((t) => t.title === "Write the release notes")?.author).toBe("ayse");
    const stored = new Database(join(dir, "hub.db"), { readonly: true });
    const all = stored.query("SELECT data FROM events").all() as { data: string }[];
    expect(all.some((e) => e.data.includes("ship it") || e.data.includes("checkout"))).toBe(false);
  });

  test("reactions go both ways between the browser and Igrek; an edit and a deletion reach the browser", async () => {
    const chat = new Chat(db, new Bus());
    admin.chat = chat;
    const shop = [...browser.projects.values()][0];
    if (!shop) throw new Error("no project");
    const id = chat.post({
      projectId: "p1",
      channel: "p1:general",
      text: "Deploy at 5?",
      author: "mohamed",
      mentions: [],
    });
    await admin.flush();
    await until(() => shop.comments.has(id));
    // From the browser to Igrek, then taken back with a second tap.
    await browser.react(shop.key, id, "like");
    await until(() => (chat.message(id)?.reactions ?? []).length > 0);
    expect(chat.message(id)?.reactions[0]).toMatchObject({ reaction: "like", names: ["ayse"] });
    await browser.react(shop.key, id, "like");
    await until(() => (chat.message(id)?.reactions ?? []).length === 0);
    // From Igrek to the browser.
    chat.react(id, "celebrate", "mohamed");
    chat.edit(id, "Deploy at 6?");
    await admin.flush();
    await until(() => (shop.reactions.get(id)?.size ?? 0) > 0 && shop.comments.get(id)?.text === "Deploy at 6?");
    chat.remove(id);
    await admin.flush();
    await until(() => !!shop.comments.get(id)?.deleted);
    expect(shop.comments.get(id)?.text).toBe("");
  }, 30_000);
});
