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
} from "@igrek/core";
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

  test("concurrent edits on two computers both survive the sync", () => {
    const a = setup();
    const b = setup();
    const page = a.docs.savePage(a.projectId, { title: "Runbook", body: "Line one.\n\nLine two.\n\nLine three." });
    const sent = (docs: typeof a.docs, projectId: string) =>
      docs
        .dirtyPages(projectId)
        .map((p) => ({ id: p.id, title: p.title, body: p.body, y: p.ydoc, updatedAt: p.updated_at }));
    for (const p of sent(a.docs, a.projectId)) b.docs.apply("wiki", b.projectId, p, "Ayse");
    // Both edit at the same time, offline from each other.
    a.docs.savePage(a.projectId, {
      id: page.id,
      title: "Runbook",
      body: "Line one, edited by Ayse.\n\nLine two.\n\nLine three.",
    });
    b.docs.savePage(b.projectId, {
      id: page.id,
      title: "Runbook",
      body: "Line one.\n\nLine two.\n\nLine three, edited by Kerem.",
    });
    const fromA = sent(a.docs, a.projectId);
    const fromB = sent(b.docs, b.projectId);
    for (const p of fromB) a.docs.apply("wiki", a.projectId, p, "Kerem");
    for (const p of fromA) b.docs.apply("wiki", b.projectId, p, "Ayse");
    const expected = "Line one, edited by Ayse.\n\nLine two.\n\nLine three, edited by Kerem.";
    expect(a.docs.page(page.id)?.body).toBe(expected);
    expect(b.docs.page(page.id)?.body).toBe(expected);
  });
});

describe("incident mode", () => {
  test("evidence gathered into a timeline, the SRE reads it, notes go on, the postmortem lands in the wiki", async () => {
    const { Incidents } = await import("./incidents");
    const { AppErrors } = await import("./apperrors");
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const projectId = store.addProject(mkdtempSync(join(tmpdir(), "godeye-inc-")));
    const errors = new AppErrors(sqlite, store, new Bus());
    errors.ingest(errors.key(projectId), {
      message: "x is undefined",
      stack: "TypeError\n    at total (a.js:1:1)",
      release: "abc123",
    });
    store.saveCommits(projectId, [
      { hash: "abc1234567", author: "a", subject: "Change the cart", at: Date.now() - 3_600_000, files: 1 },
    ]);
    const asked: string[] = [];
    const docs = new Docs(sqlite, store, new Bus(), { list: () => [] } as unknown as Databases, async () => "");
    const incidents = new Incidents(
      sqlite,
      store,
      new Bus(),
      {
        monitors: { list: () => [] } as never,
        errors,
        logs: { saved: () => [] } as never,
        docs,
        personas: { get: () => undefined } as never,
      },
      async (prompt) => {
        asked.push(prompt);
        return asked.length === 1 ? "## Likely the cart change\nRoll back abc1234." : "## Summary\nThe cart broke.";
      },
    );
    const inc = await incidents.start(projectId, "Cart is broken", "en");
    expect(inc.evidence).toContain('1x "x is undefined"');
    expect(inc.evidence).toContain("abc1234 Change the cart");
    expect(inc.timeline.map((e) => e.kind)).toEqual(["commit", "error", "start"]);
    for (let i = 0; i < 50 && incidents.get(inc.id)?.analyzing; i++) await Bun.sleep(10);
    expect(incidents.get(inc.id)?.analysis).toContain("cart change");
    expect(incidents.get(inc.id)?.timeline.at(-1)).toMatchObject({ kind: "analysis", text: "Likely the cart change" });
    incidents.note(inc.id, "Rolled back");
    const done = await incidents.resolve(inc.id, "en");
    expect(done.status).toBe("resolved");
    expect(asked[1]).toContain("[note] Rolled back");
    expect(docs.pages(projectId)[0]?.title).toStartWith("Postmortem: Cart is broken");
  });
});

describe("docs site", () => {
  test("README as the home page, one page per wiki page, links between them, internal pages left out", async () => {
    const { Product } = await import("./product");
    const JSZip = (await import("jszip")).default;
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const dir = mkdtempSync(join(tmpdir(), "godeye-site-"));
    await Bun.write(join(dir, "README.md"), "# Shop\n\nSee [[Setup]].");
    const projectId = store.addProject(dir);
    const docs = new Docs(sqlite, store, new Bus(), { list: () => [] } as unknown as Databases, async () => "");
    docs.savePage(projectId, { title: "Setup", body: "Run `bun dev`. Back to [[Missing page]]." });
    docs.savePage(projectId, { title: "Postmortem: outage", body: "internal" });
    const product = new Product(
      sqlite,
      store,
      docs,
      {} as never,
      {} as never,
      async () => "",
      mkdtempSync(join(tmpdir(), "godeye-shots-")),
      () => undefined,
    );
    const zip = await JSZip.loadAsync(await product.docsSite(projectId, "en"));
    expect(Object.keys(zip.files).sort()).toEqual(["index.html", "search.js", "setup.html", "style.css"]);
    const index = await zip.file("index.html")?.async("string");
    expect(index).toContain('<a href="setup.html">Setup</a>');
    const setup = await zip.file("setup.html")?.async("string");
    expect(setup).toContain("<code>bun dev</code>");
    expect(setup).toContain("Back to Missing page.");
    const { isoWeek } = await import("./product");
    expect(isoWeek(new Date(2026, 9, 17).getTime())).toBe("2026-W42");
    expect(isoWeek(new Date(2026, 0, 1).getTime())).toBe("2026-W01");
  });
});
