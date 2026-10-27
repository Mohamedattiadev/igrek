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
  const call = (url: string, body?: unknown) =>
    app.request(url, {
      method: body === undefined ? "GET" : "POST",
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
