import type { TaskStatus } from "@godeye/core";
import type { Hono } from "hono";
import { archonBin, archonWorkflows, startArchon } from "./archon";
import { arenaModels } from "./arena";
import type { Board } from "./board";
import type { Flows } from "./flows";
import type { Store } from "./store";
import { worktreeDiff } from "./worktrees";

export function registerFlowRoutes(
  app: Hono,
  {
    flows,
    board,
    store,
    me = () => undefined,
  }: {
    flows: Flows;
    board: Board;
    store: Store;
    /** The signed-in teammate (team sync), who takes cards. */
    me?: () => { id: string; name: string } | undefined;
  },
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
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: unknown;
      flow?: unknown;
      request?: unknown;
      persona?: unknown;
    };
    const projectId = String(body.projectId ?? "");
    const flow = String(body.flow ?? "feature");
    const request = String(body.request ?? "");
    try {
      if (flow.startsWith("archon:")) {
        const project = store.projectRow(projectId);
        if (!project) throw new Error("Project not found");
        return c.json(await startArchon(flows, { projectId, cwd: project.path, workflow: flow.slice(7), request }));
      }
      const persona = typeof body.persona === "string" && body.persona ? body.persona : undefined;
      return c.json(flows.start({ projectId, flow, request, persona }));
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
  // Who a card is for: a teammate or a persona (plan.md 4.4); an empty body clears it.
  app.post("/api/board/:id/assign", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kind?: unknown; id?: unknown; name?: unknown };
    const kind = body.kind === "person" || body.kind === "persona" ? body.kind : undefined;
    return guard(() =>
      board.assign(
        c.req.param("id"),
        kind && typeof body.id === "string" && body.id
          ? { kind, id: body.id.slice(0, 80), name: String(body.name ?? body.id).slice(0, 80) }
          : null,
      ),
    );
  });
  // "I'm taking this" / let it go; needs a team identity.
  app.post("/api/board/:id/claim", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { take?: unknown };
    const who = me();
    if (body.take !== false && !who) return c.json({ error: "Join a team to take cards" }, 400);
    return guard(() => board.claim(c.req.param("id"), body.take === false ? null : (who ?? null)));
  });
}

export function registerArenaRoutes(app: Hono, arena: import("./arena").Arena): void {
  app.get("/api/arena", (c) =>
    c.json({ matches: arena.list(c.req.query("projectId") || undefined), stats: arena.stats(), models: arenaModels() }),
  );
  app.post("/api/arena", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string; request?: string; models?: string[] };
    try {
      return c.json(
        arena.start({
          projectId: String(body.projectId ?? ""),
          request: String(body.request ?? ""),
          models: body.models ?? [],
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.post("/api/arena/:id/pick", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { model?: string };
    try {
      return c.json(arena.pick(c.req.param("id"), String(body.model ?? "")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}

/** Import cards from Trello, Jira, Linear, Notion or a GitHub project (plan.md 13.6). */
export function registerImportRoutes(app: Hono, board: import("./board").Board, store: import("./store").Store): void {
  app.post("/api/projects/:id/import", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      source?: string;
      text?: string;
      owner?: string;
      number?: number;
    };
    const projectId = c.req.param("id");
    if (!store.projectRow(projectId)) return c.json({ error: "Project not found" }, 404);
    const { importCards, readImport } = await import("./imports");
    try {
      let text = String(body.text ?? "");
      const source = body.source as import("./imports").ImportSource;
      if (!["trello", "jira", "linear", "notion", "github"].includes(source)) throw new Error("Unknown source");
      if (source === "github" && !text) {
        // A GitHub project read with the user's own gh login.
        if (!/^[\w.-]{1,40}$/.test(String(body.owner ?? "")) || !Number(body.number))
          throw new Error("Give the owner and the project number");
        const p = Bun.spawnSync(
          [
            "gh",
            "project",
            "item-list",
            String(Number(body.number)),
            "--owner",
            String(body.owner),
            "--format",
            "json",
            "--limit",
            "500",
          ],
          {
            stdout: "pipe",
            stderr: "pipe",
            timeout: 60_000,
          },
        );
        if (p.exitCode !== 0)
          throw new Error(p.stderr.toString().trim().slice(0, 300) || "gh could not read the project");
        text = p.stdout.toString();
      }
      if (text.length > 20_000_000) throw new Error("The file is too big");
      return c.json(importCards(board, projectId, readImport(source, text)));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
