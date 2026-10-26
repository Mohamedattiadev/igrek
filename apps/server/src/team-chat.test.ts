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
