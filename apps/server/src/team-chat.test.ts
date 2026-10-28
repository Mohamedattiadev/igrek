import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { Board } from "./board";
import { BoardAuto, taskMark } from "./board-auto";
import { Bus } from "./bus";
import { openDb } from "./db";
import type { Sync } from "./sync/client";
import { asksIgrek, Chat, channelId, taskEvent } from "./team-chat";
import { registerTeamChatRoutes } from "./team-chat-routes";

function setup() {
  const { sqlite } = openDb(":memory:");
  sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'shop', '/tmp/shop', 1)").run();
  const bus = new Bus();
  const chat = new Chat(sqlite, bus);
  const flowsStarted: string[] = [];
  const board = new Board(sqlite, bus, { start: () => flowsStarted.push("run") && { id: "run" } } as never);
  const kerim = { id: "u-kerim", username: "kerim", displayName: "Kerim", role: "member" as const };
  const sync = {
    sharedProjectIds: () => ["p1"],
    identity: () => ({ id: "u-ati", name: "Ati" }),
    mentionsIn: async (text: string) => (text.includes("@kerim") ? [kerim.id] : []),
    memberList: () => [kerim],
    flush: async () => undefined,
  } as unknown as Sync;
  const app = new Hono();
  registerTeamChatRoutes(app, {
    db: sqlite,
    chat,
    board,
    sync,
    projects: () => [{ id: "p1", name: "shop" }],
    language: () => "en",
    runnerDir: "/tmp",
    stops: new Map() as never,
  });
  const call = (url: string, body?: unknown, method?: string) =>
    app.request(url, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { sqlite, chat, board, call, flowsStarted };
}

