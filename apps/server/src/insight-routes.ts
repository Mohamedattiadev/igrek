import { CATEGORIES, type Category } from "@godeye/core";
import type { Hono } from "hono";
import type { Insight } from "./insight";

const asCategory = (value: string) => CATEGORIES.find((c) => c === value) as Category | undefined;

/** Category pages and scores (plan.md Faz 5). */
export function registerInsightRoutes(app: Hono, insight: Insight): void {
  app.get("/api/projects/:id/insight", (c) => c.json(insight.latest(c.req.param("id"))));

  app.post("/api/projects/:id/insight/scan", async (c) => {
    try {
      return c.json(await insight.scan(c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/api/projects/:id/insight/:category", (c) => {
    const category = asCategory(c.req.param("category"));
    const detail = category ? insight.detail(c.req.param("id"), category) : undefined;
    return detail ? c.json(detail) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/projects/:id/insight/:category/explain", async (c) => {
    const category = asCategory(c.req.param("category"));
    if (!category) return c.json({ error: "Not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { force?: boolean };
    try {
      return c.json(await insight.explain(c.req.param("id"), category, body.force === true));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });
}
