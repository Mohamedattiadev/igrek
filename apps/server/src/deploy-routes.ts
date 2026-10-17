import type { Hono } from "hono";
import type { Environments } from "./environments";
import type { Servers } from "./servers";

const fail = (err: unknown) => ({ error: (err as Error).message });

/** Environments, safe deploys (plan.md 1.2b–1.2c) and files on servers (2.5). */
export function registerDeployRoutes(app: Hono, { envs, servers }: { envs: Environments; servers: Servers }): void {
  app.get("/api/projects/:id/environments", (c) => c.json(envs.list(c.req.param("id"))));
  app.post("/api/projects/:id/environments", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      serverId?: string;
      path?: string;
      branch?: string;
      deployCommand?: string;
    };
    try {
      return c.json(
        envs.add(c.req.param("id"), {
          name: body.name ?? "production",
          serverId: body.serverId ?? "",
          path: body.path ?? "",
          branch: body.branch,
          deployCommand: body.deployCommand,
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.patch("/api/environments/:id", async (c) => {
    envs.update(
      c.req.param("id"),
      (await c.req.json().catch(() => ({}))) as { deployCommand?: string; branch?: string; name?: string },
    );
    return c.json({ ok: true });
  });
  app.delete("/api/environments/:id", (c) => {
    envs.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/environments/:id/checks", async (c) => {
    try {
      return c.json(await envs.checks(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/environments/:id/deploy", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { confirmations?: number };
    try {
      return c.json(await envs.deploy(c.req.param("id"), { confirmations: Number(body.confirmations ?? 0) }));
    } catch (err) {
      const risk = (err as { risk?: string }).risk;
      return c.json({ ...fail(err), risk }, risk ? 428 : 400);
    }
  });
  app.get("/api/environments/:id/workflow", (c) => {
    try {
      return c.json(envs.workflow(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/environments/:id/workflow", (c) => {
    try {
      return c.json({ path: envs.writeWorkflow(c.req.param("id")) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/projects/:id/deploys", (c) => c.json(envs.deploys({ projectId: c.req.param("id") })));
  app.get("/api/servers/:id/deploys", (c) => c.json(envs.deploys({ serverId: c.req.param("id") }, 10)));

  // Files on a server.
  app.get("/api/servers/:id/files", async (c) => {
    try {
      return c.json(await servers.listFiles(c.req.param("id"), c.req.query("path") ?? "~"));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/servers/:id/file", async (c) => {
    try {
      return c.json({ text: await servers.readFile(c.req.param("id"), c.req.query("path") ?? "") });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.put("/api/servers/:id/file", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; text?: string };
    if (typeof body.text !== "string" || !body.path) return c.json({ error: "Missing path or text" }, 400);
    try {
      return c.json(await servers.writeFile(c.req.param("id"), body.path, body.text));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
