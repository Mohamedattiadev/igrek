#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_VERSION } from "@igrek/core";
import { loadConfig } from "./config";
import { checkTools } from "./system";

const HELP: Record<string, string> = {
  git: "Needed to track your projects. Install it from https://git-scm.com",
  claude: "Install Claude Code to use Claude: https://claude.com/claude-code",
  codex: "Install Codex CLI to use Codex: npm install -g @openai/codex",
  gemini: "Install Gemini CLI to use Gemini: npm install -g @google/gemini-cli",
  ssh: "Needed to work on your servers. Install OpenSSH client",
  docker: "Optional. Lets God Eye manage your containers",
};

async function doctor(): Promise<number> {
  const config = loadConfig();
  console.log(`\nGod Eye ${APP_VERSION} — health check\n`);
  console.log(`   Data folder: ${config.dataDir}`);
  console.log(`   Address:     http://localhost:${config.port}\n`);

  let problems = 0;
  for (const tool of await checkTools()) {
    if (tool.found) {
      console.log(`   [ok]   ${tool.id.padEnd(7)} ${tool.version ?? ""}`);
    } else {
      if (tool.required) problems++;
      const mark = tool.required ? "[fail]" : "[--]  ";
      console.log(`   ${mark} ${tool.id.padEnd(7)} not found — ${HELP[tool.id]}`);
    }
  }
  const aiTools = (await checkTools()).filter((t) => ["claude", "codex", "gemini"].includes(t.id) && t.found);
  if (aiTools.length === 0) {
    problems++;
    console.log("\n   [fail] No AI tool found. Install at least one (Claude Code, Codex or Gemini).");
  }
  console.log(problems === 0 ? "\n   Everything looks good.\n" : `\n   ${problems} thing(s) need attention.\n`);
  return problems === 0 ? 0 : 1;
}

/**
 * The local API from a script (plan.md 13.6): the CLI talks to the God Eye running on this
 * computer with the same session key the browser gets (it never leaves this computer).
 */
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = loadConfig();
  const base = `http://localhost:${config.publicPort}`;
  const keyFile = join(config.dataDir, "session.key");
  if (!existsSync(keyFile))
    throw new Error(`God Eye has not run with ${config.dataDir} yet: start it with "bun run start"`);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        cookie: `igrek_session=${readFileSync(keyFile, "utf8").trim()}`,
        origin: base,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(`God Eye is not running at ${base}: start it with "bun run start"`);
  }
  const text = await res.text();
  const data = (
    text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return text;
          }
        })()
      : null
  ) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `${res.status} ${res.statusText}`);
  return data;
}

type ProjectRow = {
  id: string;
  name: string;
  status?: string;
  sessionCount: number;
  activeSessions: number;
  lastActivity: number;
  hidden: boolean;
};

async function project(name: string): Promise<ProjectRow> {
  const list = await call<ProjectRow[]>("GET", "/api/projects");
  const found = list.find((p) => p.id === name) ?? list.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`No project called "${name}". Try: godeye projects`);
  return found;
}

