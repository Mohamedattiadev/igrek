import type { ProjectDetail, ProjectListItem } from "@godeye/core";
import type { Hono } from "hono";
import { gitInfo } from "./adapters/git";
import { buildContext, hooksInstalled, installHooks, uninstallHooks } from "./hooks";
import type { Indexer } from "./indexer";
import type { Store } from "./store";
import type { Summarizer } from "./summarizer";

export interface WorkDeps {
  store: Store;
  indexer: Indexer;
  summarizer: Summarizer;
  hookScript: string;
}

function withGit<T extends ProjectListItem>(project: T): T {
  return { ...project, git: gitInfo(project.path) };
}

/** Faz 1 API: projects, sessions, memory, search and Claude Code hooks. */
export function registerWorkRoutes(app: Hono, { store, indexer, summarizer, hookScript }: WorkDeps): void {
  app.get("/api/index/status", (c) => c.json(indexer.status));

  app.get("/api/projects", (c) => c.json(store.listProjects().map(withGit)));

  app.get("/api/projects/:id", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const installed = hooksInstalled(row.path);
    if (installed !== !!row.hooks_installed) store.setHooksInstalled(row.id, installed);
    const detail: ProjectDetail = {
      ...withGit(store.projectItem({ ...row, hooks_installed: installed ? 1 : 0 })),
      memory: store.listMemory(row.id),
      recentSessions: store.listSessions(row.id, 8),
    };
    return c.json(detail);
  });

  app.patch("/api/projects/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { hidden?: unknown };
    if (typeof body.hidden !== "boolean") return c.json({ error: "Nothing to change" }, 400);
    store.setProjectHidden(c.req.param("id"), body.hidden);
    return c.json({ ok: true });
  });

  app.get("/api/projects/:id/sessions", (c) => c.json(store.listSessions(c.req.param("id"))));

  app.get("/api/projects/:id/context", (c) => c.json({ context: buildContext(store, c.req.param("id")) ?? "" }));

  app.post("/api/projects/:id/hooks", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    try {
      installHooks(row.path, hookScript);
      store.setHooksInstalled(row.id, true);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  app.delete("/api/projects/:id/hooks", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    uninstallHooks(row.path);
    store.setHooksInstalled(row.id, false);
    return c.json({ ok: true });
  });

  app.get("/api/sessions/:id", (c) => {
    const detail = store.sessionDetail(c.req.param("id"));
    return detail ? c.json(detail) : c.json({ error: "Session not found" }, 404);
  });

  app.post("/api/sessions/:id/summarize", async (c) => {
    try {
      return c.json(await summarizer.summarize(c.req.param("id")));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
  });

  app.delete("/api/memory/:id", (c) => {
    store.deleteMemory(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/search", (c) => c.json(store.search(c.req.query("q") ?? "")));

  // Called by the hook script inside Claude Code (see hooks.ts).
  app.post("/api/hooks/session-start", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as { cwd?: string };
    const projectId = payload.cwd ? store.projectForCwd(payload.cwd) : undefined;
    const context = projectId ? buildContext(store, projectId) : undefined;
    if (!context) return c.json({});
    return c.json({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
  });

  app.post("/api/hooks/session-end", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as { session_id?: string };
    if (payload.session_id) void indexer.touch(payload.session_id);
    return c.json({});
  });
}
