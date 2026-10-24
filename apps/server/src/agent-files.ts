import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { createCheckpoint } from "./checkpoints";

/**
 * One memory for every agent (plan.md 13): Claude Code reads CLAUDE.md, Codex and most others read
 * AGENTS.md. Kept apart, a rule taught to one is unknown to the other. Joined, AGENTS.md holds the
 * rules and CLAUDE.md only brings it in ("@AGENTS.md"), so both agents read the same file.
 */
type AgentFilesState = "none" | "claudeOnly" | "agentsOnly" | "joined" | "apart";

export interface AgentFiles {
  state: AgentFilesState;
  /** Rule lines one file has and the other does not (empty when joined). */
  onlyClaude: string[];
  onlyAgents: string[];
}

const LINK = /^@AGENTS\.md\s*$/m;

function read(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The lines that say something: no blank lines, no lone headings, no imports. */
function ruleLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^#+\s/.test(l) && !/^@\S+$/.test(l));
}

export function compareAgentFiles(claude?: string, agents?: string): AgentFiles {
  if (claude === undefined && agents === undefined) return { state: "none", onlyClaude: [], onlyAgents: [] };
  if (claude !== undefined && LINK.test(claude) && ruleLines(claude).length === 0)
    return { state: "joined", onlyClaude: [], onlyAgents: [] };
  if (agents === undefined) return { state: "claudeOnly", onlyClaude: ruleLines(claude ?? ""), onlyAgents: [] };
  if (claude === undefined) return { state: "agentsOnly", onlyClaude: [], onlyAgents: ruleLines(agents) };
  const a = new Set(ruleLines(agents));
  const c = new Set(ruleLines(claude));
  return {
    state: "apart",
    onlyClaude: [...c].filter((l) => !a.has(l)),
    onlyAgents: [...a].filter((l) => !c.has(l)),
  };
}

/**
 * AGENTS.md keeps what it has and gets CLAUDE.md's rules it lacked, under a heading, in their order;
 * CLAUDE.md becomes the one line that brings AGENTS.md in. Nothing is lost: every rule is in AGENTS.md.
 */
export function joinAgentFiles(claude?: string, agents?: string): { claude: string; agents: string } {
  const have = new Set(ruleLines(agents ?? ""));
  const missing = (claude ?? "")
    .split("\n")
    .filter((l) => !LINK.test(l))
    .filter((l) => !l.trim() || /^#+\s/.test(l.trim()) || !have.has(l.trim()));
  const extra = missing.join("\n").trim();
  const base = (agents ?? "").trimEnd();
  const joined = !extra ? base : base ? `${base}\n\n## From CLAUDE.md\n\n${extra}` : extra;
  return { claude: "@AGENTS.md\n", agents: `${joined}\n` };
}

export function registerAgentFileRoutes(app: Hono, projectPath: (id: string) => string | undefined): void {
  app.get("/api/projects/:id/agent-files", (c) => {
    const root = projectPath(c.req.param("id"));
    if (!root) return c.json({ error: "Project not found" }, 404);
    return c.json(compareAgentFiles(read(join(root, "CLAUDE.md")), read(join(root, "AGENTS.md"))));
  });
  // Changes two files in the project, after a checkpoint, so it can be undone from the snapshots.
  app.post("/api/projects/:id/agent-files/join", (c) => {
    const root = projectPath(c.req.param("id"));
    if (!root || !existsSync(root)) return c.json({ error: "Project not found" }, 404);
    const before = compareAgentFiles(read(join(root, "CLAUDE.md")), read(join(root, "AGENTS.md")));
    if (before.state === "joined" || before.state === "none") return c.json(before);
    createCheckpoint(root, "Before joining CLAUDE.md and AGENTS.md");
    const out = joinAgentFiles(read(join(root, "CLAUDE.md")), read(join(root, "AGENTS.md")));
    writeFileSync(join(root, "AGENTS.md"), out.agents);
    writeFileSync(join(root, "CLAUDE.md"), out.claude);
    return c.json(compareAgentFiles(out.claude, out.agents));
  });
}