const ago = (at: number) => {
  const m = Math.round((Date.now() - at) / 60_000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const USAGE = `God Eye ${APP_VERSION}

Usage: godeye <command>

  doctor                          Check the tools God Eye needs
  status                          Is God Eye running, what is going on
  projects                        Your projects
  search <words>                  Search everything said in your AI sessions
  ask <question> [--project NAME] Ask about your projects (memory and sessions)
  inbox                           What needs your attention
  run <project> <flow> <request>  Start a team run (flows: feature, fix, task, spec, check, report)
  recap [YYYY-MM-DD]              The end-of-day recap ("what did we do")
  weekly                          This week's CEO report
  api <METHOD> <path> [json]      Call the local API directly, e.g. godeye api GET /api/projects
`;

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === "doctor") return doctor();
  if (command === "status") {
    const projects = await call<ProjectRow[]>("GET", "/api/projects");
    const notices = await call<unknown[]>("GET", "/api/inbox/notices");
    const runs = await call<{ status: string }[]>("GET", "/api/flows");
    console.log(`God Eye ${APP_VERSION} is running at http://localhost:${loadConfig().publicPort}`);
    console.log(
      `  ${projects.filter((p) => !p.hidden).length} projects, ${projects.reduce((n, p) => n + p.activeSessions, 0)} AI sessions working now`,
    );
    console.log(
      `  ${runs.filter((r) => ["running", "needs_you", "ready", "waiting_limit"].includes(r.status)).length} team runs open, ${notices.length} inbox notices`,
    );
    return 0;
  }
  if (command === "projects") {
    for (const p of (await call<ProjectRow[]>("GET", "/api/projects")).filter((x) => !x.hidden))
      console.log(
        `${p.name.padEnd(32)} ${(p.status ?? "active").padEnd(9)} ${String(p.sessionCount).padStart(4)} sessions   ${p.activeSessions ? "working now" : ago(p.lastActivity)}`,
      );
    return 0;
  }
  if (command === "search") {
    const q = rest.join(" ").trim();
    if (!q) throw new Error("Usage: godeye search <words>");
    const hits = await call<{ projectName?: string; sessionTitle: string; snippet: string; ts: number }[]>(
      "GET",
      `/api/search?q=${encodeURIComponent(q)}`,
    );
    for (const h of hits.slice(0, 20))
      console.log(
        `${new Date(h.ts).toISOString().slice(0, 10)}  ${h.projectName ?? ""} / ${h.sessionTitle}\n    ${h.snippet
          .replace(/\[\[|\]\]/g, "")
          .replace(/\s+/g, " ")
          .slice(0, 160)}`,
      );
    if (!hits.length) console.log("No matches.");
    return 0;
  }
  if (command === "ask") {
    const i = rest.indexOf("--project");
    const projectName = i >= 0 ? rest[i + 1] : undefined;
    const question = rest
      .filter((_, k) => k !== i && k !== i + 1)
      .join(" ")
      .trim();
    if (!question) throw new Error("Usage: godeye ask <question> [--project NAME]");
    const projectId = projectName ? (await project(projectName)).id : undefined;
    const answer = await call<{ answer?: string; text?: string }>("POST", "/api/ask", { question, projectId });
    console.log(answer.answer ?? answer.text ?? JSON.stringify(answer, null, 2));
    return 0;
  }
  if (command === "inbox") {
    const notices = await call<{ kind: string; projectName: string; detail: string; at: number }[]>(
      "GET",
      "/api/inbox/notices",
    );
    for (const n of notices.slice(0, 40))
      console.log(
        `${ago(n.at).padEnd(10)} ${n.kind.padEnd(12)} ${n.projectName ? `${n.projectName}: ` : ""}${n.detail}`,
      );
    if (!notices.length) console.log("Nothing needs you.");
    return 0;
  }
  if (command === "run") {
    const [name, flow, ...words] = rest;
    if (!name || !flow || !words.length) throw new Error("Usage: godeye run <project> <flow> <request>");
    const p = await project(name);
    const run = await call<{ id: string }>("POST", "/api/flows", { projectId: p.id, flow, request: words.join(" ") });
    console.log(`Started. Follow it at http://localhost:${loadConfig().publicPort}/runs/${run.id}`);
    return 0;
  }
  if (command === "recap") {
    const now = new Date();
    const day =
      rest[0] ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const got = await call<{ recap: { text: string } | null }>("GET", `/api/recap?day=${day}`);
    const recap = got.recap ?? (await call<{ text: string }>("POST", "/api/recap", { day, language: "en" }));
    console.log(recap.text);
    return 0;
  }
  if (command === "weekly") {
    console.log((await call<{ text: string }>("POST", "/api/weekly", {})).text);
    return 0;
  }
  if (command === "api") {
    const [method, path, json] = rest;
    if (!method || !path?.startsWith("/api/")) throw new Error("Usage: godeye api <METHOD> </api/path> [json]");
    const out = await call<unknown>(method.toUpperCase(), path, json ? JSON.parse(json) : undefined);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
    return 0;
  }
  console.log(USAGE);
  return command && command !== "help" && command !== "--help" ? 1 : 0;
}

if (import.meta.main)
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: Error) => {
      console.error(err.message);
      process.exit(1);
    });

export { main };
