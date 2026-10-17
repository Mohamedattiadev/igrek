import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Board } from "./board";
import { Bus } from "./bus";
import { openDb } from "./db";
import { importCards, mapStatus, parseCsv, readImport } from "./imports";
import { Store } from "./store";

describe("imports", () => {
  test("CSV with quotes, commas and line breaks inside fields", () => {
    expect(parseCsv('Summary,Description,Status\n"Login, again","Line one\nline ""two""",Done\nNext,,To Do\n')).toEqual(
      [
        { Summary: "Login, again", Description: 'Line one\nline "two"', Status: "Done" },
        { Summary: "Next", Description: "", Status: "To Do" },
      ],
    );
  });

  test("states of other tools map to the four columns", () => {
    expect(["Done", "Closed", "In Progress", "In Review", "Backlog", "Todo", "Canceled"].map(mapStatus)).toEqual([
      "done",
      "done",
      "doing",
      "review",
      "todo",
      "todo",
      "done",
    ]);
  });

  test("Trello, Jira, Linear, Notion and GitHub projects", () => {
    const trello = JSON.stringify({
      lists: [
        { id: "l1", name: "Doing" },
        { id: "l2", name: "Old", closed: true },
      ],
      cards: [
        { name: "Pay page", desc: "Stripe", idList: "l1", shortUrl: "https://trello.com/c/x" },
        { name: "Archived", idList: "l1", closed: true },
        { name: "In a closed list", idList: "l2" },
      ],
    });
    expect(readImport("trello", trello)).toEqual([
      { title: "Pay page", description: "Stripe\n\nhttps://trello.com/c/x", status: "doing", origin: "trello Doing" },
    ]);
    expect(
      readImport("jira", "Issue key,Summary,Status,Description\nSHOP-7,Fix cart,In Progress,Empty cart crashes\n")[0],
    ).toEqual({
      title: "Fix cart",
      description: "Empty cart crashes\n\nJira: SHOP-7",
      status: "doing",
      origin: "jira SHOP-7",
    });
    expect(readImport("linear", "ID,Title,Status\nENG-3,Dark mode,Done\n")[0]).toMatchObject({
      title: "Dark mode",
      status: "done",
      origin: "linear ENG-3",
    });
    expect(readImport("notion", "Name,Status,Owner,Due\nWrite docs,Not started,Ada,2026-11-01\n")[0]).toEqual({
      title: "Write docs",
      description: "Owner: Ada\nDue: 2026-11-01",
      status: "todo",
      origin: "notion",
    });
    const gh = JSON.stringify({
      items: [
        {
          status: "In Progress",
          content: { title: "API v2", body: "Plan", url: "https://github.com/me/x/issues/4", number: 4 },
        },
      ],
    });
    expect(readImport("github", gh)[0]).toMatchObject({ title: "API v2", status: "doing", origin: "github #4" });
  });

  test("cards keep their column without starting the team; a repeated import adds nothing twice", () => {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const projectId = store.addProject(mkdtempSync(join(tmpdir(), "godeye-imp-")));
    const started: string[] = [];
    const board = new Board(sqlite, new Bus(), { start: () => started.push("run") } as never);
    const cards = readImport("linear", "ID,Title,Status\nENG-1,A,In Progress\nENG-2,B,Todo\n");
    expect(importCards(board, projectId, cards)).toEqual({ added: 2, skipped: 0 });
    expect(importCards(board, projectId, cards)).toEqual({ added: 0, skipped: 2 });
    expect(
      board
        .list(projectId)
        .map((t) => `${t.title}:${t.status}`)
        .sort(),
    ).toEqual(["A:doing", "B:todo"]);
    expect(started).toEqual([]);
  });
});

describe("demo project", () => {
  test("a real git repo with history, a failing-on-purpose function, wiki, cards, memory and a milestone", async () => {
    const { createDemo } = await import("./demo");
    const { Docs } = await import("./docs");
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const home = mkdtempSync(join(tmpdir(), "godeye-home-"));
    const board = new Board(sqlite, new Bus(), { start: () => ({ id: "x" }) } as never);
    const docs = new Docs(sqlite, store, new Bus(), { list: () => [] } as never, async () => "");
    const milestones: string[] = [];
    const { projectId, path } = createDemo(
      { store, docs, board, addMilestone: (_p, title) => milestones.push(title) },
      undefined,
      "tr",
      home,
    );
    expect(path).toBe(join(home, "Projects", "godeye-demo"));
    const log = Bun.spawnSync(["git", "-C", path, "log", "--format=%s"]).stdout.toString().trim().split("\n");
    expect(log).toEqual(["Add tests", "Mark todos as done", "Start the todo API"]);
    expect(
      docs
        .pages(projectId)
        .map((p) => p.title)
        .sort(),
    ).toEqual(["Başlarken", "Mimari"]);
    expect(board.list(projectId)).toHaveLength(3);
    expect(
      store
        .memoryForPrompt(projectId)
        .map((m) => m.section)
        .sort(),
    ).toEqual(["convention", "decision", "issue"]);
    expect(milestones).toEqual(["Demo v1"]);
    const second = createDemo({ store, docs, board, addMilestone: () => undefined }, undefined, "en", home);
    expect(second.path).toBe(join(home, "Projects", "godeye-demo-2"));
    // The demo's own tests pass.
    const test = Bun.spawnSync([process.execPath, "test"], { cwd: path, stdout: "pipe", stderr: "pipe" });
    expect(test.exitCode).toBe(0);
  });
});
