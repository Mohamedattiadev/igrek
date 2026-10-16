import type { Hono } from "hono";
import { classifyCommand } from "./commands";
import { type Servers, sshConfigHosts } from "./servers";

/** Servers page and the agent-side request/approval flow (plan.md 2.5). */
export function registerServerRoutes(app: Hono, servers: Servers): void {
  app.get("/api/servers", (c) => c.json(servers.list()));
  app.get("/api/servers/ssh-config", (c) => {
    const known = new Set(servers.list().map((s) => s.target));
    return c.json(sshConfigHosts().filter((h) => !known.has(h.alias)));
  });
  app.post("/api/servers", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      target?: string;
      port?: number;
      tag?: string;
    };
    try {
      return c.json(
        servers.add({ name: body.name ?? "", target: (body.target ?? "").trim(), port: body.port, tag: body.tag }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.patch("/api/servers/:id", async (c) => {
    servers.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>);
    return c.json({ ok: true });
  });
  app.delete("/api/servers/:id", (c) => {
    servers.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/servers/:id/health", async (c) => {
    try {
      return c.json(await servers.checkHealth(c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });
  app.post("/api/servers/classify", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { command?: string };
    return c.json(classifyCommand(body.command ?? ""));
  });
  app.post("/api/servers/:id/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { command?: string; confirmations?: number };
    const command = (body.command ?? "").trim();
    if (!command) return c.json({ error: "Type a command" }, 400);
    try {
      return c.json(
        await servers.run(c.req.param("id"), command, {
          confirmations: Number(body.confirmations ?? 0),
          actor: "user",
        }),
      );
    } catch (err) {
      const risk = (err as { risk?: string }).risk;
      return c.json({ error: (err as Error).message, risk }, risk ? 409 : 400);
    }
  });
  app.get("/api/servers/:id/audit", (c) => c.json(servers.audit(c.req.param("id"))));

  app.get("/api/approvals", (c) => c.json(servers.pendingApprovals()));
  app.post("/api/approvals/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { approve?: boolean };
    const result = await servers.decide(c.req.param("id"), body.approve === true);
    return result ? c.json({ status: result.status, run: result.run }) : c.json({ error: "Unknown request" }, 404);
  });

  // Used by the MCP server on behalf of an AI agent.
  app.get("/api/agent/servers", (c) => c.json(servers.list().map(({ name, target, tag }) => ({ name, target, tag }))));
  app.post("/api/agent/servers/run", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { server?: string; command?: string; reason?: string };
    if (!body.server || !body.command) return c.json({ error: "server and command are required" }, 400);
    try {
      return c.json(await servers.agentRequest(body.server, body.command, body.reason));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });
  app.get("/api/agent/approvals/:id", (c) => {
    const pending = servers.approvalStatus(c.req.param("id"));
    return pending ? c.json({ status: pending.status, run: pending.run }) : c.json({ error: "Unknown request" }, 404);
  });
}
