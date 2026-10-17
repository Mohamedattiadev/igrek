import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  describeScene,
  mermaidFrom,
  type SceneElement,
  sceneText,
  schemaFlowchart,
  slugify,
  wikiLinks,
} from "@godeye/core";
import { Bus } from "./bus";
import type { Databases } from "./databases";
import { openDb } from "./db";
import { Docs } from "./docs";
import { Store } from "./store";

const el = (e: Partial<SceneElement> & { id: string; type: string }): SceneElement => ({
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  ...e,
});

describe("reading a board", () => {
  test("labels, arrows between named shapes, free text, frames and hand drawing", () => {
    const s = describeScene([
      el({ id: "f", type: "frame", name: "Backend" }),
      el({ id: "a", type: "rectangle", x: 3, y: 7, frameId: "f" }),
      el({ id: "at", type: "text", text: "API", containerId: "a" }),
      el({ id: "b", type: "ellipse", x: 300 }),
      el({ id: "bt", type: "text", text: "Postgres", containerId: "b" }),
      el({ id: "l", type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: "b" } }),
      el({ id: "lt", type: "text", text: "SQL", containerId: "l" }),
      el({ id: "n", type: "text", text: "TODO: cache", x: 50, y: 200 }),
      el({ id: "d", type: "rectangle", isDeleted: true }),
      el({ id: "h", type: "freedraw" }),
    ]);
    expect(s.shapes.map((x) => `${x.kind}:${x.label}:${x.frame ?? ""}`)).toEqual([
      "rectangle:API:Backend",
      "ellipse:Postgres:",
    ]);
    expect(s.arrows).toEqual([{ from: "API", to: "Postgres", label: "SQL", kind: "arrow" }]);
    expect(s.notes.map((n) => n.text)).toEqual(["TODO: cache"]);
    expect(s.freehand).toBe(1);
    const text = sceneText(s);
    expect(text).toContain('- rectangle "API" at (0, 10) in frame "Backend"');
    expect(text).toContain('- API -> Postgres : "SQL"');
    expect(text).toContain("Hand-drawn strokes: 1");
    expect(sceneText(describeScene([]))).toBe("The board is empty.");
  });

  test("schema as a flowchart with keys and foreign key arrows; Mermaid out of an answer", () => {
    const chart = schemaFlowchart([
      { name: "users", kind: "table", columns: [{ name: "id", type: "int", nullable: false, primary: true }] },
      {
        name: "orders",
        kind: "table",
        columns: [
          { name: "id", type: "int", nullable: false, primary: true },
          { name: "user_id", type: "int", nullable: true, primary: false, references: "users.id" },
        ],
      },
      { name: "v", kind: "view", columns: [] },
    ]);
    expect(chart).toContain('users["users<br>id PK"]');
    expect(chart).toContain("orders -->|user_id| users");
    expect(chart).not.toContain(" v[");
    expect(mermaidFrom("Here:\n```mermaid\nflowchart LR\n A --> B\n```\nok")).toBe("flowchart LR\n A --> B");
    expect(mermaidFrom("no diagram")).toBeUndefined();
  });

  test("slugs and wiki links", () => {
    expect(slugify("Başlarken: Kurulum!")).toBe("baslarken-kurulum");
    expect(wikiLinks("See [[Getting started]] and [[API|the API]].")).toEqual(["getting-started", "api"]);
  });
});

