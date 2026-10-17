import type { Hono } from "hono";
import { checkTarget, type Testers, testerTools } from "./testers";

export function registerTesterRoutes(app: Hono, testers: Testers): void {
  const fail = (err: unknown, status: 400 | 404 = 400) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status,
      headers: { "content-type": "application/json" },
    });

  app.get("/api/testers/status", (c) => {
    const tools = testerTools();
    return c.json({ browser: !!tools.browser, mcp: !!tools.mcp, runtime: tools.runtime.split("/").pop() });
  });
  app.get("/api/testers/profiles", (c) => c.json(testers.profiles()));
  app.post("/api/testers/profiles", async (c) => {
    try {
      return c.json(testers.saveProfile(await c.req.json()));
    } catch (err) {
      return fail(err);
    }
  });
  app.delete("/api/testers/profiles/:id", (c) => {
    testers.removeProfile(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/testers/profiles/draft", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { audience?: unknown };
    const audience = typeof body.audience === "string" ? body.audience.trim() : "";
    if (audience.length < 8) return c.json({ error: "Describe your audience in a sentence" }, 400);
    try {
      return c.json(await testers.draftProfiles(audience));
    } catch (err) {
      return fail(err);
    }
  });

  /** Whether an address is on this computer or a private network (the UI warns otherwise). */
  app.post("/api/testers/check-url", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: unknown };
    try {
      return c.json(checkTarget(String(body.url ?? "")));
    } catch (err) {
      return fail(err);
    }
  });

  app.get("/api/testers/runs", (c) => c.json(testers.list(c.req.query("projectId") || null)));
  app.get("/api/testers/runs/:id", (c) => {
    const run = testers.get(c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/testers/runs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return c.json(
        testers.start({
          url: String(body.url ?? ""),
          task: String(body.task ?? ""),
          profileIds: Array.isArray(body.profileIds)
            ? body.profileIds.filter((x): x is string => typeof x === "string")
            : [],
          copies: Number(body.copies) || 1,
          parallel: Number(body.parallel) || 3,
          projectId: typeof body.projectId === "string" ? body.projectId : null,
          model: typeof body.model === "string" ? body.model : undefined,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/testers/runs/:id/repeat", (c) => {
    try {
      return c.json(testers.repeat(c.req.param("id")));
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/testers/runs/:id/auto", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { on?: unknown };
    try {
      return c.json(testers.setAutoRepeat(c.req.param("id"), body.on === true));
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/testers/runs/:id/stop", (c) => {
    testers.stop(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.delete("/api/testers/runs/:id", (c) => {
    testers.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/testers/runs/:id/files/:session/:name", (c) => {
    const path = testers.file(c.req.param("id"), c.req.param("session"), c.req.param("name"));
    if (!path) return c.json({ error: "Not found" }, 404);
    return new Response(Bun.file(path), { headers: { "cache-control": "private, max-age=3600" } });
  });
}
