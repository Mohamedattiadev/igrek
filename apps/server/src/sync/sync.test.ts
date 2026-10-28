import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@igrek/core";
import { Hub } from "../../../hub/src/hub";
import { createHubServer } from "../../../hub/src/server";
import { Board } from "../board";
import { Bus, StopRegistry } from "../bus";
import { ChatFiles } from "../chat-files";
import { migrate } from "../db";
import type { Flows } from "../flows";
import { Lessons } from "../lessons";
import { Library } from "../library";
import { Store } from "../store";
import { Chat } from "../team-chat";
import { Sync } from "./client";

const dir = mkdtempSync(join(tmpdir(), "igrek-sync-"));
const hub = new Hub(join(dir, "hub.db"));
const handler = createHubServer(hub);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const hubUrl = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

function device(name: string) {
  const db = new Database(":memory:");
  migrate(db);
  const bus = new Bus();
  const sync = new Sync(db, bus, join(dir, `${name}.json`), () => name);
  const board = new Board(db, new Bus(), {} as Flows);
  sync.board = board;
  const offline = {
    status: () => ({ state: "missing" as const, model: "x", sizeMb: 1 }),
    ready: () => false,
    embed: async () => [],
  };
  const lessons = new Lessons(
    db,
    new Store(db),
    new Bus(),
    new StopRegistry(),
    () => DEFAULT_SETTINGS,
    dir,
    new Library(db, new Bus(), join(dir, `${name}-lib`), offline),
    offline,
    async () => "",
  );
  sync.lessons = lessons;
  return { db, sync, board, lessons, bus };
}