describe("team chat", () => {
  test("a shared project has #general, new channels join it, and names are cleaned like Slack's", async () => {
    const { call } = setup();
    const made = (await (
      await call("/api/chat/channels", { projectId: "p1", name: "Release Notes!", topic: "1.2" })
    ).json()) as {
      id: string;
    };
    expect(made.id).toBe("p1:release-notes");
    const list = (await (await call("/api/chat/channels")).json()) as { id: string; name: string; topic: string }[];
    expect(list.map((c) => c.name)).toEqual(["general", "release-notes"]);
    expect(list[1]?.topic).toBe("1.2");
  });

  test("replies stay in their thread, the channel shows the count and who wrote last", async () => {
    const { call } = setup();
    const general = encodeURIComponent(channelId("p1", "general"));
    const root = (await (
      await call(`/api/chat/channels/${general}/messages`, { text: "Who looks at the cart?" })
    ).json()) as {
      id: string;
    };
    await call(`/api/chat/channels/${general}/messages`, { text: "Me", parentId: root.id });
    await call(`/api/chat/channels/${general}/messages`, { text: "Thanks", parentId: root.id });
    const top = (await (await call(`/api/chat/channels/${general}/messages`)).json()) as {
      replies: number;
      author: string;
    }[];
    expect(top).toHaveLength(1);
    expect(top[0]?.replies).toBe(2);
    expect(top[0]?.author).toBe("Ati");
    const thread = (await (await call(`/api/chat/channels/${general}/messages?thread=${root.id}`)).json()) as {
      text: string;
    }[];
    expect(thread.map((m) => m.text)).toEqual(["Me", "Thanks"]);
  });

  test("reactions: one per kind and person, a second tap takes mine back, teammates' arrive and leave", async () => {
    const { call, chat } = setup();
    const general = encodeURIComponent(channelId("p1", "general"));
    const msg = (await (await call(`/api/chat/channels/${general}/messages`, { text: "Shipped" })).json()) as {
      id: string;
    };
    expect((await call(`/api/chat/messages/${msg.id}/react`, { reaction: "wave" })).status).toBe(400);
    await call(`/api/chat/messages/${msg.id}/react`, { reaction: "like" });
    chat.applyReaction({ messageId: msg.id, reaction: "like", at: 2 }, { id: "u-kerim", name: "Kerim" });
    chat.applyReaction({ messageId: msg.id, reaction: "celebrate", at: 3 }, { id: "u-kerim", name: "Kerim" });
    chat.applyReaction({ messageId: "not-here", reaction: "like", at: 3 }, { id: "u-kerim", name: "Kerim" });
    let shown = chat.message(msg.id)?.reactions;
    expect(shown).toEqual([
      { reaction: "like", count: 2, mine: true, names: ["Kerim", "Ati"] },
      { reaction: "celebrate", count: 1, mine: false, names: ["Kerim"] },
    ]);
    // Mine goes out once; taken back, it goes out again as removed and is then gone.
    const [out] = chat.unsentReactions("p1");
    expect(out).toMatchObject({ messageId: msg.id, reaction: "like", removed: false });
    chat.markReactionSent(out?.messageId ?? "", "like", out?.at ?? 0);
    expect(chat.unsentReactions("p1")).toEqual([]);
    await call(`/api/chat/messages/${msg.id}/react`, { reaction: "like" });
    const [back] = chat.unsentReactions("p1");
    expect(back?.removed).toBe(true);
    chat.applyReaction({ messageId: msg.id, reaction: "celebrate", removed: true }, { id: "u-kerim", name: "Kerim" });
    shown = chat.message(msg.id)?.reactions;
    expect(shown).toEqual([{ reaction: "like", count: 1, mine: false, names: ["Kerim"] }]);
  });

  test("the timeline puts sessions, commits, cards and messages of shared projects in one list, newest first", async () => {
    const { call, sqlite, board } = setup();
    const now = Date.now();
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p2', 'private', '/tmp/p2', 1)").run();
    sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, updated_at, author_id, author_name) VALUES ('s1', 'p1', 'claude', 'Fix the cart', ?, 'u-kerim', 'Kerim'), ('s2', 'p2', 'claude', 'Not shared', ?, NULL, NULL)",
      )
      .run(now - 3000, now);
    sqlite
      .query(
        "INSERT INTO commits (project_id, hash, author, subject, at) VALUES ('p1', 'abc', 'kerim', 'Cart fixed', ?)",
      )
      .run(now - 2000);
    const card = board.add({ projectId: "p1", title: "Coupons", description: "", origin: "chat" });
    sqlite.query("UPDATE board_tasks SET updated_at = ? WHERE id = ?").run(now - 1000, card.id);
    await call(`/api/chat/channels/${encodeURIComponent(channelId("p1", "general"))}/messages`, {
      text: "Done?\nmore",
    });
    const items = (await (await call("/api/team/timeline")).json()) as { kind: string; who: string; title: string }[];
    expect(items.map((i) => i.kind)).toEqual(["message", "task", "commit", "session"]);
    expect(items[0]?.title).toBe("Done?");
    expect(items[3]).toMatchObject({ who: "Kerim", title: "Fix the cart" });
  });

  test("unread messages say who wrote them, and opening the channel clears the count at once", async () => {
    const { call, sqlite, chat } = setup();
    const id = channelId("p1", "general");
    sqlite
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read)
         VALUES ('k1', 'p1', 'channel', ?, 'u-kerim', 'Kerim', 'hi', '[]', 1, 0), ('k2', 'p1', 'channel', ?, 'u-kerim', 'Kerim', 'there', '[]', 2, 0)`,
      )
      .run(id, id);
    expect(chat.channels([{ id: "p1", name: "shop" }])[0]).toMatchObject({ unread: 2, unreadFrom: ["Kerim"] });
    await call(`/api/chat/channels/${encodeURIComponent(id)}/messages`);
    expect(chat.channels([{ id: "p1", name: "shop" }])[0]).toMatchObject({ unread: 0, unreadFrom: [] });
  });

  test("the company's work view has every card of the shared projects and this week's commits and sessions per person", async () => {
    const { call, sqlite, board } = setup();
    const now = Date.now();
    board.add({ projectId: "p1", title: "Coupons", description: "", origin: "chat" });
    sqlite
      .query(
        "INSERT INTO commits (project_id, hash, author, subject, at) VALUES ('p1', 'a', 'Kerim', 'one', ?), ('p1', 'b', 'Kerim', 'two', ?), ('p1', 'c', 'Kerim', 'old', 1)",
      )
      .run(now, now);
    sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, updated_at, author_id, author_name) VALUES ('s1', 'p1', 'claude', ?, 'u-kerim', 'Kerim'), ('s2', 'p1', 'claude', ?, NULL, NULL)",
      )
      .run(now, now);
    const work = (await (await call("/api/team/work")).json()) as {
      tasks: { title: string }[];
      week: { who: string; commits: number; sessions: number }[];
      me: string;
    };
    expect(work.tasks.map((x) => x.title)).toEqual(["Coupons"]);
    expect(work.week).toEqual([
      { who: "Kerim", commits: 2, sessions: 1 },
      { who: "", commits: 0, sessions: 1 },
    ]);
    expect(work.me).toBe("Ati");
  });

  test("@ai is noticed anywhere in a message, not inside a word or an address", () => {
    expect(asksIgrek("@ai what changed this week?")).toBe(true);
    expect(asksIgrek("can you check @Igrek")).toBe(true);
    expect(asksIgrek("mail me at kerim@ai.example")).toBe(false);
    expect(asksIgrek("@aisha can you look")).toBe(false);
  });

  test("a message becomes a card for the teammate it names, without starting a team of experts", async () => {
    const { call, board, flowsStarted } = setup();
    const general = encodeURIComponent(channelId("p1", "general"));
    const msg = (await (
      await call(`/api/chat/channels/${general}/messages`, { text: "@kerim fix the cart total" })
    ).json()) as {
      id: string;
    };
    const card = (await (await call(`/api/chat/messages/${msg.id}/task`, { assignee: "u-kerim" })).json()) as {
      id: string;
      title: string;
      assignee: { name: string };
    };
    expect(card.title).toBe("fix the cart total");
    expect(card.assignee.name).toBe("Kerim");
    expect(board.list("p1")).toHaveLength(1);
    expect(flowsStarted).toEqual([]);
    const top = (await (await call(`/api/chat/channels/${general}/messages`)).json()) as {
      task?: { id: string; title: string; status: string; assignee?: string };
      replies: number;
    }[];
    expect(top[0]?.task).toEqual({ id: card.id, title: "fix the cart total", status: "todo", assignee: "Kerim" });
    // The thread says so, in the reader's language (the page words the note).
    const thread = (await (await call(`/api/chat/channels/${general}/messages?thread=${msg.id}`)).json()) as {
      text: string;
      bot: boolean;
    }[];
    expect(thread).toEqual([expect.objectContaining({ text: taskEvent("created"), bot: true })]);
  });
});

describe("the board follows the work", () => {
  test("a chat started from the card moves it to Doing, a finished summary to Review, a commit with its mark to Done", async () => {
    const { sqlite, chat, board, call } = setup();
    const general = encodeURIComponent(channelId("p1", "general"));
    const msg = (await (
      await call(`/api/chat/channels/${general}/messages`, { text: "@kerim fix the cart total" })
    ).json()) as {
      id: string;
    };
    const card = (await (await call(`/api/chat/messages/${msg.id}/task`, { assignee: "u-kerim" })).json()) as {
      id: string;
    };
    const auto = new BoardAuto(sqlite, board, (id, status) => chat.noteTask(id, status));
    expect(auto.tick()).toBe(0);

    const now = Date.now();
    sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, title, first_prompt, started_at, updated_at) VALUES ('s1', 'p1', 'claude', 'cart', ?, ?, ?)",
      )
      .run(`fix the cart total\n\n${taskMark(card.id)}`, now, now);
    expect(auto.tick(now)).toBe(1);
    expect(board.get(card.id)?.status).toBe("doing");

    // A summary that still lists work keeps it in Doing; one with nothing left moves it on.
    const summary = (left: string[]) =>
      JSON.stringify({ title: "cart", texts: { en: { did: ["fixed"], why: "", left, risks: [] } }, generatedAt: now });
    sqlite
      .query("UPDATE sessions SET summary = ?, updated_at = ? WHERE id = 's1'")
      .run(summary(["tests"]), now - 20 * 60_000);
    expect(auto.tick(now)).toBe(0);
    sqlite.query("UPDATE sessions SET summary = ? WHERE id = 's1'").run(summary([]));
    expect(auto.tick(now)).toBe(1);
    expect(board.get(card.id)?.status).toBe("review");

    sqlite
      .query("INSERT INTO commits (project_id, hash, author, subject, at) VALUES ('p1', 'abc', 'kerim', ?, ?)")
      .run(`Cart total counts the coupon ${taskMark(card.id)}`, now);
    expect(auto.tick(now)).toBe(1);
    expect(board.get(card.id)?.status).toBe("done");
    expect(auto.tick(now)).toBe(0);

    const notes = chat.messages(channelId("p1", "general"), msg.id).map((m) => m.text);
    expect(notes).toEqual([taskEvent("created"), taskEvent("doing"), taskEvent("review"), taskEvent("done")]);
  });

  test("a card moved by hand is left where it is: only the next step is taken", () => {
    const { sqlite, chat, board } = setup();
    const card = board.add({ projectId: "p1", title: "Docs" });
    board.track(card.id, "done");
    const now = Date.now();
    sqlite
      .query(
        "INSERT INTO sessions (id, project_id, tool, first_prompt, started_at, updated_at) VALUES ('s2', 'p1', 'claude', ?, ?, ?)",
      )
      .run(`Docs ${taskMark(card.id)}`, now, now);
    expect(new BoardAuto(sqlite, board, (id, status) => chat.noteTask(id, status)).tick(now)).toBe(0);
    expect(board.get(card.id)?.status).toBe("done");
  });
});

describe("team chat like WhatsApp (plan.md 19.9)", () => {
  const general = channelId("p1", "general");
  const url = `/api/chat/channels/${encodeURIComponent(general)}`;
  const kerim = { id: "u-kerim", name: "Kerim" };
  /** A message from Kerim, as it arrives from the hub. */
  function fromKerim(sqlite: ReturnType<typeof setup>["sqlite"], id: string, text: string, at: number) {
    sqlite
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read, sent)
         VALUES (?, 'p1', 'channel', ?, 'u-kerim', 'Kerim', ?, '[]', ?, 0, 1)`,
      )
      .run(id, general, text, at);
  }

  test("a reply quotes the message it answers; one quoting a message that is not here (yet) says so", async () => {
    const { call, sqlite } = setup();
    fromKerim(sqlite, "k1", "Can you look at the cart total?", 1);
    const reply = (await (await call(`${url}/messages`, { text: "On it", quoteId: "k1" })).json()) as {
      quote: unknown;
    };
    expect(reply.quote).toEqual({ id: "k1", author: "Kerim", mine: false, text: "Can you look at the cart total?" });
    const orphan = (await (await call(`${url}/messages`, { text: "?", quoteId: "gone" })).json()) as {
      quote: unknown;
    };
    expect(orphan.quote).toEqual({ id: "gone", mine: false, text: "", missing: true });
  });

  test("my own message can be edited and deleted, a teammate's cannot; the change goes out once", async () => {
    const { call, sqlite, chat } = setup();
    fromKerim(sqlite, "k1", "hello", 1);
    const mine = (await (await call(`${url}/messages`, { text: "Shiped" })).json()) as { id: string };
    sqlite.query("UPDATE comments SET sent = 1").run();
    const edit = (id: string, text: string) => call(`/api/chat/messages/${id}`, { text }, "PATCH");
    expect((await edit(mine.id, "Shipped")).status).toBe(200);
    expect((await edit("k1", "changed")).status).toBe(403);
    expect(chat.message(mine.id)).toMatchObject({ text: "Shipped", editedAt: expect.any(Number) });
    const [out] = chat.unsentUpdates("p1");
    expect(out).toMatchObject({ id: mine.id, text: "Shipped", deleted: false });
    chat.markUpdateSent(out?.id ?? "", out?.at ?? 0);
    expect(chat.unsentUpdates("p1")).toEqual([]);
    expect(chat.remove(mine.id)).toBe(true);
    expect(chat.message(mine.id)).toMatchObject({ text: "", deleted: true });
    expect(chat.unsentUpdates("p1")[0]).toMatchObject({ deleted: true, text: "" });
  });

  test("a teammate's edit, deletion and pin arrive; only the writer may change the text, the newest change wins", () => {
    const { sqlite, chat } = setup();
    fromKerim(sqlite, "k1", "hello", 1);
    chat.applyUpdate({ id: "k1", text: "hi all", editedAt: 5, pinned: false, at: 5 }, kerim);
    expect(chat.message("k1")).toMatchObject({ text: "hi all", editedAt: 5 });
    chat.applyUpdate({ id: "k1", text: "taken over", editedAt: 6, deleted: true, pinned: true, at: 6 }, { id: "u-x" });
    expect(chat.message("k1")).toMatchObject({ text: "hi all", pinned: true });
    chat.applyUpdate({ id: "k1", text: "old", editedAt: 4, pinned: false, at: 4 }, kerim);
    expect(chat.message("k1")).toMatchObject({ text: "hi all", pinned: true });
    chat.applyUpdate({ id: "k1", deleted: true, pinned: false, at: 7 }, kerim);
    expect(chat.message("k1")).toMatchObject({ text: "", deleted: true });
    expect(chat.message("k1")?.pinned).toBeUndefined();
  });

  test("opening a channel marks where the unread ones start and tells teammates; theirs show as seen on mine", async () => {
    const { call, sqlite, chat } = setup();
    const mine = (await (await call(`${url}/messages`, { text: "Ready for review" })).json()) as { id: string };
    fromKerim(sqlite, "k1", "new one", Date.now() + 1);
    const list = (await (await call(`${url}/messages`)).json()) as { id: string; unread?: boolean }[];
    expect(list.map((m) => !!m.unread)).toEqual([false, true]);
    expect(chat.unsentSeen("p1")).toEqual([{ channelId: general, at: expect.any(Number) }]);
    // Kerim's computer says how far he read; its own project id is replaced by ours.
    chat.applySeen("p1", { channelId: "their-id:general", at: Date.now() + 10 }, kerim);
    expect(chat.message(mine.id)?.seenBy).toEqual(["Kerim"]);
    expect(chat.message("k1")?.seenBy).toBeUndefined();
  });

  test("pins for everyone, stars for me, search finds every word, forward marks the copy, mute stays here", async () => {
    const { call, chat } = setup();
    await call("/api/chat/channels", { projectId: "p1", name: "ops" });
    const a = (await (await call(`${url}/messages`, { text: "The deploy key is in the vault" })).json()) as {
      id: string;
    };
    await call(`${url}/messages`, { text: "deploy went fine" });
    await call(`/api/chat/messages/${a.id}/pin`, { on: true });
    await call(`/api/chat/messages/${a.id}/star`, { on: true });
    expect(((await (await call(`${url}/pinned`)).json()) as { id: string }[]).map((m) => m.id)).toEqual([a.id]);
    expect(((await (await call("/api/chat/starred")).json()) as { id: string }[]).map((m) => m.id)).toEqual([a.id]);
    const found = (await (await call(`${url}/search?q=${encodeURIComponent("DEPLOY vault")}`)).json()) as unknown[];
    expect(found).toHaveLength(1);
    expect(((await (await call(`${url}/search?q=100%25`)).json()) as unknown[]).length).toBe(0);
    const ops = channelId("p1", "ops");
    const copy = (await (await call(`/api/chat/messages/${a.id}/forward`, { channel: ops })).json()) as {
      channelId: string;
      forwarded: boolean;
    };
    expect(copy).toMatchObject({ channelId: ops, forwarded: true });
    await call(`${url}/mute`, { on: true });
    expect(chat.channels([{ id: "p1", name: "shop" }]).find((c) => c.id === general)?.muted).toBe(true);
  });
});
