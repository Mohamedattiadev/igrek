import type { TaskStatus } from "@godeye/core";
import type { Hono } from "hono";
import { archonBin, archonWorkflows, startArchon } from "./archon";
import type { Board } from "./board";
import type { Flows } from "./flows";
import type { Store } from "./store";
import { worktreeDiff } from "./worktrees";

export function registerFlowRoutes(
  app: Hono,
  { flows, board, store }: { flows: Flows; board: Board; store: Store },
): void {
  const fail = (err: unknown) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  const guard = (run: () => unknown) => {
    try {
      return Response.json(run());
    } catch (err) {
      return fail(err);
    }
  };

  app.get("/api/projects/:id/flows", async (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Project not found" }, 404);
    return c.json({
      flows: flows.flowsFor(project.id).map((f) => ({
        name: f.name,
        description: f.description ?? "",
        source: f.source,
        nodes: f.nodes.map((n) => ({ id: n.id, title: n.title, persona: n.persona })),
      })),
      archon: { installed: !!archonBin(), workflows: await archonWorkflows(project.path) },
    });
  });

  app.get("/api/flows", (c) => c.json(flows.list(c.req.query("projectId") || undefined)));
  app.get("/api/flows/:id", (c) => {
    const run = flows.get(c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/flows", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: unknown; flow?: unknown; request?: unknown };
    const projectId = String(body.projectId ?? "");
    const flow = String(body.flow ?? "feature");
    const request = String(body.request ?? "");
    try {
      if (flow.startsWith("archon:")) {
        const project = store.projectRow(projectId);
        if (!project) throw new Error("Project not found");
        return c.json(await startArchon(flows, { projectId, cwd: project.path, workflow: flow.slice(7), request }));
      }
      return c.json(flows.start({ projectId, flow, request }));
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/flows/:id/respond", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { node?: unknown; decision?: unknown; text?: unknown };
    return guard(() =>
      flows.respond(
        c.req.param("id"),
        String(body.node ?? ""),
        body.decision === "reject" ? "reject" : "approve",
        String(body.text ?? ""),
      ),
    );
  });
  app.post("/api/flows/:id/stop", (c) => {
    flows.stop(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/flows/:id/retry", (c) => guard(() => flows.retry(c.req.param("id"))));
  app.post("/api/flows/:id/merge", (c) => guard(() => flows.merge(c.req.param("id"))));
  app.post("/api/flows/:id/discard", (c) => guard(() => flows.discard(c.req.param("id"))));
  app.post("/api/flows/:id/revise", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    return guard(() => flows.revise(c.req.param("id"), String(body.text ?? "")));
  });
  /** The full change of a run, for the approval screen. */
  app.get("/api/flows/:id/diff", (c) => {
    const run = flows.get(c.req.param("id"));
    if (!run?.worktree) return c.json({ files: [], patch: "" });
    return c.json(worktreeDiff({ ...run.worktree, sub: "" }));
  });

  // ---- the board ----------------------------------------------------------------
  app.get("/api/projects/:id/board", (c) => c.json(board.list(c.req.param("id"))));
  app.post("/api/projects/:id/board", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: unknown; description?: unknown; origin?: unknown };
    if (!store.projectRow(c.req.param("id"))) return c.json({ error: "Project not found" }, 404);
    return guard(() =>
      board.add({
        projectId: c.req.param("id"),
        title: String(body.title ?? ""),
        description: typeof body.description === "string" ? body.description : "",
        origin: typeof body.origin === "string" ? body.origin.slice(0, 100) : undefined,
      }),
    );
  });
  app.patch("/api/board/:id", async (c) => {
    const task = board.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>);
    return task ? c.json(task) : c.json({ error: "Not found" }, 404);
  });
  app.post("/api/board/:id/move", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { status?: unknown; order?: unknown; flow?: unknown };
    return guard(() =>
      board.move(
        c.req.param("id"),
        String(body.status ?? "") as TaskStatus,
        typeof body.order === "number" ? body.order : undefined,
        typeof body.flow === "string" ? body.flow : "feature",
      ),
    );
  });
  app.delete("/api/board/:id", (c) => {
    board.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
}
