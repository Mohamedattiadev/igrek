import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FixContext, planFix } from "./fixes";

const base = (installed: string[], project?: FixContext["project"]): FixContext => ({
  platform: "linux",
  home: "/home/u",
  has: (bin) => installed.includes(bin),
  project,
});

describe("one-click fixes", () => {
  test("only fixes from the list; the client cannot name a command", () => {
    expect(planFix("rm -rf /", base(["npm"]))).toEqual({ error: "Unknown fix" });
    expect(planFix("install-codex", base(["npm"]))).toEqual({
      id: "install-codex",
      command: "npm install -g @openai/codex",
      cwd: "/home/u",
    });
    expect(planFix("install-codex", base([]))).toHaveProperty("error");
    expect(planFix("install-claude", { ...base([]), platform: "win32" })).toMatchObject({
      command: "irm https://claude.ai/install.ps1 | iex",
    });
  });

  test("a login needs its tool", () => {
    expect(planFix("login-gh", base(["gh"]))).toMatchObject({ command: "gh auth login" });
    expect(planFix("login-codex", base(["codex"]))).toMatchObject({ command: "codex login" });
    expect(planFix("login-glab", base([]))).toHaveProperty("error");
  });

  test("a lockfile is written without installing or running scripts, per package the scan named", () => {
    const dir = mkdtempSync(join(tmpdir(), "fix-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", packageManager: "pnpm@9.0.0" }));
    const plan = planFix(
      "lockfile",
      base(["npm", "pnpm"], { path: dir, evidence: ["package.json", "web/package.json"] }),
    );
    expect(plan).toEqual({
      id: "lockfile",
      command:
        "pnpm install --lockfile-only --ignore-scripts && (cd 'web' && pnpm install --lockfile-only --ignore-scripts)",
      cwd: dir,
    });
    const npm = planFix("lockfile", base(["npm"], { path: dir, evidence: ["package.json"] }));
    expect(npm).toMatchObject({ command: "npm install --package-lock-only --ignore-scripts" });
  });

  test(".env files leave git but stay on disk; odd paths from a scan are dropped", () => {
    const plan = planFix(
      "untrack-env",
      base([], { path: "/p", evidence: [".env", "api/.env.local", "../../etc/passwd", "/abs/.env", "it's/.env"] }),
    );
    expect(plan).toHaveProperty("command");
    const command = (plan as { command: string }).command;
    expect(command.startsWith("git rm --cached -- '.env' 'api/.env.local' 'it'\\''s/.env' && ")).toBe(true);
    expect(command).not.toContain("passwd");
    expect(command).not.toContain("/abs");
    expect(planFix("untrack-env", base([], { path: "/p", evidence: [] }))).toHaveProperty("error");
  });
});
