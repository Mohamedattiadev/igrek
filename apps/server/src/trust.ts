import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** God Eye's own hook (memory for new sessions) is not something to ask about. */
const OWN_HOOK = /igrek-hook|godeye-hook/;

/** What a project would make Claude Code run or load on its own: hooks, MCP servers, skills. */
export interface ProjectExtensions {
  hooks: string[];
  mcpServers: string[];
  skills: string[];
  /** Changes when any of it changes, so a changed project is asked about again. */
  fingerprint: string;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function names(dir: string, suffix = ""): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => !n.startsWith(".") && n.endsWith(suffix))
      .map((n) => n.slice(0, n.length - suffix.length))
      .sort();
  } catch {
    return [];
  }
}

/** [event, command] of every hook in the project's Claude Code settings, except God Eye's own. */
function projectHooks(root: string): [string, string][] {
  const out: [string, string][] = [];
  for (const file of ["settings.json", "settings.local.json"]) {
    const byEvent = (readJson(join(root, ".claude", file))?.hooks ?? {}) as Record<
      string,
      { hooks?: { command?: string }[] }[]
    >;
    for (const [event, entries] of Object.entries(byEvent))
      for (const command of (entries ?? []).flatMap((e) => (e.hooks ?? []).map((h) => h.command ?? "")))
        if (command && !OWN_HOOK.test(command)) out.push([event, command]);
  }
  return out;
}

/**
 * The project's own Claude Code extensions (plan.md 16.4). A repository someone else wrote can
 * run commands through its hooks and MCP servers, so God Eye asks before a chat loads them.
 */
export function projectExtensions(root: string): ProjectExtensions | undefined {
  const commands = projectHooks(root);
  const hooks = commands.map(([event, command]) => `${event}: ${command.slice(0, 200)}`);
  const seen: unknown[] = [...commands];
  const mcp = readJson(join(root, ".mcp.json"));
  const mcpServers = Object.keys((mcp?.mcpServers ?? {}) as Record<string, unknown>).sort();
  if (mcp) seen.push(mcp.mcpServers);
  const skills = [...names(join(root, ".claude", "skills")), ...names(join(root, ".claude", "commands"), ".md")];
  for (const skill of names(join(root, ".claude", "skills"))) {
    const file = join(root, ".claude", "skills", skill, "SKILL.md");
    if (existsSync(file)) seen.push(readFileSync(file, "utf8"));
  }
  if (!hooks.length && !mcpServers.length && !skills.length) return undefined;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([seen, skills]))
    .digest("hex")
    .slice(0, 16);
  return { hooks, mcpServers, skills, fingerprint };
}

export function isTrusted(db: Database, projectId: string, fingerprint: string): boolean {
  const row = db.query("SELECT fingerprint FROM project_trust WHERE project_id = ?").get(projectId) as {
    fingerprint: string;
  } | null;
  return row?.fingerprint === fingerprint;
}

export function trust(db: Database, projectId: string, fingerprint: string | null): void {
  if (fingerprint === null) db.query("DELETE FROM project_trust WHERE project_id = ?").run(projectId);
  else
    db.query(
      `INSERT INTO project_trust (project_id, fingerprint, decided_at) VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET fingerprint = excluded.fingerprint, decided_at = excluded.decided_at`,
    ).run(projectId, fingerprint, Date.now());
}

/** For runs nobody watches (team runs, schedules, test users): the project's own extensions stay out, trusted or not. */
export function unattendedArgs(root: string): string[] {
  const ext = projectExtensions(root);
  return ext ? untrustedArgs(ext) : [];
}

/** Claude Code flags that leave the project's own extensions out: user settings only, only our MCP servers. */
export function untrustedArgs(ext: ProjectExtensions): string[] {
  return [
    "--setting-sources",
    "user",
    "--strict-mcp-config",
    ...(ext.skills.length ? ["--disable-slash-commands"] : []),
  ];
}
