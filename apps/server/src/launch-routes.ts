import type { Hono } from "hono";
import type { Launcher } from "./launcher";

const fail = (err: unknown) => ({ error: (err as Error).message });

/** "Start the project" (launcher.ts): the parts, one or all started and stopped, logs, start on open. */
export function registerLaunchRoutes(app: Hono, launcher: Launcher): void {
  app.get("/api/projects/:id/launch", async (c) => {
    try {
      const id = c.req.param("id");
      return c.json({ parts: await launcher.parts(id), auto: launcher.auto(id) });
    } catch (err) {
      return c.json(fail(err), 404);
    }
  });

  // The project page was opened: what should start by itself, starts.
  app.post("/api/projects/:id/launch/opened", async (c) => {
    await launcher.opened(c.req.param("id")).catch(() => undefined);
    return c.json({ ok: true });
  });

  app.post("/api/projects/:id/launch/:action", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { part?: string; parts?: string[] };
    try {
      const action = c.req.param("action");
      if (action === "start-all") await launcher.startAll(id);
      else if (action === "stop-all") await launcher.stopAll(id);
      else if (action === "start" && body.part) await launcher.start(id, body.part);
      else if (action === "stop" && body.part) await launcher.stop(id, body.part);
      else if (action === "auto") launcher.setAuto(id, Array.isArray(body.parts) ? body.parts.map(String) : []);
      else return c.json({ error: "Unknown action" }, 400);
      return c.json({ parts: await launcher.parts(id), auto: launcher.auto(id) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.get("/api/projects/:id/launch/logs", (c) => c.json(launcher.logs(c.req.param("id"), c.req.query("part") ?? "")));
}
