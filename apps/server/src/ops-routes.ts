import type { DockerHost, LogLine, LogSource } from "@godeye/core";
import type { Hono } from "hono";
import type { AppErrors } from "./apperrors";
import type { Docker } from "./docker";
import type { Flows } from "./flows";
import type { Logs } from "./logs";
import type { Monitors } from "./monitors";

const fail = (err: unknown) => ({ error: (err as Error).message });

function hostOf(serverId: string | undefined): DockerHost {
  return serverId ? { kind: "server", serverId } : { kind: "local" };
}

export function registerOpsRoutes(
  app: Hono,
  {
    monitors,
    docker,
    logs,
    errors,
    flows,
    port,
  }: { monitors: Monitors; docker: Docker; logs: Logs; errors: AppErrors; flows: Flows; port: number },
): void {
  // ---- uptime, domains ----
  app.get("/api/uptime", (c) => c.json(monitors.list()));
  app.post("/api/uptime", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return c.json(
        monitors.add({
          url: String(body.url ?? ""),
          name: typeof body.name === "string" ? body.name : undefined,
          projectId: typeof body.projectId === "string" && body.projectId ? body.projectId : undefined,
          interval: Number(body.interval) || undefined,
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/uptime/:id", (c) => {
    monitors.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/uptime/:id/check", async (c) => c.json((await monitors.checkSite(c.req.param("id"))) ?? null));
  app.get("/api/uptime/:id/history", (c) =>
    c.json(monitors.history(c.req.param("id"), Math.min(720, Number(c.req.query("hours")) || 24))),
  );
  app.get("/api/domains", (c) => c.json(monitors.domains()));
  app.post("/api/domains", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      return c.json(
        await monitors.addDomain({
          host: String(body.host ?? ""),
          projectId: typeof body.projectId === "string" && body.projectId ? body.projectId : undefined,
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/domains/:id", (c) => {
    monitors.removeDomain(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/domains/:id/check", async (c) => c.json((await monitors.checkDomain(c.req.param("id"))) ?? null));

  // ---- docker ----
  app.get("/api/docker", async (c) => {
    try {
      return c.json(await docker.containers(hostOf(c.req.query("server"))));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/docker/:name/logs", async (c) => {
    try {
      return c.text(
        await docker.logs(hostOf(c.req.query("server")), c.req.param("name"), Number(c.req.query("tail")) || 300),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/docker/:name/:action", async (c) => {
    const action = c.req.param("action");
    if (action !== "restart" && action !== "stop" && action !== "start")
      return c.json({ error: "Unknown action" }, 400);
    try {
      return c.json({ output: await docker.act(hostOf(c.req.query("server")), c.req.param("name"), action) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // ---- logs ----
  app.get("/api/logs/sources", (c) => c.json(logs.saved(c.req.query("projectId") || undefined)));
  app.get("/api/projects/:id/log-suggestions", async (c) => c.json(await logs.suggestions(c.req.param("id"))));
  app.post("/api/logs/sources", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { source?: LogSource; projectId?: string };
    try {
      return c.json(logs.add(body.source as LogSource, body.projectId || undefined));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/logs/sources/:id", (c) => {
    logs.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/logs/search", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      sources?: LogSource[];
      query?: string;
      level?: LogLine["level"];
      tail?: number;
    };
    try {
      return c.json(
        await logs.search(Array.isArray(body.sources) ? body.sources : [], {
          query: typeof body.query === "string" ? body.query : undefined,
          level: body.level,
          tail: Number(body.tail) || 500,
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  /** "Fix this error": the fix flow, in its own copy of the project, with the error and where it was seen. */
  app.post("/api/logs/fix", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: string;
      sample?: string;
      sources?: string[];
      count?: number;
    };
    if (!body.projectId || !body.sample) return c.json({ error: "Missing project or error" }, 400);
    try {
      const run = flows.start({
        projectId: body.projectId,
        flow: "fix",
        request: `Fix this error from the logs (seen ${Number(body.count) || 1} times in ${(body.sources ?? []).join(", ") || "the logs"}):\n\n\`\`\`\n${String(body.sample).slice(0, 4000)}\n\`\`\`\n\nFind the cause in the code, fix it, and add a test that would have caught it.`,
      });
      return c.json({ runId: run.id });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // ---- app errors ----
  app.options("/ingest/errors/:key", (c) =>
    c.body(null, 204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    }),
  );
  app.post("/ingest/errors/:key", async (c) => {
    const headers = { "access-control-allow-origin": "*" };
    const text = await c.req.text();
    if (text.length > 64_000) return c.json({ error: "Too big" }, 413, headers);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: "Not JSON" }, 400, headers);
    }
    const ok = errors.ingest(c.req.param("key"), body);
    return c.json({ ok }, ok ? 202 : 404, headers);
  });
  app.get("/api/projects/:id/errors", (c) => c.json(errors.list(c.req.param("id"))));
  app.get("/api/projects/:id/errors/snippet", (c) =>
    c.json(errors.snippet(c.req.param("id"), `http://localhost:${port}`)),
  );
  app.post("/api/errors/:id/status", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    try {
      errors.setStatus(c.req.param("id"), body.status as "open");
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/errors/:id/fix", (c) => {
    const group = errors.get(c.req.param("id"));
    if (!group) return c.json({ error: "Not found" }, 404);
    const suspects = group.suspects?.map((s) => `- ${s.hash} ${s.subject} (${s.author})`).join("\n");
    const run = flows.start({
      projectId: group.projectId,
      flow: "fix",
      request: `Fix this error the app reported ${group.count} times (first ${new Date(group.firstAt).toISOString()}${group.firstRelease ? `, first in release ${group.firstRelease}` : ""}${group.urls.length ? `, on ${group.urls.slice(0, 3).join(", ")}` : ""}):\n\n\`\`\`\n${group.message}\n${group.stack ?? ""}\n\`\`\`${suspects ? `\n\nIt started after these commits; look at them first:\n${suspects}` : ""}\n\nFind the cause, fix it, and add a test that would have caught it.`,
    });
    return c.json({ runId: run.id });
  });
}
