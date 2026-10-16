import type { SessionSummaryData, TerminalTool } from "@godeye/core";
import type { Hono } from "hono";
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
  { store, terminals, language }: { store: Store; terminals: Terminals; language: () => string },
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
    };
    const project = typeof body.projectId === "string" ? store.projectRow(body.projectId) : undefined;
    if (!project) return c.json({ error: "Project not found" }, 404);
    const tool = TOOLS.find((t) => t === body.tool) ?? "claude";
    const args: string[] = [];
    const label = { claude: "Claude", codex: "Codex", gemini: "Gemini", shell: "Shell" }[tool];
    let title = `${label} · ${project.name}`;
    if (typeof body.resume === "string") {
      const session = store.sessionRow(body.resume);
      if (!session) return c.json({ error: "Session not found" }, 404);
      if (session.tool === "codex") args.push("resume", body.resume.replace(/^codex-/, ""));
      else args.push("--resume", body.resume, ...(body.fork === true ? ["--fork-session"] : []));
      title = session.title ?? title;
    }
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
  app.post("/api/sessions/:id/handoff", (c) => {
    const session = store.sessionRow(c.req.param("id"));
    const project = session?.project_id ? store.projectRow(session.project_id) : undefined;
    if (!session || !project) return c.json({ error: "Session not found" }, 404);
    const summary = session.summary ? (JSON.parse(session.summary) as SessionSummaryData) : undefined;
    try {
      const info = terminals.start({
        projectId: project.id,
        cwd: session.cwd ?? project.path,
        tool: session.tool === "codex" ? "codex" : "claude",
        title: `↻ ${summary?.title || session.title || "handoff"}`,
        args: [handoffPrompt(session.title ?? "", summary, language())],
      });
      return c.json(info);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/api/terminals/:id", (c) => {
    terminals.close(c.req.param("id"));
    return c.json({ ok: true });
  });
}
