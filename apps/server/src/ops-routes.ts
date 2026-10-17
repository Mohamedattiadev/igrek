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

export function registerCodeHostRoutes(app: Hono, host: import("./codehost").CodeHost): void {
  const guard = async (fn: () => Promise<unknown>) => {
    try {
      return { ok: true as const, value: await fn() };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  };
  app.get("/api/projects/:id/host", async (c) => c.json(await host.info(c.req.param("id"))));
  for (const kind of ["issues", "pulls", "runs"] as const)
    app.get(`/api/projects/:id/host/${kind}`, async (c) => {
      const r = await guard(() => host[kind](c.req.param("id")));
      return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400);
    });
  app.get("/api/projects/:id/host/pulls/:number/diff", async (c) => {
    const r = await guard(() => host.prDiff(c.req.param("id"), Number(c.req.param("number"))));
    return r.ok ? c.text(String(r.value)) : c.json({ error: r.error }, 400);
  });
  app.post("/api/projects/:id/host/pulls/:number/review", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string; body?: string };
    const action = body.action === "approve" || body.action === "changes" ? body.action : "comment";
    const r = await guard(() =>
      host.review(c.req.param("id"), Number(c.req.param("number")), action, String(body.body ?? "")),
    );
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, 400);
  });
  app.post("/api/projects/:id/host/issues/:number/task", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { start?: boolean };
    const r = await guard(() =>
      host.issueToTask(c.req.param("id"), Number(c.req.param("number")), body.start === true),
    );
    return r.ok ? c.json(r.value) : c.json({ error: r.error }, 400);
  });
}

