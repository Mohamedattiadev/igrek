import { homedir } from "node:os";
import type { SessionSummaryData, TerminalTool } from "@godeye/core";
import type { Hono } from "hono";
import { createCheckpoint } from "./checkpoints";
import type { Servers } from "./servers";
import type { Store } from "./store";
import type { Terminals } from "./terminals";

const TOOLS: TerminalTool[] = ["claude", "codex", "gemini", "shell"];

/**
 * Opening prompt for a fresh session that continues a tired one (plan.md 1.8 / 2.8):
 * what was done, what is open, so the new session starts informed instead of guessing.
 */
export function handoffPrompt(title: string, summary: SessionSummaryData | undefined, language: string): string {
  const text = summary?.texts[language] ?? summary?.texts.en ?? Object.values(summary?.texts ?? {})[0];
  const lines = [
    `We are continuing work from a previous session ("${summary?.title || title}") that got too long.`,
    text?.why ? `Goal: ${text.why}` : "",
    text?.did.length ? `Already done:\n${text.did.map((d) => `- ${d}`).join("\n")}` : "",
    text?.left.length ? `Still open:\n${text.left.map((d) => `- ${d}`).join("\n")}` : "",
    text?.risks.length ? `Check first:\n${text.risks.map((d) => `- ${d}`).join("\n")}` : "",
    "Start by checking the current state of the code (git status, the files involved) before changing anything, then tell me in two sentences where we are and what you'll do next.",
  ];
  return lines.filter(Boolean).join("\n\n");
}

export function registerTerminalRoutes(
  app: Hono,
  {
    store,
    terminals,
    language,
    servers,
  }: { store: Store; terminals: Terminals; language: () => string; servers: Servers },
): void {
  app.get("/api/terminals", (c) => c.json(terminals.list()));

  app.post("/api/terminals", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      projectId?: unknown;
      tool?: unknown;
      resume?: unknown;
      fork?: unknown;
      cols?: unknown;
      rows?: unknown;
      serverId?: unknown;
    };
    // An interactive SSH session on a saved server.
    if (body.tool === "ssh") {
      const server = typeof body.serverId === "string" ? servers.get(body.serverId) : undefined;
      if (!server) return c.json({ error: "Server not found" }, 404);
      try {
        return c.json(
          terminals.start({
            projectId: `server:${server.id}`,
            cwd: homedir(),
            tool: "ssh",
            title: `SSH · ${server.name}`,
            args: [...(server.port ? ["-p", String(server.port)] : []), server.target],
          }),
        );
      } catch (err) {
        return c.json({ error: (err as Error).message }, 400);
      }
    }
    const project = typeof body.projectId === "string" ? store.projectRow(body.projectId) : undefined;
    if (!project) return c.json({ error: "Project not found" }, 404);
    const tool = TOOLS.find((t) => t === body.tool) ?? "claude";
    const args: string[] = [];
    const label = { claude: "Claude", codex: "Codex", gemini: "Gemini", shell: "Shell", ssh: "SSH" }[tool];
    let title = `${label} · ${project.name}`;
    if (typeof body.resume === "string") {
      const session = store.sessionRow(body.resume);
      if (!session) return c.json({ error: "Session not found" }, 404);
      if (session.tool === "codex") args.push("resume", body.resume.replace(/^codex-/, ""));
      else args.push("--resume", body.resume, ...(body.fork === true ? ["--fork-session"] : []));
      title = session.title ?? title;
    }
    // A snapshot before an AI tool starts working, so its changes can be rolled back.
    if (tool !== "shell") createCheckpoint(project.path, `${label} session started`);
    try {
      const info = terminals.start({
        projectId: project.id,
        cwd: project.path,
        tool,
        title,
        args,
        cols: typeof body.cols === "number" ? body.cols : undefined,
        rows: typeof body.rows === "number" ? body.rows : undefined,
      });
      return c.json(info);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // "Fresh start": a new Claude session primed with the tired session's summary.
  app.post("/api/sessions/:id/handoff", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { tool?: unknown };
    const session = store.sessionRow(c.req.param("id"));
    const project = session?.project_id ? store.projectRow(session.project_id) : undefined;
    if (!session || !project) return c.json({ error: "Session not found" }, 404);
    const summary = session.summary ? (JSON.parse(session.summary) as SessionSummaryData) : undefined;
    try {
      const info = terminals.start({
        projectId: project.id,
        cwd: session.cwd ?? project.path,
        // Hand over to another tool (e.g. Claude → Codex when a limit is hit), or stay on the same one.
        tool: TOOLS.find((t) => t === body.tool && t !== "shell") ?? (session.tool === "codex" ? "codex" : "claude"),
        title: `↻ ${summary?.title || session.title || "handoff"}`,
        args: [handoffPrompt(session.title ?? "", summary, language())],
      });
      return c.json(info);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Types text into a terminal without pressing Enter (e.g. a note from a quick question).
  app.post("/api/terminals/:id/input", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== "string" || !terminals.get(c.req.param("id"))) return c.json({ error: "Not found" }, 404);
    terminals.input(c.req.param("id"), body.text.replace(/\r?\n/g, " "));
    return c.json({ ok: true });
  });

  app.delete("/api/terminals/:id", (c) => {
    terminals.close(c.req.param("id"));
    return c.json({ ok: true });
  });
}
