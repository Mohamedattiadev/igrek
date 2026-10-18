import { dirname } from "node:path";
import type { PickedElement } from "@godeye/core";
import type { Hono } from "hono";
import type { StopRegistry } from "./bus";
import { cleanEnv } from "./env";
import type { DevServers } from "./preview/devservers";

/** One quick edit: Claude Code with only reading and editing tools, edits accepted (a checkpoint was taken first). */
function quickEditRunner(stops: StopRegistry) {
  return async (prompt: string, cwd: string, system: string | undefined, model: string): Promise<string> => {
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--model",
        model,
        "--permission-mode",
        "acceptEdits",
        "--tools",
        "Read,Edit,MultiEdit,Grep,Glob",
        "--max-turns",
        "12",
        ...(system ? ["--append-system-prompt", system] : []),
      ],
      {
        cwd,
        stdin: new Blob([prompt]),
        stdout: "pipe",
        stderr: "pipe",
        env: cleanEnv({ GODEYE_INTERNAL: "1", GIT_CEILING_DIRECTORIES: dirname(cwd) }),
      },
    );
    const off = stops.register(`preview-edit-${proc.pid}`, { label: "preview edit", stop: () => proc.kill() });
    const timer = setTimeout(() => proc.kill(), 3 * 60_000);
    try {
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      let result: { result?: string; is_error?: boolean } | undefined;
      try {
        result = JSON.parse(out);
      } catch {
        result = undefined;
      }
      if (!result || result.is_error || typeof result.result !== "string")
        throw new Error(result?.result ?? (err.trim().slice(0, 300) || `claude exited with ${code}`));
      return result.result;
    } finally {
      clearTimeout(timer);
      off();
    }
  };
}

export function registerPreviewRoutes(
  app: Hono,
  { devServers, stops }: { devServers: DevServers; stops: StopRegistry },
): void {
  const fail = (err: unknown) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  const run = quickEditRunner(stops);

  app.get("/api/projects/:id/preview", (c) =>
    c.json({ server: devServers.get(c.req.param("id")) ?? null, plan: devServers.plan(c.req.param("id")) ?? null }),
  );
  app.get("/api/projects/:id/preview/logs", (c) => c.json(devServers.logs(c.req.param("id"))));
  app.post("/api/projects/:id/preview/start", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: unknown };
    try {
      return c.json(
        await devServers.start(c.req.param("id"), {
          url: typeof body.url === "string" && body.url ? body.url : undefined,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/projects/:id/preview/stop", (c) => {
    devServers.stop(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/projects/:id/preview/edit", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      instruction?: unknown;
      element?: PickedElement;
      personaId?: unknown;
      model?: unknown;
    };
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 2000) : "";
    if (!instruction || !body.element?.tag) return c.json({ error: "Pick an element and write what to change" }, 400);
    try {
      return c.json(
        await devServers.edit(
          c.req.param("id"),
          {
            instruction,
            element: body.element,
            personaId: typeof body.personaId === "string" ? body.personaId : undefined,
            model: typeof body.model === "string" && /^(opus|sonnet|haiku)$/.test(body.model) ? body.model : undefined,
          },
          run,
        ),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/projects/:id/preview/visual", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown; action?: unknown };
    const path = typeof body.path === "string" && body.path.startsWith("/") ? body.path : "/";
    try {
      return c.json(
        await devServers.visual(c.req.param("id"), path, body.action === "baseline" ? "baseline" : "compare"),
      );
    } catch (err) {
      return fail(err);
    }
  });
  app.get("/api/preview/shots/:name", (c) => {
    const file = devServers.shotFile(c.req.param("name"));
    return file
      ? new Response(Bun.file(file), { headers: { "cache-control": "private, max-age=86400" } })
      : c.json({ error: "Not found" }, 404);
  });
}
