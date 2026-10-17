import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MemorySection, ProjectDetail, ProjectListItem } from "@godeye/core";
import type { Hono } from "hono";
import { gitFetch, gitInfo } from "./adapters/git";
import { buildContext, hooksInstalled, installHooks, uninstallHooks } from "./hooks";
import type { Indexer } from "./indexer";
import { localDay } from "./jobs";
import type { Store } from "./store";
import type { Summarizer } from "./summarizer";

export interface WorkDeps {
  store: Store;
  indexer: Indexer;
  summarizer: Summarizer;
  hookScript: string;
  publicPort: number;
  dataDir: string;
  /** Re-reads git history right away (after a manual project add or fetch). */
  syncCommits: () => void;
  /** Lessons for the start of a session, and those that fit a prompt (plan.md 7.2). */
  lessonsAtStart?: (projectId: string) => string | undefined;
  lessonsForPrompt?: (prompt: string, projectId: string) => Promise<string | undefined>;
}

const SECTIONS: MemorySection[] = ["status", "decision", "convention", "failed", "issue"];
const MCP_SCRIPT = join(import.meta.dir, "mcp.ts");

function runClaudeCli(args: string[]): { ok: boolean; output: string } {
  try {
    const proc = Bun.spawnSync(["claude", ...args], { stdout: "pipe", stderr: "pipe" });
    return { ok: proc.exitCode === 0, output: `${proc.stdout}${proc.stderr}`.trim() };
  } catch (err) {
    return { ok: false, output: (err as Error).message };
  }
}

function withGit<T extends ProjectListItem>(project: T): T {
  return { ...project, git: gitInfo(project.path) };
}

