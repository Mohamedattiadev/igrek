import type { Bot } from "@igrek/core";
import type { Hono } from "hono";
import type { Bots } from "./bots";

const fail = (err: unknown) => ({ error: (err as Error).message });

/** Team bots (bots.ts): make, change and remove them, give one a job by hand, see what each did. */
export function registerBotRoutes(app: Hono, bots: Bots): void {
  app.get("/api/bots", (c) => c.json(bots.list(c.req.query("projectId") || undefined)));

  app.post("/api/bots", async (c) => {
    try {
      return c.json(bots.create((await c.req.json().catch(() => ({}))) as Partial<Bot>));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.put("/api/bots/:id", async (c) => {
    try {
      return c.json(bots.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Partial<Bot>));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.delete("/api/bots/:id", (c) => {
    bots.remove(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/bots/:id/jobs", (c) => c.json(bots.jobs(c.req.param("id"))));

  // "Run now": a job given on the bot's page instead of in a channel.
  app.post("/api/bots/:id/jobs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string; request?: string };
    try {
      return c.json(
        bots.start(c.req.param("id"), { projectId: String(body.projectId ?? ""), request: String(body.request ?? "") }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
