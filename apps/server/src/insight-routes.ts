import { CATEGORIES, type Category, type InsightConfig } from "@godeye/core";
import type { Hono } from "hono";
import type { Insight } from "./insight";
import type { HistoryImport } from "./insight/history";
import { TOOL_KINDS } from "./insight/tools";

const asCategory = (value: string) => CATEGORIES.find((c) => c === value) as Category | undefined;

/** Category pages and scores (plan.md Faz 5). */
export function registerInsightRoutes(app: Hono, insight: Insight, history: HistoryImport): void {
  app.get("/api/projects/:id/import", (c) =>
    c.json({ estimate: history.estimate(c.req.param("id")), status: history.status(c.req.param("id")) ?? null }),
  );
  app.post("/api/projects/:id/import", (c) => c.json(history.start(c.req.param("id"))));
  app.delete("/api/projects/:id/import", (c) => {
    history.stop(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/insight", (c) => c.json(insight.latest(c.req.param("id"))));
  app.get("/api/projects/:id/design", (c) => {
    const found = insight.design(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "Project folder not found" }, 404);
  });
  app.get("/api/projects/:id/architecture", (c) => {
    const report = insight.architecture(c.req.param("id"));
    return report ? c.json(report) : c.json({ error: "Project folder not found" }, 404);
  });
  app.get("/api/projects/:id/render-advice", (c) => {
    const advice = insight.renderAdvice(c.req.param("id"));
    return advice ? c.json(advice) : c.json({ error: "Project folder not found" }, 404);
  });
  app.get("/api/projects/:id/coverage-map", (c) => {
    const map = insight.coverage(c.req.param("id"));
    return map ? c.json(map) : c.json({ error: "Project folder not found" }, 404);
  });
  app.get("/api/inbox/notices", (c) => c.json(insight.notices()));

  app.post("/api/projects/:id/insight/scan", async (c) => {
    try {
      return c.json(await insight.scan(c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/api/projects/:id/insight-config", (c) => c.json(insight.config(c.req.param("id"))));
  app.put("/api/projects/:id/insight-config", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as InsightConfig;
    try {
      return c.json(
        insight.setConfig(c.req.param("id"), {
          weights: body.weights ?? {},
          disabled: body.disabled ?? [],
          reasons: body.reasons ?? {},
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/api/projects/:id/insight-tools", (c) => c.json(insight.tools(c.req.param("id"))));
  app.post("/api/projects/:id/insight-tools", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kinds?: string[] };
    const kinds = TOOL_KINDS.filter((k) => body.kinds?.includes(k));
    if (!kinds.length) return c.json({ error: "Choose at least one tool" }, 400);
    try {
      return c.json(await insight.runTools(c.req.param("id"), kinds));
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