/** Faz 1 API: projects, sessions, memory, search and Claude Code hooks. */
export function registerWorkRoutes(app: Hono, deps: WorkDeps): void {
  const { store, indexer, summarizer, hookScript, syncCommits } = deps;
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

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    const path = typeof body.path === "string" ? body.path.trim().replace(/\/+$/, "") : "";
    if (!path.startsWith("/") || !existsSync(path) || !statSync(path).isDirectory()) {
      return c.json({ error: "Folder not found" }, 400);
    }
    const id = store.addProject(path);
    syncCommits();
    return c.json({ id });
  });

  app.patch("/api/projects/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { hidden?: unknown; name?: unknown; gitFlow?: unknown };
    const id = c.req.param("id");
    if (typeof body.gitFlow === "boolean") store.setGitFlow(id, body.gitFlow);
    else if (typeof body.hidden === "boolean") store.setProjectHidden(id, body.hidden);
    else if (typeof body.name === "string" && body.name.trim()) store.renameProject(id, body.name.trim().slice(0, 80));
    else return c.json({ error: "Nothing to change" }, 400);
    return c.json({ ok: true });
  });

  app.post("/api/projects/:id/fetch", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const ok = gitFetch(row.path);
    syncCommits();
    return ok ? c.json({ git: gitInfo(row.path) }) : c.json({ error: "Could not reach the remote" }, 502);
  });

  app.get("/api/projects/:id/timeline", (c) => c.json(store.timeline(c.req.param("id"))));

  app.get("/api/projects/:id/digests", (c) => c.json(store.listDigests(c.req.param("id"))));

  app.post("/api/projects/:id/digests", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { period?: unknown; day?: unknown };
    const period = body.period === "week" ? "week" : "day";
    const day = typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day) ? body.day : localDay(Date.now());
    try {
      return c.json(await summarizer.digest(c.req.param("id"), period, day));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
  });

  app.post("/api/projects/:id/memory", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { section?: unknown; text?: unknown };
    const section = SECTIONS.find((s) => s === body.section);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!section || !text) return c.json({ error: "Section and text are required" }, 400);
    store.addMemory(c.req.param("id"), section, text.slice(0, 1000));
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

  app.get("/api/sessions/recent", (c) => {
    const projectId = store.projectForCwd(c.req.query("cwd") ?? "");
    return c.json(projectId ? store.listSessions(projectId, 8) : []);
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

  app.patch("/api/memory/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "Text is required" }, 400);
    store.updateMemory(c.req.param("id"), text.slice(0, 1000));
    return c.json({ ok: true });
  });

  app.post("/api/memory/:id/resolve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { keep?: unknown };
    if (body.keep !== "new" && body.keep !== "old" && body.keep !== "both")
      return c.json({ error: "Invalid choice" }, 400);
    store.resolveConflict(c.req.param("id"), body.keep);
    return c.json({ ok: true });
  });

  app.delete("/api/memory/:id", (c) => {
    store.deleteMemory(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/api/inbox", (c) => c.json({ conflicts: store.openConflicts() }));
  app.get("/api/today", (c) => {
    const since = Number(c.req.query("since")) || new Date().setHours(0, 0, 0, 0);
    return c.json(store.today(since));
  });

  app.get("/api/search", (c) => {
    const cwd = c.req.query("cwd");
    const projectId = cwd ? store.projectForCwd(cwd) : undefined;
    const hits = store.search(c.req.query("q") ?? "", 40);
    return c.json(projectId ? hits.filter((h) => h.projectId === projectId) : hits.slice(0, 30));
  });

  app.post("/api/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { question?: unknown; projectId?: unknown };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return c.json({ error: "Ask something" }, 400);
    try {
      return c.json(
        await summarizer.ask(question.slice(0, 500), typeof body.projectId === "string" ? body.projectId : undefined),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  // For the MCP server: context and recent sessions by working folder.
  app.get("/api/context", (c) => {
    const projectId = store.projectForCwd(c.req.query("cwd") ?? "");
    return c.json({ context: (projectId && buildContext(store, projectId)) || "" });
  });

  app.get("/api/mcp", (c) => {
    const status = runClaudeCli(["mcp", "get", "godeye"]);
    return c.json({
      installed: status.ok,
      command: `claude mcp add --scope user godeye -- ${process.execPath} ${MCP_SCRIPT}`,
      inContainer: existsSync("/.dockerenv"),
    });
  });

  app.post("/api/mcp", (c) => {
    if (existsSync("/.dockerenv")) return c.json({ error: "Run the command on your computer, not in Docker" }, 409);
    const env = [`GODEYE_PORT=${deps.publicPort}`, `GODEYE_HOME=${deps.dataDir}`].flatMap((e) => ["-e", e]);
    const result = runClaudeCli([
      "mcp",
      "add",
      "--scope",
      "user",
      ...env,
      "godeye",
      "--",
      process.execPath,
      MCP_SCRIPT,
    ]);
    return result.ok ? c.json({ ok: true }) : c.json({ error: result.output || "claude mcp add failed" }, 500);
  });

  app.delete("/api/mcp", (c) => {
    const result = runClaudeCli(["mcp", "remove", "--scope", "user", "godeye"]);
    return result.ok ? c.json({ ok: true }) : c.json({ error: result.output }, 500);
  });

  // Called by the hook script inside Claude Code (see hooks.ts).
  app.post("/api/hooks/session-start", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as { cwd?: string };
    const projectId = payload.cwd ? store.projectForCwd(payload.cwd) : undefined;
    const memory = projectId ? buildContext(store, projectId) : undefined;
    const lessons = projectId ? deps.lessonsAtStart?.(projectId) : undefined;
    const context = [memory, lessons].filter(Boolean).join("\n\n");
    if (!context) return c.json({});
    return c.json({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } });
  });

  app.post("/api/hooks/prompt", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as { cwd?: string; prompt?: string };
    const projectId = payload.cwd ? store.projectForCwd(payload.cwd) : undefined;
    if (!projectId || typeof payload.prompt !== "string") return c.json({});
    const context = await deps.lessonsForPrompt?.(payload.prompt, projectId).catch(() => undefined);
    if (!context) return c.json({});
    return c.json({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } });
  });

  app.post("/api/hooks/session-end", async (c) => {
    const payload = (await c.req.json().catch(() => ({}))) as { session_id?: string };
    if (payload.session_id) void indexer.touch(payload.session_id);
    return c.json({});
  });
}
