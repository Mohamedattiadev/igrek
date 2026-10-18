import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { citation, type EmbedderStatus } from "@igrek/core";
import { Bus } from "./bus";
import { openDb } from "./db";
import type { Embed } from "./embedder";
import { chunk, extractEpub, htmlToText, markdownSections } from "./extract";
import { ftsQuery, Library } from "./library";

/** Stand-in vectors: words that mean the same thing share a dimension, across languages. */
const SYNONYMS: Record<string, number> = {
  backup: 0,
  backups: 0,
  yedek: 0,
  yedekleri: 0,
  restore: 0,
  deploy: 1,
  deployment: 1,
  yayın: 1,
  react: 2,
  component: 2,
  bileşen: 2,
};
class FakeEmbedder implements Embed {
  calls = 0;
  status(): EmbedderStatus {
    return { state: "ready", model: "fake", sizeMb: 0 };
  }
  ready() {
    return true;
  }
  async embed(texts: string[]) {
    this.calls++;
    return texts.map((t) => {
      const v = new Float32Array(384);
      for (const w of t.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
        const d = SYNONYMS[w];
        if (d !== undefined) v[d] = (v[d] as number) + 1;
      }
      v[383] = 0.01;
      const n = Math.hypot(...v);
      return v.map((x) => x / n);
    });
  }
}

function setup(embedder: Embed = new FakeEmbedder()) {
  const { sqlite } = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "igrek-lib-"));
  const library = new Library(sqlite, new Bus(), dir, embedder, async (_url, target) => {
    mkdirSync(join(target, "docs"), { recursive: true });
    writeFileSync(join(target, "README.md"), "# Tiny\n\nA tiny web framework.\n");
    writeFileSync(join(target, "docs", "guide.md"), "# Routing\n\nRoutes are matched in order.\n");
    writeFileSync(join(target, ".env"), "SECRET=abc\n");
  });
  return { library, dir, sqlite };
}

describe("library text", () => {
  test("HTML becomes plain text; markdown keeps its headings as places", () => {
    expect(htmlToText("<style>x{}</style><h1>Title</h1><p>A &amp; B&nbsp;&#246;</p><script>evil()</script>")).toBe(
      "# Title\n\nA & B ö",
    );
    const sections = markdownSections("intro\n# One\ntext one\n## Two\ntext two");
    expect(sections.map((s) => s.location)).toEqual([undefined, "One", "Two"]);
    const parts = chunk([{ location: "p. 1", text: "a".repeat(2500) }], 1000, 100);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.location === "p. 1" && p.text.length <= 1100)).toBe(true);
    expect(ftsQuery('drop table; "x" OR y*')).toBe('"drop" OR "table"');
  });

  test("an EPUB is read chapter by chapter with its title and author", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
    );
    zip.file(
      "OEBPS/book.opf",
      '<package><metadata><dc:title>Release It!</dc:title><dc:creator>Michael Nygard</dc:creator></metadata><manifest><item id="c1" href="c1.xhtml"/><item id="c2" href="c2.xhtml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>',
    );
    zip.file(
      "OEBPS/c1.xhtml",
      "<html><body><h1>Stability</h1><p>Timeouts protect you from hanging forever on a remote call.</p></body></html>",
    );
    zip.file(
      "OEBPS/c2.xhtml",
      "<html><body><h1>Capacity</h1><p>Every resource is limited, so plan for the busiest day.</p></body></html>",
    );
    const book = await extractEpub(await zip.generateAsync({ type: "uint8array" }));
    expect(book.title).toBe("Release It!");
    expect(book.author).toBe("Michael Nygard");
    expect(book.sections.map((s) => s.location)).toEqual(["Chapter 1: Stability", "Chapter 2: Capacity"]);
  });
});

describe("library", () => {
  test("a PDF is read page by page and found by a question in another language", async () => {
    const { library } = setup();
    const item = library.addFile(
      "accelerate.pdf",
      new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/sample.pdf"))),
      {
        title: "Accelerate",
        author: "Forsgren, Humble, Kim",
        personaIds: ["devops"],
      },
    );
    await library.idle();
    const ready = library.get(item.id);
    expect(ready).toMatchObject({ status: "ready", kind: "book", embedded: true, chunks: 2 });
    // Same file twice is refused.
    expect(() =>
      library.addFile("copy.pdf", new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/sample.pdf")))),
    ).toThrow();

    const hits = await library.search("Yedekleri nasıl test ederim?", { personaId: "devops", markUsed: true });
    expect(hits[0]).toMatchObject({ title: "Accelerate", location: "p. 2" });
    expect(citation(hits[0] as (typeof hits)[number])).toBe("Accelerate (Forsgren, Humble, Kim), p. 2");
    expect(library.get(item.id)?.uses).toBe(1);
    // Another persona's shelf doesn't see it.
    expect(await library.search("restore", { personaId: "frontend" })).toEqual([]);
  });

  test("words still work without the search model; a repo is read without its secrets", async () => {
    const offline: Embed = {
      status: () => ({ state: "missing", model: "x", sizeMb: 1 }),
      ready: () => false,
      embed: async () => {
        throw new Error("no model");
      },
    };
    const { library } = setup(offline);
    const repo = library.addUrl("https://github.com/acme/tiny");
    await library.idle();
    expect(library.get(repo.id)).toMatchObject({ status: "ready", kind: "repo", embedded: false });
    const hits = await library.search("routes order");
    expect(hits[0]?.location).toBe("docs/guide.md > Routing");
    expect((await library.search("SECRET abc")).length).toBe(0);
  });

  test("Igrek's own texts replace themselves and lessons are for everyone", async () => {
    const embedder = new FakeEmbedder();
    const { library } = setup(embedder);
    library.upsertText({
      id: "lesson-1",
      kind: "lesson",
      title: "Test restores",
      text: "Backups failed once because nobody tested a restore.",
      personaIds: ["qa"],
    });
    await library.idle();
    const calls = embedder.calls;
    library.upsertText({
      id: "lesson-1",
      kind: "lesson",
      title: "Test restores",
      text: "Backups failed once because nobody tested a restore.",
      personaIds: ["qa"],
    });
    await library.idle();
    expect(embedder.calls).toBe(calls);
    expect((await library.search("backup", { personaId: "frontend" }))[0]?.title).toBe("Test restores");
    library.remove("lesson-1");
    expect(await library.search("backup")).toEqual([]);
  });
});