async function until(check: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

describe("team sync", () => {
  const a = device("mohamed");
  const b = device("kerim");
  let invite = "";

  test("admin connects, creates the team key and invites a member", async () => {
    await hub.createUser({ username: "mohamed", password: "first-password-1", role: "admin", mustChange: false });
    const { status, recoveryKey } = await a.sync.connect({
      hub: hubUrl,
      username: "mohamed",
      password: "first-password-1",
    });
    expect(recoveryKey).toBeTruthy();
    expect(status.user?.role).toBe("admin");
    expect(hub.keyCheck()).toMatch(/^[0-9a-f]{64}$/);
    await until(() => a.sync.status().connected);

    const user = await a.sync.admin<{ username: string }>("/users", {
      method: "POST",
      body: JSON.stringify({ username: "kerim", displayName: "Kerim", password: "temporary-pass-1" }),
    });
    expect(user.username).toBe("kerim");
    const { encodeInvite } = await import("./crypto");
    invite = encodeInvite({
      hub: hubUrl,
      username: "kerim",
      password: "temporary-pass-1",
      key: a.sync.teamKey() ?? "",
    });
  });

  test("the member must pick a new password, then joins with the team key", async () => {
    await expect(b.sync.connect({ invite })).rejects.toThrow(/new password/);
    const { status, recoveryKey } = await b.sync.connect({ invite, newPassword: "kerims-own-pass" });
    expect(recoveryKey).toBeUndefined();
    expect(status.user?.username).toBe("kerim");
    await until(() => b.sync.status().connected);
  });

  test("a wrong team key is refused", async () => {
    const c = device("mallory");
    const { decodeInvite, encodeInvite, generateTeamKey } = await import("./crypto");
    const forged = encodeInvite({ ...decodeInvite(invite), password: "kerims-own-pass", key: generateTeamKey() });
    await expect(c.sync.connect({ invite: forged })).rejects.toThrow(/doesn't match/);
  });

  test("shared sessions, messages and memory reach the teammate, scrubbed and attributed", async () => {
    const now = Date.now();
    a.db
      .query(
        "INSERT INTO projects (id, name, path, identity, created_at, share) VALUES ('p1', 'Igrek', '/home/m/igrek', 'github.com/m/igrek', ?, 'full')",
      )
      .run(now);
    a.db
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at, user_messages) VALUES ('s1', 'p1', 'claude', 'Add login', ?, ?, 2)",
      )
      .run(now - 1000, now);
    a.db
      .query("INSERT INTO messages (id, session_id, ts, role, kind, text) VALUES ('m1', 's1', ?, 'user', 'text', ?)")
      .run(now, "deploy with ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789");
    a.db
      .query(
        "INSERT INTO memory_items (id, project_id, section, text, created_at, updated_at) VALUES ('k1', 'p1', 'decision', 'Use Postgres', ?, ?)",
      )
      .run(now, now);
    // Kerim has the same repo cloned elsewhere, not shared yet.
    b.db
      .query(
        "INSERT INTO projects (id, name, path, identity, created_at) VALUES ('local-p', 'igrek', '/home/k/code/igrek', 'github.com/m/igrek', ?)",
      )
      .run(now);

    await a.sync.flush();
    await until(() => !!b.db.query("SELECT 1 FROM memory_items WHERE id = 'k1'").get());

    const session = b.db.query("SELECT project_id, title, author_name FROM sessions WHERE id = 's1'").get() as Record<
      string,
      string
    >;
    expect(session).toEqual({ project_id: "local-p", title: "Add login", author_name: "mohamed" });
    const message = b.db.query("SELECT text FROM messages WHERE id = 'm1'").get() as { text: string };
    expect(message.text).not.toContain("sk-ant-api03");
    // Receiving a shared project doesn't start sharing Kerim's own work.
    expect(b.db.query("SELECT share, team_linked FROM projects WHERE id = 'local-p'").get()).toEqual({
      share: "off",
      team_linked: 1,
    });
    expect((b.db.query("SELECT dirty FROM memory_items WHERE id = 'k1'").get() as { dirty: number }).dirty).toBe(0);
  });

  test("teammates' rows are never sent back, and edits flow both ways with last-writer-wins", async () => {
    const before = hub.stats().events;
    await b.sync.flush();
    expect(hub.stats().events).toBe(before);

    b.db
      .query("UPDATE memory_items SET text = 'Use SQLite', updated_at = ?, dirty = 1 WHERE id = 'k1'")
      .run(Date.now() + 5);
    await b.sync.flush();
    await until(
      () =>
        (a.db.query("SELECT text FROM memory_items WHERE id = 'k1'").get() as { text: string }).text === "Use SQLite",
    );
  });

  test("the task board is shared: who a card is for and who took it reach the teammate, edits come back", async () => {
    const card = a.board.add({ projectId: "p1", title: "Rate limit the login" });
    a.board.assign(card.id, { kind: "persona", id: "security", name: "Security" });
    a.board.claim(card.id, { id: "u-mohamed", name: "mohamed" });
    await a.sync.flush();
    await until(() => !!b.board.get(card.id));
    expect(b.board.get(card.id)).toMatchObject({
      projectId: "local-p",
      title: "Rate limit the login",
      assignee: { kind: "persona", id: "security", name: "Security" },
      claimedBy: { id: "u-mohamed", name: "mohamed" },
      author: "mohamed",
    });
    await Bun.sleep(5);
    b.board.update(card.id, { title: "Rate limit the login and signup" });
    await b.sync.flush();
    await until(() => a.board.get(card.id)?.title === "Rate limit the login and signup");
  });

  test("the lessons book is shared: a teammate's lesson reaches this project's AI", async () => {
    const lesson = await a.lessons.add({
      projectId: "p1",
      title: "Run migrations before the tests",
      what: "Tests failed on a missing column",
      prevent: "Run bun run migrate before bun test",
    });
    await a.sync.flush();
    await until(() => !!b.lessons.get(lesson.id));
    expect(b.lessons.get(lesson.id)).toMatchObject({
      projectId: "local-p",
      title: "Run migrations before the tests",
      author: "mohamed",
    });
    // It is part of what Kerim's AI is told before work in the project.
    expect(b.lessons.forContext("local-p").map((l) => l.id)).toContain(lesson.id);
    // Global lessons (no project) never leave the computer.
    await a.lessons.add({ projectId: null, title: "Mine only", prevent: "x" });
    await a.sync.flush();
    await Bun.sleep(200);
    expect(b.lessons.list({}).some((l) => l.title === "Mine only")).toBe(false);
  });

  test("the hub only ever sees ciphertext", () => {
    const raw = new Database(join(dir, "hub.db"), { readonly: true });
    const rows = raw.query("SELECT data FROM events").all() as { data: string }[];
    raw.close();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.data).not.toContain("Add login");
      expect(row.data).not.toContain("Postgres");
    }
  });

  test("teammates see which setting changed, never its value", async () => {
    a.db
      .query(
        "INSERT INTO env_changes (project_id, file, key, action, at) VALUES ('p1', '.env', 'STRIPE_KEY', 'changed', ?)",
      )
      .run(Date.now());
    await a.sync.envChanged("p1", { file: ".env", key: "STRIPE_KEY", action: "changed" });
    await until(() => !!b.db.query("SELECT 1 FROM env_changes WHERE key = 'STRIPE_KEY'").get());
    expect(
      b.db.query("SELECT project_id, file, action, author_name FROM env_changes WHERE key = 'STRIPE_KEY'").get(),
    ).toEqual({
      project_id: "local-p",
      file: ".env",
      action: "changed",
      author_name: "mohamed",
    });
  });

  test("a private session never goes out, and taking one back removes the teammate's copy", async () => {
    const now = Date.now();
    a.db
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at, user_messages, private) VALUES ('s-private', 'p1', 'claude', 'Secret plan', ?, ?, 2, 1)",
      )
      .run(now, now + 10);
    const before = hub.stats().events;
    await a.sync.flush();
    expect(hub.stats().events).toBe(before);
    expect(a.sync.preview("p1").privateSessions).toBe(1);
    expect(b.db.query("SELECT 1 FROM sessions WHERE id = 's1'").get()).toBeTruthy();
    await a.sync.forgetSession("p1", "s1");
    await until(() => !b.db.query("SELECT 1 FROM sessions WHERE id = 's1'").get());
  });

  test("a project you only receive sends your comments, never your own sessions", async () => {
    const now = Date.now();
    b.db
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at, user_messages) VALUES ('kerim-own', 'local-p', 'claude', 'Kerim private work', ?, ?, 3)",
      )
      .run(now - 500, now);
    b.db
      .query(
        "INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read) VALUES ('kc1', 'local-p', 'session', 's1', NULL, 'kerim', 'Nice, ship it', '[]', ?, 1)",
      )
      .run(now);
    const sessionsBefore = (
      hub.db.query("SELECT COUNT(*) AS n FROM events WHERE kind = 'session'").get() as { n: number }
    ).n;
    await b.sync.flush();
    await until(() => !!a.db.query("SELECT 1 FROM comments WHERE id = 'kc1'").get());
    expect((hub.db.query("SELECT COUNT(*) AS n FROM events WHERE kind = 'session'").get() as { n: number }).n).toBe(
      sessionsBefore,
    );
    expect(a.db.query("SELECT 1 FROM sessions WHERE id = 'kerim-own'").get()).toBeNull();
  });

  test("comments with @mentions and a prompt suggestion reach the teammate", async () => {
    const now = Date.now();
    const kerim = hub.users().find((u) => u.username === "kerim");
    const mentions = await a.sync.mentionsIn("Can you look at this @kerim?");
    expect(mentions).toEqual([kerim?.id ?? ""]);
    a.db
      .query(
        "INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read) VALUES ('c1', 'p1', 'section', 'security', NULL, 'mohamed', 'Can you look at this @kerim?', ?, ?, 1)",
      )
      .run(JSON.stringify(mentions), now);
    a.db
      .query(
        "INSERT INTO team_messages (id, kind, project_id, to_id, text, at, outgoing) VALUES ('t1', 'suggestion', 'p1', ?, 'Add a rate limit to login', ?, 1)",
      )
      .run(kerim?.id ?? "", now);
    await a.sync.flush();
    await until(() => !!b.db.query("SELECT 1 FROM comments WHERE target_id = 'security'").get());
    await until(() => !!b.db.query("SELECT 1 FROM team_messages WHERE outgoing = 0").get());
    const got = b.db.query("SELECT author_name, text FROM comments WHERE target_id = 'security'").get();
    expect(got).toEqual({ author_name: "mohamed", text: "Can you look at this @kerim?" });
    expect(b.sync.mentionNotices().length).toBe(1);
    // Your own comment never notifies you; Kerim's comment on your session (earlier test) does.
    expect(a.sync.mentionNotices().map((n) => n.id)).toEqual(["comment-kc1"]);
    const message = b.db.query("SELECT kind, text, from_name FROM team_messages WHERE outgoing = 0").get();
    expect(message).toEqual({ kind: "suggestion", text: "Add a rate limit to login", from_name: "mohamed" });
  });

  test("a team chat message reaches the teammate's channel, unread until opened", async () => {
    a.db
      .query(
        "INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read) VALUES ('ch1', 'p1', 'channel', 'p1:general', NULL, 'mohamed', 'Deploy at 5?', '[]', ?, 1)",
      )
      .run(Date.now());
    await a.sync.flush();
    await until(() => !!b.db.query("SELECT 1 FROM comments WHERE id = 'ch1'").get());
    expect(
      b.db.query("SELECT target_kind, target_id, author_name, text, read FROM comments WHERE id = 'ch1'").get(),
    ).toEqual({
      target_kind: "channel",
      target_id: "p1:general",
      author_name: "mohamed",
      text: "Deploy at 5?",
      read: 0,
    });
  });

  test("a quoted reply, an edit, a pin, a deletion, 'seen' and 'typing' reach the teammate", async () => {
    a.sync.chat = new Chat(a.db, a.bus);
    b.sync.chat = new Chat(b.db, b.bus);
    const typing: string[][] = [];
    b.bus.subscribe((e) => {
      if (e.type === "chat-changed" && e.typing) typing.push(e.typing);
    });
    // Kerim answers "Deploy at 5?" quoting it. (His copy of the project has its own id here.)
    const reply = b.sync.chat.post({
      projectId: "local-p",
      channel: "p1:general",
      text: "Yes",
      author: "kerim",
      mentions: [],
      quoteId: "ch1",
    });
    await b.sync.flush();
    await until(() => !!a.db.query("SELECT 1 FROM comments WHERE id = ?").get(reply));
    expect(a.sync.chat.message(reply)?.quote).toMatchObject({ id: "ch1", text: "Deploy at 5?", mine: true });
    // I correct my question and pin it; Kerim sees both. He opens the channel: I see he read it.
    a.sync.chat.edit("ch1", "Deploy at 6?");
    a.sync.chat.pin("ch1", true);
    await a.sync.flush();
    await until(() => b.sync.chat?.message("ch1")?.text === "Deploy at 6?");
    expect(b.sync.chat.message("ch1")).toMatchObject({ pinned: true, editedAt: expect.any(Number) });
    b.sync.chat.markRead("p1:general");
    await b.sync.flush();
    await until(() => (a.sync.chat?.message("ch1")?.seenBy ?? []).length > 0);
    // Kerim cannot delete my message for me; I can.
    b.sync.chat.applyUpdate({ id: "ch1", deleted: true, pinned: false, at: Date.now() + 1 }, { id: "someone" });
    a.sync.chat.remove("ch1");
    await a.sync.flush();
    await until(() => !!b.sync.chat?.message("ch1")?.deleted);
    await a.sync.sendTyping("p1", "p1:general");
    await until(() => typing.length > 0);
    expect(b.sync.typingIn("local-p:general")).toEqual(["mohamed"]);
  }, 30_000);

  test("a file sent in a channel reaches the teammate whole, in encrypted parts", async () => {
    const mine = new ChatFiles(join(dir, "a-files"));
    const theirs = new ChatFiles(join(dir, "b-files"));
    a.sync.files = mine;
    b.sync.files = theirs;
    a.sync.chat = new Chat(a.db, a.bus, (h) => mine.has(h));
    b.sync.chat = new Chat(b.db, b.bus, (h) => theirs.has(h));
    // 600 KB that look like a secret here and there: the parts must not be masked like text.
    const bytes = new TextEncoder().encode(`AKIA${"ABCDEFGHIJKLMNOP".repeat(40_000)}`);
    const file = mine.save(bytes, "keys-doc.txt", "text/plain");
    const id = a.sync.chat.post({
      projectId: "p1",
      channel: "p1:general",
      text: "the document",
      author: "mohamed",
      mentions: [],
      attachment: file,
    });
    await a.sync.flush();
    await until(() => !!b.sync.chat?.message(id)?.attachment?.here, 15_000);
    expect(theirs.read(file.hash)).toEqual(bytes);
    expect(b.sync.chat.message(id)?.attachment).toMatchObject({ name: "keys-doc.txt", size: bytes.length });
  }, 30_000);

  test("a direct message reaches only the teammate it is for; the hub keeps nothing it can read", async () => {
    const kerimId = b.sync.identity().id ?? "";
    const meId = a.sync.identity().id ?? "";
    await until(
      () => a.sync.memberList().some((m) => m.id === kerimId) && b.sync.memberList().some((m) => m.id === meId),
    );
    const id = a.sync.direct.post(kerimId, "Salary numbers: only for you");
    await a.sync.flush();
    await until(() => b.sync.direct.messages(meId).some((m) => m.id === id));
    expect(b.sync.direct.messages(meId).find((m) => m.id === id)).toMatchObject({
      text: "Salary numbers: only for you",
      mine: false,
      unread: true,
    });
    expect(b.sync.direct.conversations()[0]).toMatchObject({ peer: meId, unread: 1 });
    // His answer, quoting mine, comes back the same way.
    const back = b.sync.direct.post(meId, "Got it", id);
    await b.sync.flush();
    await until(() => a.sync.direct.messages(kerimId).some((m) => m.id === back));
    expect(a.sync.direct.messages(kerimId).find((m) => m.id === back)?.quote).toMatchObject({ id, mine: true });
    const stored = new Database(join(dir, "hub.db"), { readonly: true });
    const all = stored.query("SELECT data FROM events WHERE kind = 'dm'").all() as { data: string }[];
    expect(all.length).toBeGreaterThan(1);
    expect(all.some((e) => e.data.includes("Salary") || e.data.includes("Got it"))).toBe(false);
  }, 30_000);

  test("a teammate renamed on the hub is shown with the new name, on what they sent before too", async () => {
    const id = a.sync.identity().id ?? "";
    // The hub tells every open Igrek at once; no waiting for the next refresh.
    await a.sync.admin(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ displayName: "Ati" }) });
    await until(
      () =>
        (b.db.query("SELECT author_name FROM comments WHERE id = 'ch1'").get() as { author_name: string })
          .author_name === "Ati",
    );
    // My own name follows too, for what I write next.
    await until(() => a.sync.identity().name === "Ati");
  });

  test("disconnect forgets the hub and the key", async () => {
    b.sync.disconnect();
    expect(b.sync.status()).toMatchObject({ configured: false, connected: false });
    expect(b.sync.teamKey()).toBeUndefined();
  });
});
