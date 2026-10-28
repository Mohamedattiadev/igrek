import type { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectGap } from "@igrek/core";
import type { Hono } from "hono";

/**
 * What a project is missing (plan.md 19.8), for a line of suggestions in its chats and team
 * channels: no tests at all, a README that is missing or left behind by the code, cards waiting,
 * errors from the running app. All read from what is on this computer; nothing asks an AI.
 */

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rs)$|^test_.*\.py$|Tests?\.(cs|java|kt|swift)$/;
const TEST_DIR = /^(tests?|__tests__|spec)$/;
const SKIP = new Set(["node_modules", ".git", "dist", "build", "target", "vendor", ".venv", "venv"]);

/** Whether the project has any test, looking a few folders deep and stopping at the first one. */
export function hasTests(root: string, depth = 4, budget = { left: 4000 }): boolean {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (--budget.left < 0) return true; // a big tree: assume it has tests rather than nag about it
    if (e.isFile() && TEST_FILE.test(e.name)) return true;
    if (e.isDirectory() && TEST_DIR.test(e.name)) return true;
  }
  if (depth === 0) return false;
  return entries.some(
    (e) =>
      e.isDirectory() &&
      !SKIP.has(e.name) &&
      !e.name.startsWith(".") &&
      hasTests(join(root, e.name), depth - 1, budget),
  );
}

/** Commits since the README last changed, and the days since then; undefined without git. */
function readmeAge(root: string): { commits: number; days: number } | undefined {
  const git = (...args: string[]) => {
    const p = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "ignore" });
    return p.exitCode === 0 ? p.stdout.toString().trim() : undefined;
  };
  const last = git("log", "-1", "--format=%H %ct", "--", "README.md", "readme.md", "README");
  if (!last) return undefined;
  const [hash, at] = last.split(" ");
  const commits = Number(git("rev-list", "--count", `${hash}..HEAD`) ?? 0);
  return { commits, days: Math.floor((Date.now() / 1000 - Number(at)) / 86_400) };
}

export function projectGaps(db: Database, projectId: string, root: string): ProjectGap[] {
  const gaps: ProjectGap[] = [];
  if (!hasTests(root)) gaps.push({ kind: "tests" });
  const readme = ["README.md", "readme.md", "README"].some((f) => existsSync(join(root, f)));
  if (!readme) gaps.push({ kind: "readme", missing: true });
  else {
    const age = readmeAge(root);
    // Left behind: the code moved on a lot since, and some time passed.
    if (age && age.commits >= 30 && age.days >= 30) gaps.push({ kind: "readme", count: age.commits });
  }
  const cards = db
    .query("SELECT COUNT(*) AS n FROM board_tasks WHERE project_id = ? AND deleted = 0 AND status = 'review'")
    .get(projectId) as { n: number };
  if (cards.n) gaps.push({ kind: "cards", count: cards.n });
  const errors = db
    .query("SELECT COUNT(*) AS n FROM app_error_groups WHERE status = 'open' AND project_id = ?")
    .get(projectId) as { n: number };
  if (errors.n) gaps.push({ kind: "errors", count: errors.n });
  return gaps;
}

export function registerSuggestionRoutes(
  app: Hono,
  db: Database,
  projectPath: (id: string) => string | undefined,
): void {
  app.get("/api/projects/:id/gaps", (c) => {
    const root = projectPath(c.req.param("id"));
    return c.json(root && existsSync(root) ? projectGaps(db, c.req.param("id"), root) : []);
  });
}
