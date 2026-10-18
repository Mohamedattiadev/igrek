import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type { Hono } from "hono";
import { planTools } from "./insight/tools";
import type { Store } from "./store";

const MARK = "# Igrek pre-commit gate";

export type CommitHookState = "none" | "ours" | "other" | "noGit";

function hookFile(root: string): string | undefined {
  // --git-path follows core.hooksPath and linked worktrees.
  const proc = Bun.spawnSync(["git", "-C", root, "rev-parse", "--git-path", "hooks/pre-commit"], { stderr: "ignore" });
  const path = proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
  if (!path) return undefined;
  return isAbsolute(path) ? path : join(root, path);
}

/** Single-quoted for sh. */
const quote = (arg: string) => (/^[\w./:=@+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`);

/** The hook: the project's own checks, stopping the commit at the first that fails. */
export function hookScript(commands: string[][]): string {
  const lines = commands.map((command) => {
    const line = command.map(quote).join(" ");
    return `${line} || { echo "Igrek: '${line.replace(/'/g, "")}' failed, commit stopped. Fix it, or skip once with git commit --no-verify."; exit 1; }`;
  });
  return `#!/bin/sh\n${MARK}: runs this project's checks before every commit. Remove it from the project's Setup tab in Igrek.\ncd "$(git rev-parse --show-toplevel)" || exit 1\n${lines.join("\n")}\n`;
}

function hookCommands(root: string): string[][] {
  return planTools(root)
    .filter((p) => p.kind !== "audit")
    .map((p) => p.command);
}

/**
 * An optional git pre-commit hook (plan.md 15.5 gate points) that runs the project's typecheck,
 * lint and tests. It is only written where no other hook is (husky, lefthook and hand-written
 * hooks are left alone) and only removed when it is Igrek's own.
 */
export function commitHookState(root: string): CommitHookState {
  const file = hookFile(root);
  if (!file) return "noGit";
  if (!existsSync(file)) return "none";
  return readFileSync(file, "utf8").includes(MARK) ? "ours" : "other";
}

export function installCommitHook(root: string): CommitHookState {
  const state = commitHookState(root);
  if (state === "noGit") throw new Error("This folder is not a git repository");
  if (state === "other") throw new Error("This project already has a pre-commit hook; Igrek leaves it as it is");
  const commands = hookCommands(root);
  if (!commands.length) throw new Error("No typecheck, lint or test command was found in this project");
  const file = hookFile(root) as string;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, hookScript(commands));
  chmodSync(file, 0o755);
  return "ours";
}

export function removeCommitHook(root: string): CommitHookState {
  if (commitHookState(root) === "ours") rmSync(hookFile(root) as string, { force: true });
  return commitHookState(root);
}

export function registerCommitHookRoutes(app: Hono, store: Store): void {
  const view = (root: string) => ({
    state: commitHookState(root),
    commands: hookCommands(root).map((c) => c.join(" ")),
  });
  app.get("/api/projects/:id/commit-hook", (c) => {
    const project = store.projectRow(c.req.param("id"));
    return project ? c.json(view(project.path)) : c.json({ error: "Project not found" }, 404);
  });
  app.post("/api/projects/:id/commit-hook", async (c) => {
    const project = store.projectRow(c.req.param("id"));
    if (!project) return c.json({ error: "Project not found" }, 404);
    const { on } = (await c.req.json().catch(() => ({}))) as { on?: unknown };
    try {
      if (on === true) installCommitHook(project.path);
      else removeCommitHook(project.path);
      return c.json(view(project.path));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
  });
}
