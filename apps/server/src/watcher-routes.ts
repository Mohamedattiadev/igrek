import type { Hono } from "hono";
import type { Store } from "./store";
import type { DependencyWatcher, SecretScanner } from "./watchers";

export function registerWatcherRoutes(
  app: Hono,
  {
    secrets,
    deps,
    store,
    dataDir,
    port,
  }: { secrets: SecretScanner; deps: DependencyWatcher; store: Store; dataDir: string; port: number },
): void {
  app.get("/api/projects/:id/secrets", (c) => {
    const project = store.projectRow(c.req.param("id"));
    return c.json({
      findings: secrets.list(c.req.param("id")),
      guard: project ? secrets.guardInstalled(project.path) : false,
    });
  });
  app.post("/api/projects/:id/secrets/scan", (c) =>
    c.json({ found: secrets.scan(c.req.param("id")), findings: secrets.list(c.req.param("id")) }),
  );
  app.post("/api/projects/:id/secrets/dismiss", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { hash?: unknown; file?: unknown; line?: unknown };
    secrets.dismiss(c.req.param("id"), String(body.hash ?? ""), String(body.file ?? ""), Number(body.line));
    return c.json({ ok: true });
  });
  app.post("/api/projects/:id/secret-guard", (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Project not found" }, 404);
    try {
      secrets.installGuard(project.path, dataDir, port);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  /** Called by the pre-commit guard with the staged change. */
  app.post("/api/secrets/check", async (c) => c.text(secrets.check((await c.req.text()).slice(0, 5_000_000))));

  app.get("/api/projects/:id/deps", (c) => c.json(deps.cached(c.req.param("id")) ?? null));
  app.post("/api/projects/:id/deps", async (c) => {
    try {
      return c.json(await deps.check(c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
