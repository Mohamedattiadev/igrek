import { homedir } from "node:os";
import { type AiTool, capabilitiesOf, type SessionSummaryData, type TerminalTool } from "@igrek/core";
import type { Hono } from "hono";
import type { Accounts } from "./accounts";
import { createCheckpoint } from "./checkpoints";
import type { Servers } from "./servers";
import type { Store } from "./store";
import type { Terminals } from "./terminals";

const TOOLS: TerminalTool[] = ["claude", "codex", "gemini", "pi", "shell"];

/** CLI arguments that reopen (or fork) a stored session in its own tool. */
export function resumeArgs(tool: AiTool, sessionId: string, fork: boolean): string[] {
  const caps = capabilitiesOf(tool);
  if (!caps.resume) return [];
  const id = sessionId.replace(/^(codex|pi)-/, "");
  if (tool === "codex") return ["resume", id];
  if (tool === "pi") return fork && caps.fork ? ["--fork", id] : ["--session", id];
  return ["--resume", id, ...(fork && caps.fork ? ["--fork-session"] : [])];
}

/**
 * Opening prompt for a fresh session that continues a tired one (plan.md 1.8 / 2.8):
 * what was done, what is open, so the new session starts informed instead of guessing.
 */
export function handoffPrompt(
  title: string,
  summary: SessionSummaryData | undefined,
  language: string,
  reason = "that got too long",
  /** Facts read from the session itself, not written by a model: where the work happened. */
  where: { files?: string[]; branch?: string } = {},
): string {
  const text = summary?.texts[language] ?? summary?.texts.en ?? Object.values(summary?.texts ?? {})[0];
  const lines = [
    `We are continuing work from a previous session ("${summary?.title || title}") ${reason}.`,
    text?.why ? `Goal: ${text.why}` : "",
    text?.did.length ? `Already done:\n${text.did.map((d) => `- ${d}`).join("\n")}` : "",
    text?.left.length ? `Still open:\n${text.left.map((d) => `- ${d}`).join("\n")}` : "",
    text?.risks.length ? `Check first:\n${text.risks.map((d) => `- ${d}`).join("\n")}` : "",
    where.branch ? `Branch: ${where.branch}` : "",
    where.files?.length
      ? `Files it changed:\n${where.files
          .slice(-15)
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "",
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
    accounts,
  }: { store: Store; terminals: Terminals; language: () => string; servers: Servers; accounts: Accounts },
): void {
  /** Account env: a resumed session must use the account it was created in; otherwise the project's/active one. */
  const accountEnv = (provider: "claude" | "codex", projectId: string, sessionAccount?: string | null) => {
    const account = (sessionAccount && accounts.get(sessionAccount)) || accounts.forProject(provider, projectId);
    return accounts.env(account);
  };
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
    const label = tool === "shell" ? "Shell" : tool === "ssh" ? "SSH" : capabilitiesOf(tool).label;
    let title = `${label} · ${project.name}`;
    let sessionAccount: string | null | undefined;
    if (typeof body.resume === "string") {
      const session = store.sessionRow(body.resume);
      sessionAccount = session?.account_id;
      if (!session) return c.json({ error: "Session not found" }, 404);
      if (!capabilitiesOf(session.tool).resume)
        return c.json({ error: `${capabilitiesOf(session.tool).label} sessions cannot be reopened by id` }, 400);
      args.push(...resumeArgs(session.tool as AiTool, body.resume, body.fork === true));
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
        // Shells get the active Claude account too, so typing `claude` there uses it.
        env: accountEnv(tool === "codex" ? "codex" : "claude", project.id, sessionAccount),
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
    const tool = TOOLS.find((t) => t === body.tool && t !== "shell") ?? (session.tool === "codex" ? "codex" : "claude");
    try {
      const info = terminals.start({
        projectId: project.id,
        cwd: session.cwd ?? project.path,
        // Hand over to another tool (e.g. Claude → Codex when a limit is hit), or stay on the same one.
        tool,
        env: accountEnv(tool === "codex" ? "codex" : "claude", project.id),
        title: `↻ ${summary?.title || session.title || "handoff"}`,
        args: [
          handoffPrompt(session.title ?? "", summary, language(), undefined, {
            files: JSON.parse(session.files_touched) as string[],
            branch: session.git_branch ?? undefined,
          }),
        ],
      });
      return c.json(info);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Types text into a terminal without pressing Enter (e.g. a note from a quick question).
  app.post("/api/terminals/:id/input", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; paste?: unknown };
    if (typeof body.text !== "string" || !terminals.get(c.req.param("id"))) return c.json({ error: "Not found" }, 404);
    // Multi-line text goes in as a bracketed paste: the AI tool keeps the newlines and waits for Enter.
    // Escape characters are stripped so the text can't end the paste early or send key sequences.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
    const clean = body.text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    terminals.input(
      c.req.param("id"),
      body.paste === true ? `\x1b[200~${clean}\x1b[201~` : clean.replace(/\r?\n/g, " "),
    );
    return c.json({ ok: true });
  });

  app.delete("/api/terminals/:id", (c) => {
    terminals.close(c.req.param("id"));
    return c.json({ ok: true });
  });
}
