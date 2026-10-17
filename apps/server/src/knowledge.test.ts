import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type EmbedderStatus } from "@godeye/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import type { Embed } from "./embedder";
import { countTerms, Knowledge, mergeDuplicates, parseFeed } from "./knowledge";
import { Library } from "./library";
import { Personas } from "./personas";
import { Store } from "./store";

const offline: Embed = {
  status: (): EmbedderStatus => ({ state: "missing", model: "x", sizeMb: 1 }),
  ready: () => false,
  embed: async () => [],
};

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Postgres 19 released with faster vacuum]]></title><link>https://example.org/pg19?utm_source=x</link><pubDate>Wed, 15 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Big release&lt;/p&gt;</description></item>
<item><title>Old news</title><link>https://example.org/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
</channel></rss>`;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("knowledge engine pieces", () => {
  test("feeds are read, the same story is merged, technologies are counted", () => {
    const items = parseFeed(RSS, "example.org");
    expect(items[0]).toMatchObject({
      title: "Postgres 19 released with faster vacuum",
      source: "example.org",
      text: "Big release",
    });
    const merged = mergeDuplicates([
      {
        title: "Postgres 19 released with faster vacuum",
        url: "https://example.org/pg19?utm_source=x",
        source: "r/PostgreSQL",
      },
      { title: "Postgres 19 released", url: "https://www.example.org/pg19", source: "Hacker News", points: 300 },
      { title: "Something else entirely here today", url: "https://b.org/x", source: "Lobsters" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ mentions: 2, sources: ["r/PostgreSQL", "Hacker News"], points: 300 });
    const counts = countTerms(["Why we left React for Svelte", "React Native 1.0", "go is great", "Going home"]);
    expect(counts.get("react")).toBe(1);
    expect(counts.get("react native")).toBe(1);
    expect(counts.get("go")).toBe(1);
  });
});

describe("knowledge engine", () => {
  test("a scan rates stories as the persona, keeps what matters in its library, and changes an opinion only with evidence", async () => {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const dir = mkdtempSync(join(tmpdir(), "godeye-know-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { pg: "^8.11.0", react: "^18.2.0" } }));
    store.addProject(dir);
    const bus = new Bus();
    const personas = new Personas(sqlite, store, bus, new StopRegistry(), () => DEFAULT_SETTINGS, dir);
    const library = new Library(sqlite, bus, join(dir, ".lib"), offline);
    const old = personas.record(
      "database",
      null,
      [{ claim: "Postgres vacuum is slow on big tables", reasoning: "", evidence: "experience", confidence: "medium" }],
      "t",
    );
    const asked: string[] = [];
    const knowledge = new Knowledge(
      sqlite,
      store,
      bus,
      personas,
      library,
      () => DEFAULT_SETTINGS,
      async (prompt) => {
        asked.push(prompt);
        if (prompt.startsWith("New stories"))
          return `{"items":[{"id":0,"importance":8,"verdict":"real","summary":"Vacuum got much faster.","why":"You use Postgres.","affects":["${dir.split("/").pop()}","Nope"]}]}`;
        return `<notebook>{"opinions":[{"claim":"Postgres 19 vacuum is fast enough","reasoning":"new release","evidence":"https://example.org/pg19","confidence":"medium","replaces":"${old.saved[0]?.id}","changedBecause":"Postgres 19 rewrote vacuum, per the release notes"}]}</notebook>`;
      },
      (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("reddit.com/r/PostgreSQL")) return new Response(RSS);
        if (url.includes("registry.npmjs.org/react"))
          return json({ "dist-tags": { latest: "19.1.0" }, modified: "2026-10-01T00:00:00Z" });
        if (url.includes("registry.npmjs.org/pg")) return json({ "dist-tags": { latest: "8.16.0" } });
        return new Response("nope", { status: 404 });
      }) as typeof fetch,
      0,
    );
    knowledge.setSources("database", { reddit: ["PostgreSQL"], hn: [] });
    for (const id of [
      "ai-engineer",
      "frontend",
      "backend",
      "devops",
      "security",
      "performance",
      "mobile",
      "data-engineer",
      "uiux",
      "product-manager",
      "growth",
      "competitor-analyst",
      "rnd-engineer",
      "researcher",
    ])
      knowledge.setSources(id, {});
    const result = await knowledge.scan(Date.UTC(2026, 9, 16));
    expect(result.kept).toBe(1);
    const view = knowledge.overview();
    expect(view.items[0]).toMatchObject({
      personaId: "database",
      importance: 8,
      verdict: "real",
      source: "r/PostgreSQL",
    });
    expect(view.items[0]?.affects).toEqual([dir.split("/").pop() as string]);
    await library.idle();
    expect(
      library.list("database").some((i) => i.kind === "news" && i.url === "https://example.org/pg19?utm_source=x"),
    ).toBe(true);
    expect(personas.opinions("database", null).map((o) => o.claim)).toEqual(["Postgres 19 vacuum is fast enough"]);
    expect(knowledge.notices().some((n) => n.kind === "opinion")).toBe(true);
    // A new major version of react, not of pg.
    expect(view.updates.map((u) => `${u.name} ${u.latest}`)).toEqual(["react 19.1.0"]);
    // Seen stories are not rated twice.
    const again = await knowledge.scan(Date.UTC(2026, 9, 17));
    expect(again.kept).toBe(0);
  });
});
