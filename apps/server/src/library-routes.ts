import type { LibraryKind } from "@igrek/core";
import type { Hono } from "hono";
import type { Embedder } from "./embedder";
import type { Library } from "./library";
import { librarySuggestions } from "./library-suggest";

const KINDS: LibraryKind[] = ["book", "doc", "article", "web", "repo", "note", "example", "news", "lesson"];

function personaList(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    try {
      return personaList(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(0, 50) : undefined;
}

export function registerLibraryRoutes(
  app: Hono,
  {
    library,
    embedder,
    projects = () => [],
  }: { library: Library; embedder: Embedder; projects?: () => { name: string; path: string }[] },
): void {
  const fail = (err: unknown) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  app.get("/api/library", (c) => c.json(library.list(c.req.query("persona") || undefined)));
  app.get("/api/library/status", (c) => c.json(embedder.status()));
  app.get("/api/library/suggestions", (c) => {
    const have = new Set(library.list().flatMap((item) => [item.url, item.source].filter((x): x is string => !!x)));
    return c.json(librarySuggestions(projects(), have));
  });
  /** "Download the search model" (118 MB, once). */
  app.post("/api/library/model", (c) => {
    void embedder.download().then(() => library.embedMissing());
    return c.json(embedder.status());
  });

  app.post("/api/library/files", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) return c.json({ error: "No file" }, 400);
      const kind = KINDS.find((k) => k === body.kind);
      return c.json(
        library.addFile(file.name, new Uint8Array(await file.arrayBuffer()), {
          personaIds: personaList(body.personaIds),
          kind,
          title: typeof body.title === "string" ? body.title : undefined,
          author: typeof body.author === "string" ? body.author : undefined,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/library/url", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return c.json(
        library.addUrl(String(body.url ?? ""), {
          personaIds: personaList(body.personaIds),
          kind: KINDS.find((k) => k === body.kind),
          title: typeof body.title === "string" ? body.title : undefined,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/library/notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!title || text.length < 20) return c.json({ error: "A title and some text are needed" }, 400);
    const id = `note-${crypto.randomUUID().slice(0, 10)}`;
    library.upsertText({
      id,
      kind: "note",
      title: title.slice(0, 200),
      text: text.slice(0, 500_000),
      personaIds: personaList(body.personaIds),
    });
    return c.json(library.get(id));
  });
  app.patch("/api/library/:id", async (c) => {
    const item = library.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>);
    return item ? c.json(item) : c.json({ error: "Not found" }, 404);
  });
  app.delete("/api/library/:id", (c) => {
    library.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/library/:id/reindex", (c) => {
    library.reindex(c.req.param("id"));
    return c.json({ ok: true });
  });
  /** Used by the UI's "try a search" and by the MCP tool library_search (which counts uses). */
  app.get("/api/library/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json([]);
    return c.json(
      await library.search(q, {
        personaId: c.req.query("persona") || undefined,
        limit: Number(c.req.query("limit")) || 5,
        markUsed: c.req.query("used") === "1",
      }),
    );
  });
}
