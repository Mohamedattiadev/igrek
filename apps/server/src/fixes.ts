import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";

/**
 * One-click fixes for warnings that need no model (plan.md 7.2, "nothing left to do by hand"): a fixed
 * list, each a command Igrek builds itself from what it knows. The page shows the command first and
 * runs it only after the user's OK, in a terminal they watch. The client names a fix, never a command,
 * so a page cannot make the server run something of its own.
 */
const FIX_IDS = [
  "install-claude",
  "install-codex",
  "login-codex",
  "login-gh",
  "login-glab",
  "lockfile",
  "untrack-env",
  "install-chromium",
  "install-adb",
  "install-node",
] as const;
type FixId = (typeof FIX_IDS)[number];

export interface FixPlan {
  id: FixId;
  command: string;
  /** "home" for a tool on this computer, the project's folder for a fix in it. */
  cwd: string;
}

export interface FixContext {
  platform: NodeJS.Platform;
  home: string;
  /** Whether a program is on PATH. */
  has: (bin: string) => boolean;
  /** For a project's fix: its folder and the paths the last health scan named. */
  project?: { path: string; evidence: string[] };
}

/** One path inside the project, written so a shell reads it as it is. */
function quote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

/** Paths from a scan: relative, inside the project, no tricks. */
function safePaths(paths: string[]): string[] {
  return paths.filter((p) => p && !p.startsWith("/") && !p.split("/").includes("..") && !/[\0\n]/.test(p));
}

function packageManager(root: string, has: FixContext["has"]): "bun" | "pnpm" | "npm" | undefined {
  let declared = "";
  try {
    declared = String(
      (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { packageManager?: unknown }).packageManager ??
        "",
    );
  } catch {
    // No package.json at the top (a workspace below): go by what is installed.
  }
  if ((declared.startsWith("bun") || existsSync(join(root, "bunfig.toml"))) && has("bun")) return "bun";
  if ((declared.startsWith("pnpm") || existsSync(join(root, "pnpm-workspace.yaml"))) && has("pnpm")) return "pnpm";
  if (has("npm")) return "npm";
  return has("bun") ? "bun" : undefined;
}

/** Writes only the lockfile: nothing is installed and no package's install script runs. */
const LOCK_ONLY = {
  bun: "bun install --lockfile-only --ignore-scripts",
  pnpm: "pnpm install --lockfile-only --ignore-scripts",
  npm: "npm install --package-lock-only --ignore-scripts",
};

function lockfilePlan(ctx: FixContext): string | { error: string } {
  const project = ctx.project;
  if (!project) return { error: "This fix is for a project" };
  const pm = packageManager(project.path, ctx.has);
  if (!pm) return { error: "Neither npm, pnpm nor bun is installed on this computer" };
  const dirs = [...new Set(safePaths(project.evidence).map((p) => p.replace(/(^|\/)package\.json$/, "") || "."))];
  if (!dirs.length) return { error: "The last health scan found no package without a lockfile" };
  return dirs.map((d) => (d === "." ? LOCK_ONLY[pm] : `(cd ${quote(d)} && ${LOCK_ONLY[pm]})`)).join(" && ");
}

function untrackEnvPlan(ctx: FixContext): string | { error: string } {
  const files = safePaths(ctx.project?.evidence ?? []).filter((p) => /(^|\/)\.env(\.[^/]*)?$/.test(p));
  if (!ctx.project || !files.length) return { error: "The last health scan found no .env file in git" };
  // The files stay on disk; git stops tracking them, and .gitignore keeps them out from now on.
  const ignore = `grep -qxF '.env' .gitignore 2>/dev/null || printf '%s\\n' '.env' '.env.*' '!.env.example' >> .gitignore`;
  return `git rm --cached -- ${files.map(quote).join(" ")} && ${ignore}`;
}

