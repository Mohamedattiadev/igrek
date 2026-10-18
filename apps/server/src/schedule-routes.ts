import type { Hono } from "hono";
import type { Schedules } from "./schedules";
import type { Store } from "./store";

export function registerScheduleRoutes(app: Hono, { schedules, store }: { schedules: Schedules; store: Store }): void {
  const guard = async (run: () => unknown) => {
    try {
      return Response.json(await run());
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  };
  app.get("/api/schedules", (c) => c.json(schedules.list()));
  app.get("/api/schedules/:id/runs", (c) => c.json(schedules.history(c.req.param("id"))));
  /** A sentence becomes a proposal (from the page, or from an AI in chat through the MCP tool, by folder). */
  app.post("/api/schedules/propose", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { sentence?: unknown; projectId?: unknown; cwd?: unknown };
    const projectId =
      typeof body.projectId === "string"
        ? body.projectId
        : typeof body.cwd === "string"
          ? store.projectForCwd(body.cwd)
          : undefined;
    return guard(() => {
      if (!projectId) throw new Error("This folder is not a project in Igrek");
      return schedules.propose(String(body.sentence ?? ""), projectId);
    });
  });
  app.post("/api/schedules", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    return guard(() =>
      typeof body.template === "string"
        ? schedules.fromTemplate(
            String(body.projectId ?? ""),
            body.template,
            String(body.title ?? ""),
            String(body.request ?? ""),
          )
        : schedules.create({
            projectId: String(body.projectId ?? ""),
            title: String(body.title ?? ""),
            request: String(body.request ?? ""),
            flow: String(body.flow ?? "task"),
            when: body.when,
          }),
    );
  });
  app.patch("/api/schedules/:id", async (c) =>
    guard(async () =>
      schedules.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>),
    ),
  );
  app.post("/api/schedules/:id/activate", (c) => guard(() => schedules.activate(c.req.param("id"))));
  app.post("/api/schedules/:id/pause", (c) => guard(() => schedules.pause(c.req.param("id"))));
  app.post("/api/schedules/:id/run", (c) => guard(() => schedules.runNow(c.req.param("id"))));
  app.post("/api/schedules/:id/skip", (c) => guard(() => schedules.skipMissed(c.req.param("id"))));
  app.delete("/api/schedules/:id", (c) => {
    schedules.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
}
