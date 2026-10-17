import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { FlowRun } from "@godeye/core";
import type { Flows } from "./flows";
import type { Lessons } from "./lessons";
import type { Store } from "./store";

export const PROJECT_TEMPLATES = {
  saas: "Create the skeleton of a small SaaS web app: a TypeScript web front end, an API server, sign-up and login with hashed passwords, a database with migrations, a settings page, tests for the API, a README with how to run it, and a .env.example (never real secrets).",
  api: "Create the skeleton of an HTTP API server in TypeScript: routing, input validation, error handling, a database layer with migrations, a health endpoint, tests, a README and a .env.example.",
  landing:
    "Create a fast, accessible landing page: one HTML page with clean CSS (no framework needed), a hero, features, pricing and a contact form that works without JavaScript, good contrast and mobile layout, and a README.",
  cli: "Create the skeleton of a command-line tool in TypeScript: argument parsing, --help, one example command, tests, and a README with install and usage.",
  empty: "",
} as const;

export type TemplateId = keyof typeof PROJECT_TEMPLATES;

function git(cwd: string, args: string[]): boolean {
  return Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

/**
 * Project templates (plan.md 11): a new folder with git, a CLAUDE.md / AGENTS.md carrying the
 * conventions and lessons collected from your other projects, then the team builds the skeleton
 * in its own copy (Faz 8) and waits for your OK.
 */
export function bestPractices(store: Store, lessons: Lessons): { conventions: string[]; lessons: string[] } {
  const seen = new Set<string>();
  const conventions: string[] = [];
  for (const p of store.listProjects()) {
    for (const m of store.listMemory(p.id, false)) {
      if (m.section !== "convention") continue;
      const key = m.text.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      conventions.push(m.text);
    }
  }
  const learned = lessons
    .list()
    .filter((l) => l.status === "rule" || l.repeats >= 2)
    .map((l) => l.prevent);
  return { conventions: conventions.slice(0, 25), lessons: [...new Set(learned)].slice(0, 20) };
}

export function createProject(
  deps: { store: Store; flows: Flows; lessons: Lessons },
  args: { name: string; parent: string; template: string; details?: string },
  home = homedir(),
): { projectId: string; path: string; run?: FlowRun } {
  const name = args.name.trim();
  if (!/^[\w.-]{1,60}$/.test(name)) throw new Error("Use letters, numbers, dots, dashes or underscores for the name");
  const parent = resolve(args.parent.trim() || join(home, "Projects"));
  if (!parent.startsWith(home)) throw new Error("Pick a folder inside your home folder");
  const template = (Object.keys(PROJECT_TEMPLATES) as TemplateId[]).find((t) => t === args.template);
  if (!template) throw new Error("Unknown template");
  const path = join(parent, name);
  if (existsSync(path)) throw new Error("A folder with this name already exists there");
  mkdirSync(path, { recursive: true });
  const practices = bestPractices(deps.store, deps.lessons);
  const guide = [
    `# ${name}`,
    "",
    args.details?.trim() ?? "",
    "",
    ...(practices.conventions.length
      ? ["## Conventions (from your other projects)", ...practices.conventions.map((c) => `- ${c}`), ""]
      : []),
    ...(practices.lessons.length
      ? ["## Lessons learned elsewhere", ...practices.lessons.map((l) => `- ${l}`), ""]
      : []),
  ].join("\n");
  writeFileSync(join(path, "CLAUDE.md"), `${guide}\n`);
  writeFileSync(join(path, "AGENTS.md"), `${guide}\n`);
  writeFileSync(join(path, ".gitignore"), "node_modules\n.env\ndist\n");
  git(path, ["init", "-q", "-b", "main"]);
  git(path, ["add", "-A"]);
  git(path, [
    "-c",
    "user.name=God Eye",
    "-c",
    "user.email=god-eye@localhost",
    "commit",
    "-q",
    "-m",
    "Start the project",
  ]);
  const projectId = deps.store.addProject(path);
  const prompt = PROJECT_TEMPLATES[template];
  if (!prompt) return { projectId, path };
  const run = deps.flows.start({
    projectId,
    flow: "task",
    request: `${prompt}\n\nFollow CLAUDE.md (the user's conventions and lessons).${args.details?.trim() ? `\n\nWhat the user wants: ${args.details.trim()}` : ""}`,
  });
  return { projectId, path, run };
}