export function registerCalendarRoutes(app: Hono, calendar: import("./calendar").Calendar): void {
  app.get("/api/calendar", (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!from || !to || to < from || to - from > 400 * 86_400_000) return c.json({ error: "Bad range" }, 400);
    return c.json(calendar.items(from, to, c.req.query("projectId") || undefined));
  });
  app.post("/api/calendar", async (c) => {
    try {
      return c.json(calendar.add((await c.req.json()) as Parameters<typeof calendar.add>[0]));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.delete("/api/calendar/:id", (c) => {
    calendar.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.patch("/api/calendar/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { done?: boolean };
    calendar.setDone(c.req.param("id"), body.done === true);
    return c.json({ ok: true });
  });
}

export function registerVaultRoutes(app: Hono, vault: import("./vault").Vault): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.get("/api/vault", (c) => c.json(vault.list()));
  app.post("/api/vault/items", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      value?: string;
      note?: string;
      projectId?: string;
    };
    try {
      return c.json({
        id: await vault.addItem({
          name: String(body.name ?? ""),
          value: String(body.value ?? ""),
          note: body.note,
          projectId: body.projectId,
        }),
      });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.put("/api/vault/items/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { value?: string };
    try {
      await vault.updateItem(c.req.param("id"), String(body.value ?? ""));
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/vault/items/:id", (c) => {
    vault.removeItem(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/vault/rotation", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ref?: string; days?: number; rotated?: boolean };
    if (!body.ref) return c.json({ error: "Missing key" }, 400);
    if (body.rotated) vault.markRotated(body.ref);
    else vault.setRotation(body.ref, Number(body.days) || 0);
    return c.json({ ok: true });
  });
  app.post("/api/vault/reveal", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ref?: string };
    try {
      return c.json({ value: await vault.reveal(String(body.ref ?? "")) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}

export function registerCostRoutes(app: Hono, costs: import("./costs").Costs): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.get("/api/costs", (c) => c.json(costs.list()));
  app.get("/api/costs/summary", async (c) => c.json(await costs.summary(c.req.query("currency") || "USD")));
  app.get("/api/costs/suggestions", (c) => c.json(costs.suggestions()));
  app.post("/api/costs", async (c) => {
    try {
      return c.json(costs.add(await c.req.json()));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.put("/api/costs/:id", async (c) => {
    try {
      return c.json(costs.update(c.req.param("id"), await c.req.json()));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/costs/:id", (c) => {
    costs.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
}

export function registerAnalyticsRoutes(
  app: Hono,
  { analytics, store }: { analytics: import("./analytics").Analytics; store: import("./store").Store },
): void {
  app.options("/ingest/events/:key", (c) =>
    c.body(null, 204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    }),
  );
  app.post("/ingest/events/:key", async (c) => {
    const headers = { "access-control-allow-origin": "*" };
    const text = await c.req.text();
    if (text.length > 64_000) return c.json({ error: "Too big" }, 413, headers);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: "Not JSON" }, 400, headers);
    }
    const ok = analytics.ingest(c.req.param("key"), body);
    return c.json({ ok }, ok ? 202 : 404, headers);
  });
  app.get("/api/projects/:id/analytics", async (c) => {
    const summary = await analytics.summary(c.req.param("id"));
    return c.json({ ...summary, draft: analytics.draft(summary, store.projectRow(c.req.param("id"))?.name ?? "") });
  });
  app.put("/api/projects/:id/analytics/source", async (c) => {
    const body = (await c.req.json().catch(() => null)) as import("@godeye/core").AnalyticsSource | null;
    try {
      analytics.setSource(c.req.param("id"), body);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}

/** Plugin pages run sandboxed: no network, no forms, no popups, no top navigation (plan.md 12). */
export const PLUGIN_CSP =
  "sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; img-src 'self' data: blob:; form-action 'none'; frame-ancestors 'self'";

export function registerPluginRoutes(
  app: Hono,
  {
    plugins,
    terminals,
    store,
  }: {
    plugins: import("./plugins").Plugins;
    terminals: import("./terminals").Terminals;
    store: import("./store").Store;
  },
): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.get("/api/plugins", (c) => c.json(plugins.list()));
  app.post("/api/plugins", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { source?: string };
    try {
      return c.json(await plugins.install(String(body.source ?? "")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/plugins/:id/enabled", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
    try {
      plugins.setEnabled(c.req.param("id"), body.enabled === true);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/plugins/:id", (c) => {
    plugins.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  /** A plugin command, in a shell terminal in the project's folder: you see exactly what runs. */
  app.post("/api/plugins/:id/commands/:command", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: string };
    const plugin = plugins.get(c.req.param("id"));
    const command = plugin?.enabled ? plugin.commands.find((x) => x.id === c.req.param("command")) : undefined;
    const project = body.projectId ? store.projectRow(body.projectId) : undefined;
    if (!plugin || !command || !project) return c.json({ error: "Not found" }, 404);
    try {
      const { shellLine } = await import("./plugins");
      return c.json(
        terminals.start({
          projectId: project.id,
          cwd: project.path,
          tool: "shell",
          title: `${plugin.name} · ${command.title}`,
          args: ["-c", shellLine(command.run)],
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/plugin-files/:id/*", (c) => {
    const rest = decodeURIComponent(c.req.path.split("/").slice(3).join("/"));
    const file = plugins.file(c.req.param("id"), rest);
    if (!file) return c.text("Not found", 404);
    return new Response(Bun.file(file), {
      headers: {
        "content-security-policy": PLUGIN_CSP,
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
      },
    });
  });
}

export function registerMcpRoutes(app: Hono, mcp: import("./mcpservers").McpServers): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.get("/api/mcp-servers", async (c) => {
    const { MCP_CATALOG } = await import("@godeye/core");
    return c.json({ servers: mcp.list(), catalog: MCP_CATALOG });
  });
  app.post("/api/mcp-servers", async (c) => {
    try {
      return c.json(await mcp.add(await c.req.json()));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/mcp-servers/:id/test", async (c) => {
    try {
      return c.json(await mcp.test(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/mcp-servers/:id/enabled", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { enabled?: boolean };
    try {
      mcp.setEnabled(c.req.param("id"), body.enabled === true);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/mcp-servers/:id", (c) => {
    mcp.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
}

export function registerTimeRoutes(app: Hono, store: import("./store").Store): void {
  app.get("/api/time", async (c) => {
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    if (!from || !to || to < from || to - from > 100 * 86_400_000) return c.json({ error: "Bad range" }, 400);
    const { timeReport } = await import("./timetrack");
    return c.json(timeReport(store, from, to));
  });
}

export function registerWriteupRoutes(
  app: Hono,
  {
    writeups,
    store,
    team,
  }: {
    writeups: import("./writeups").Writeups;
    store: import("./store").Store;
    team: {
      sharedProjectIds: () => string[];
      memberList: () => { id: string }[];
      identity: () => { id?: string };
      flush: () => Promise<void>;
    };
  },
): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.post("/api/projects/:id/release-notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { language?: string };
    try {
      return c.json(await writeups.releaseNotes(c.req.param("id"), String(body.language ?? "en")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/projects/:id/adrs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { language?: string };
    try {
      return c.json(await writeups.adrs(c.req.param("id"), String(body.language ?? "en")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/projects/:id/adrs/zip", async (c) => {
    const body = (await c.req.json().catch(() => [])) as import("./writeups").AdrRecord[];
    if (!Array.isArray(body) || !body.length) return c.json({ error: "Nothing to export" }, 400);
    const zip = await writeups.adrZip(body.slice(0, 100), store.projectRow(c.req.param("id"))?.name ?? "project");
    return new Response(new Blob([zip as BlobPart]), {
      headers: { "content-type": "application/zip", "content-disposition": 'attachment; filename="adr.zip"' },
    });
  });
  app.get("/api/recaps", (c) => c.json(writeups.recapDays()));
  app.get("/api/recap", (c) => {
    const day = c.req.query("day") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: "Bad day" }, 400);
    return c.json({ recap: writeups.cachedRecap(day) ?? null, stats: writeups.dayStats(day) });
  });
  app.post("/api/recap", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { day?: string; language?: string };
    const day = String(body.day ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: "Bad day" }, 400);
    try {
      return c.json(await writeups.recap(day, String(body.language ?? "en")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/dayend", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { language?: string };
    try {
      return c.json({ text: await writeups.dayNote(String(body.language ?? "en")) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  /** The note goes to every teammate (end-to-end encrypted, like all team messages). */
  app.post("/api/dayend/share", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: string };
    const text = String(body.text ?? "")
      .trim()
      .slice(0, 8000);
    const projectId = team.sharedProjectIds()[0];
    const me = team.identity().id;
    const people = team.memberList().filter((m) => m.id !== me);
    if (!text) return c.json({ error: "The note is empty" }, 400);
    if (!projectId || !people.length)
      return c.json({ error: "No team to share with: connect a team and share a project first" }, 400);
    const insert = store.db.query(
      "INSERT INTO team_messages (id, kind, project_id, to_id, title, text, at, outgoing) VALUES (?, 'dayend', ?, ?, ?, ?, ?, 1)",
    );
    for (const p of people)
      insert.run(crypto.randomUUID(), projectId, p.id, new Date().toISOString().slice(0, 10), text, Date.now());
    void team.flush();
    return c.json({ sent: people.length });
  });
}

export function registerBridgeRoutes(app: Hono, bridges: import("./bridges").Bridges, language: () => string): void {
  const fail = (err: unknown) => ({ error: (err as Error).message });
  app.get("/api/bridges", (c) => c.json(bridges.list()));
  app.post("/api/bridges", async (c) => {
    try {
      return c.json(await bridges.add(await c.req.json()));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.patch("/api/bridges/:id", async (c) => {
    try {
      bridges.update(c.req.param("id"), await c.req.json());
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/bridges/:id/test", async (c) => {
    try {
      return c.json(await bridges.test(c.req.param("id"), language()));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/bridges/:id", (c) => {
    bridges.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
}
