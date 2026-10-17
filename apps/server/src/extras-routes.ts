import type { Hono } from "hono";
import type { BackupFile, Backups } from "./backup";
import type { Flows } from "./flows";
import type { Lessons } from "./lessons";
import type { Library } from "./library";
import type { Store } from "./store";
import { bestPractices, createProject, PROJECT_TEMPLATES } from "./templates";
import type { Updater } from "./update";

export function registerExtrasRoutes(
  app: Hono,
  deps: { backups: Backups; updater: Updater; store: Store; flows: Flows; lessons: Lessons; library: Library },
): void {
  const fail = (err: unknown) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  // ---- backup ----------------------------------------------------------------------
  app.post("/api/backup/export", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
    const file = await deps.backups.export(
      typeof body.password === "string" && body.password ? body.password : undefined,
    );
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(file), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="godeye-backup-${day}.json"`,
      },
    });
  });
  app.post("/api/backup/import", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) throw new Error("No file");
      const parsed = JSON.parse(await file.text()) as BackupFile;
      const added = await deps.backups.restore(
        parsed,
        typeof body.password === "string" && body.password ? body.password : undefined,
      );
      void deps.library.embedMissing();
      return c.json({ added });
    } catch (err) {
      return fail(err);
    }
  });

  // ---- self-update -------------------------------------------------------------------
  app.get("/api/update", (c) =>
    c.json(c.req.query("check") === "1" ? deps.updater.check() : (deps.updater.status() ?? deps.updater.check())),
  );
  app.post("/api/update", (c) => {
    try {
      return c.json(deps.updater.update());
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/update/restart", (c) => {
    deps.updater.restart();
    return c.json({ ok: true });
  });

  // ---- project templates ---------------------------------------------------------------
  app.get("/api/templates", (c) =>
    c.json({ templates: Object.keys(PROJECT_TEMPLATES), practices: bestPractices(deps.store, deps.lessons) }),
  );
  app.post("/api/projects/new", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      const made = createProject(deps, {
        name: String(body.name ?? ""),
        parent: String(body.parent ?? ""),
        template: String(body.template ?? "empty"),
        details: typeof body.details === "string" ? body.details.slice(0, 2000) : undefined,
      });
      return c.json({ projectId: made.projectId, path: made.path, runId: made.run?.id });
    } catch (err) {
      return fail(err);
    }
  });
}
