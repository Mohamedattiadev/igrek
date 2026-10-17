import type { Hono } from "hono";
import type { Knowledge } from "./knowledge";

export function registerKnowledgeRoutes(app: Hono, knowledge: Knowledge): void {
  app.get("/api/knowledge", (c) => c.json(knowledge.overview(c.req.query("persona") || undefined)));
  app.get("/api/knowledge/sources/:persona", (c) => c.json(knowledge.sources(c.req.param("persona"))));
  app.put("/api/knowledge/sources/:persona", async (c) =>
    c.json(
      knowledge.setSources(c.req.param("persona"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>),
    ),
  );
  /** "Read the news now" instead of waiting for the schedule. Answers at once; results come in over time. */
  app.post("/api/knowledge/scan", (c) => {
    void knowledge.scan().catch(() => undefined);
    return c.json({ ok: true });
  });
  app.get("/api/knowledge/compare", async (c) => {
    const names = (c.req.query("packages") ?? "")
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter((n) => /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(n));
    if (names.length < 2) return c.json({ error: "Write two to four npm package names" }, 400);
    return c.json(await knowledge.compare(names));
  });
}
