import type { EnvKeyUse } from "@godeye/core";
import type { Hono } from "hono";
import type { EnvFiles } from "./envfiles";
import type { Insight } from "./insight";
import type { Store } from "./store";

/** .env editor (plan.md 5.6). Errors never echo values back. */
export function registerEnvRoutes(
  app: Hono,
  { env, store, insight }: { env: EnvFiles; store: Store; insight: Insight },
): void {
  const rootOf = (id: string) => {
    const project = store.projectRow(id);
    return project && !project.path.startsWith("team:") ? project.path : undefined;
  };
  const usedKeys = (id: string): EnvKeyUse[] => {
    const latest = insight.latest(id);
    return "apis" in latest && latest.apis ? latest.apis.env : [];
  };
  const fail = (err: unknown) => ({ error: (err as Error).message });

  app.get("/api/projects/:id/env", (c) => {
    const root = rootOf(c.req.param("id"));
    return root ? c.json(env.overview(root, usedKeys(c.req.param("id")))) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/projects/:id/env/reveal", async (c) => {
    const root = rootOf(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string };
    if (!root || !body.file || !body.key) return c.json({ error: "Not found" }, 404);
    try {
      return c.json({ value: env.reveal(root, body.file, body.key) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.put("/api/projects/:id/env", async (c) => {
    const root = rootOf(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string; value?: string };
    if (!root || !body.file || !body.key || typeof body.value !== "string")
      return c.json({ error: "Missing file, key or value" }, 400);
    try {
      env.set(root, body.file, body.key, body.value);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.delete("/api/projects/:id/env", async (c) => {
    const root = rootOf(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string };
    if (!root || !body.file || !body.key) return c.json({ error: "Missing file or key" }, 400);
    try {
      env.remove(root, body.file, body.key);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.get("/api/projects/:id/env/history", (c) => {
    const root = rootOf(c.req.param("id"));
    const file = c.req.query("file");
    if (!root || !file) return c.json({ error: "Not found" }, 404);
    try {
      return c.json(env.history(root, file));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.post("/api/projects/:id/env/restore", async (c) => {
    const root = rootOf(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; id?: string };
    if (!root || !body.file || !body.id) return c.json({ error: "Missing file or backup" }, 400);
    try {
      env.restore(root, body.file, body.id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.post("/api/projects/:id/env/example", (c) => {
    const root = rootOf(c.req.param("id"));
    if (!root) return c.json({ error: "Not found" }, 404);
    try {
      return c.json(env.syncExample(root, usedKeys(c.req.param("id"))));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