/** A program from the system's own package manager; sudo asks for the password in the terminal. */
const PACKAGES: Record<string, Record<string, string>> = {
  "install-chromium": { pacman: "chromium", apt: "chromium", dnf: "chromium", brew: "--cask chromium" },
  "install-adb": { pacman: "android-tools", apt: "adb", dnf: "android-tools", brew: "--cask android-platform-tools" },
  "install-node": { pacman: "nodejs npm", apt: "nodejs npm", dnf: "nodejs npm", brew: "node" },
};

function packagePlan(id: FixId, ctx: FixContext): string | { error: string } {
  const names = PACKAGES[id];
  if (!names) return { error: "Unknown fix" };
  if (ctx.has("brew") && names.brew) return `brew install ${names.brew}`;
  if (ctx.has("pacman")) return `sudo pacman -S --needed ${names.pacman}`;
  if (ctx.has("apt-get")) return `sudo apt-get install -y ${names.apt}`;
  if (ctx.has("dnf")) return `sudo dnf install -y ${names.dnf}`;
  return { error: "No package manager Igrek knows (pacman, apt, dnf or Homebrew) was found" };
}

function toolPlan(id: FixId, ctx: FixContext): string | { error: string } {
  if (id === "install-claude")
    return ctx.platform === "win32"
      ? "irm https://claude.ai/install.ps1 | iex"
      : "curl -fsSL https://claude.ai/install.sh | bash";
  if (id === "install-codex")
    return ctx.has("npm")
      ? "npm install -g @openai/codex"
      : { error: "Codex installs with npm, which is not installed" };
  const cli = { "login-codex": "codex", "login-gh": "gh", "login-glab": "glab" }[id as string];
  if (!cli) return { error: "Unknown fix" };
  if (!ctx.has(cli)) return { error: `${cli} is not installed on this computer` };
  return cli === "codex" ? "codex login" : `${cli} auth login`;
}

export function planFix(id: string, ctx: FixContext): FixPlan | { error: string } {
  const known = FIX_IDS.find((f) => f === id);
  if (!known) return { error: "Unknown fix" };
  const command =
    known === "lockfile"
      ? lockfilePlan(ctx)
      : known === "untrack-env"
        ? untrackEnvPlan(ctx)
        : PACKAGES[known]
          ? packagePlan(known, ctx)
          : toolPlan(known, ctx);
  if (typeof command !== "string") return command;
  return { id: known, command, cwd: ctx.project?.path ?? ctx.home };
}

/** What the routes need: where a project is, the last scan's findings, and a terminal to run in. */
export interface FixDeps {
  projectPath: (projectId: string) => string | undefined;
  evidence: (projectId: string, checkId: string) => string[];
  run: (plan: FixPlan, projectId?: string) => { id: string };
  context: () => Omit<FixContext, "project">;
}

/** The health check a project fix answers. */
const CHECK: Partial<Record<FixId, string>> = { lockfile: "deps.lockfile", "untrack-env": "sec.envTracked" };

function planFor(deps: FixDeps, id: string, projectId: string | undefined): FixPlan | { error: string } {
  const check = CHECK[id as FixId];
  const path = projectId ? deps.projectPath(projectId) : undefined;
  if (check && !path) return { error: "Project not found" };
  const project = check && path && projectId ? { path, evidence: deps.evidence(projectId, check) } : undefined;
  return planFix(id, { ...deps.context(), project });
}

export function registerFixRoutes(app: Hono, deps: FixDeps): void {
  // The command a fix would run, shown before the user agrees.
  app.get("/api/fixes/:id", (c) => {
    const plan = planFor(deps, c.req.param("id"), c.req.query("project") || undefined);
    return "error" in plan ? c.json(plan, 400) : c.json(plan);
  });
  // Runs it in a terminal the user sees (and can stop).
  app.post("/api/fixes/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: unknown };
    const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : undefined;
    const plan = planFor(deps, c.req.param("id"), projectId);
    if ("error" in plan) return c.json(plan, 400);
    try {
      return c.json(deps.run(plan, projectId));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