describe("wiki and boards", () => {
  function setup() {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const projectId = store.addProject(mkdtempSync(join(tmpdir(), "godeye-docs-")));
    const asked: { prompt: string; images: number }[] = [];
    const docs = new Docs(
      sqlite,
      store,
      new Bus(),
      { list: () => [] } as unknown as Databases,
      async (prompt, images) => {
        asked.push({ prompt, images: images.length });
        return "```mermaid\nflowchart LR\n A[Login] --> B[Panel]\n```\nDone.";
      },
    );
    return { sqlite, store, projectId, docs, asked };
  }

  test("pages: unique titles, backlinks, missing links, related memory", () => {
    const { sqlite, projectId, docs } = setup();
    sqlite
      .query(
        "INSERT INTO memory_items (id, project_id, section, text, created_at, status) VALUES ('m1', ?, 'decision', 'Deploy goes through the staging server first', 1, 'active')",
      )
      .run(projectId);
    const deploy = docs.savePage(projectId, {
      title: "Deploy",
      body: "How we deploy to the staging server and production.",
    });
    docs.savePage(projectId, { title: "Home", body: "Start with [[Deploy]] and [[Monitoring]]." });
    expect(() => docs.savePage(projectId, { title: "deploy", body: "" })).toThrow("already exists");
    const ctx = docs.context(deploy.id);
    expect(ctx.backlinks.map((b) => b.title)).toEqual(["Home"]);
    expect(ctx.memory.map((m) => m.id)).toEqual(["m1"]);
    const home = docs.pages(projectId).find((p) => p.title === "Home");
    expect(docs.context(home?.id ?? "").missing).toEqual(["monitoring"]);
    expect(docs.search(projectId, "staging")[0]?.title).toBe("Deploy");
    docs.removePage(deploy.id);
    expect(docs.pages(projectId).map((p) => p.title)).toEqual(["Home"]);
  });

  test("boards keep versions and restore them; the AI gets structure and picture; tidy returns Mermaid", async () => {
    const { projectId, docs, asked } = setup();
    const board = docs.createBoard(projectId, { title: "Flow", category: "security" });
    const scene = (n: number) =>
      JSON.stringify({
        elements: Array.from({ length: n }, (_, i) => ({
          id: `r${i}`,
          type: "rectangle",
          x: i * 100,
          y: 0,
          width: 50,
          height: 50,
        })),
      });
    docs.saveBoard(board.id, { scene: scene(2) });
    docs.saveBoard(board.id, { scene: scene(14) }); // a big change keeps the 2-element state
    expect(docs.versions(board.id).map((v) => v.elements)).toEqual([2]);
    docs.restoreVersion(board.id, docs.versions(board.id)[0]?.id ?? "");
    expect(docs.board(board.id).elements).toBe(2);
    expect(docs.versions(board.id).map((v) => v.elements)).toEqual([14, 2]);
    expect(docs.boards(projectId, "security")).toHaveLength(1);
    const r = await docs.askBoard(board.id, "tidy", "iVBOR", "tr");
    expect(r.mermaid).toBe("flowchart LR\n A[Login] --> B[Panel]");
    expect(asked[0]?.images).toBe(1);
    expect(asked[0]?.prompt).toContain('- rectangle "(no text)" at (100, 0)');
    expect(asked[0]?.prompt).toContain('language with code "tr"');
    await expect(docs.askBoard(board.id, "explain", undefined, "en", undefined, [])).rejects.toThrow("empty");
  });

  test("a teammate's newer page wins, an older one is ignored; sent rows are no longer dirty", () => {
    const { projectId, docs } = setup();
    const page = docs.savePage(projectId, { title: "Notes", body: "mine" });
    docs.apply(
      "wiki",
      projectId,
      { id: page.id, title: "Notes", body: "older", updatedAt: page.updatedAt - 10 },
      "Kerem",
    );
    expect(docs.page(page.id)?.body).toBe("mine");
    docs.apply(
      "wiki",
      projectId,
      { id: page.id, title: "Notes", body: "theirs", updatedAt: page.updatedAt + 10 },
      "Kerem",
    );
    expect(docs.page(page.id)).toMatchObject({ body: "theirs", author: "Kerem" });
    expect(docs.dirtyPages(projectId)).toHaveLength(0);
    docs.apply("board", projectId, { id: "b1", title: "Theirs", scene: '{"elements":[]}', updatedAt: 5 }, "Kerem");
    expect(docs.boards(projectId).map((b) => b.title)).toEqual(["Theirs"]);
  });
});
