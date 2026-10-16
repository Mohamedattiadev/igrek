import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolKind, ToolPlan, ToolResult } from "@godeye/core";
import { cleanEnv } from "../env";
import { scrub } from "../sync/scrub";

/**
 * The project's own checks (plan.md 5.3): type check, lint, tests and a
 * dependency audit. These run the project's code, so God Eye only proposes
 * them; the user sees each exact command and starts it.
 */

const TIMEOUT = 5 * 60_000;
const MAX_OUTPUT = 6000;

function packageManager(root: string): "bun" | "pnpm" | "yarn" | "npm" {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

function scripts(root: string): Record<string, string> {
  try {
    return (
      (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ??
      {}
    );
  } catch {
    return {};
  }
}

/** What could be run here, detected from package.json and config files. */
export function planTools(root: string): ToolPlan[] {
  const out: ToolPlan[] = [];
  const pm = packageManager(root);
  const s = scripts(root);
  const run = (script: string) => (pm === "npm" ? ["npm", "run", "--silent", script] : [pm, "run", script]);
  const typecheck = ["typecheck", "type-check", "check-types", "tsc"].find((k) => s[k]);
  if (typecheck) out.push({ kind: "typecheck", command: run(typecheck) });
  else if (existsSync(join(root, "tsconfig.json")))
    out.push({
      kind: "typecheck",
      command: pm === "bun" ? ["bunx", "tsc", "--noEmit"] : ["npx", "--no-install", "tsc", "--noEmit"],
    });
  const lint = ["lint", "check"].find((k) => s[k]);
  if (lint) out.push({ kind: "lint", command: run(lint) });
  if (s.test && !/no test specified/.test(s.test))
    out.push({ kind: "test", command: pm === "bun" && /^bun test/.test(s.test) ? ["bun", "test"] : run("test") });
  else if (
    existsSync(join(root, "pytest.ini")) ||
    existsSync(join(root, "conftest.py")) ||
    existsSync(join(root, "tests"))
  ) {
    if (Bun.which("pytest")) out.push({ kind: "test", command: ["pytest", "-q"] });
  }
  if (existsSync(join(root, "package.json"))) {
    const audit: Record<string, string[]> = {
      bun: ["bun", "audit", "--json"],
      pnpm: ["pnpm", "audit", "--json"],
      yarn: ["yarn", "npm", "audit", "--json"],
      npm: ["npm", "audit", "--json"],
    };
    if (pm !== "npm" || existsSync(join(root, "package-lock.json")))
      out.push({ kind: "audit", command: audit[pm] as string[] });
  } else if (existsSync(join(root, "requirements.txt")) && Bun.which("pip-audit"))
    out.push({ kind: "audit", command: ["pip-audit", "-r", "requirements.txt", "-f", "json"] });
  return out.filter((p) => Bun.which(p.command[0] ?? ""));
}

/** Counts by severity from npm/pnpm/bun/yarn/pip-audit JSON (the formats differ). */
export function parseAudit(output: string): Record<string, number> | undefined {
  const counts: Record<string, number> = {};
  const add = (sev: unknown) => {
    const key = String(sev ?? "unknown").toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const chunk of output.split("\n").filter((l) => l.trim().startsWith("{"))) {
    try {
      const json = JSON.parse(chunk) as Record<string, unknown>;
      const meta = (json.metadata as { vulnerabilities?: Record<string, number> } | undefined)?.vulnerabilities;
      if (meta) {
        for (const [k, v] of Object.entries(meta)) if (k !== "total" && v) counts[k] = (counts[k] ?? 0) + v;
        continue;
      }
      if (json.vulnerabilities && typeof json.vulnerabilities === "object") {
        for (const v of Object.values(json.vulnerabilities as Record<string, { severity?: string }>)) add(v.severity);
        continue;
      }
      if (json.advisories && typeof json.advisories === "object") {
        for (const v of Object.values(json.advisories as Record<string, { severity?: string }>)) add(v.severity);
        continue;
      }
      // bun audit: { "pkg": [ { severity } ] }
      const values = Object.values(json);
      if (values.length && values.every(Array.isArray)) {
        for (const list of values as { severity?: string }[][]) for (const v of list) add(v.severity);
        continue;
      }
      // yarn: one advisory per line
      if (json.type === "auditAdvisory") add((json.data as { advisory?: { severity?: string } })?.advisory?.severity);
      // pip-audit
      if (Array.isArray(json.dependencies))
        for (const d of json.dependencies as { vulns?: unknown[] }[]) for (const _v of d.vulns ?? []) add("unknown");
    } catch {
      // not JSON
    }
  }
  try {
    // A single pretty-printed JSON document.
    if (!Object.keys(counts).length && output.trim().startsWith("{"))
      return parseAudit(JSON.stringify(JSON.parse(output)));
  } catch {
    return undefined;
  }
  return counts;
}

export async function runTool(
  root: string,
  plan: ToolPlan,
  register: (stop: () => void) => () => void,
): Promise<ToolResult> {
  const started = Date.now();
  const proc = Bun.spawn(plan.command, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: cleanEnv({ CI: "1", FORCE_COLOR: "0" }),
  });
  const unregister = register(() => proc.kill());
  const timer = setTimeout(() => proc.kill(), TIMEOUT);
  try {
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const output = `${out}${err ? `\n${err}` : ""}`;
    const result: ToolResult = {
      kind: plan.kind,
      command: plan.command.join(" "),
      exitCode: code,
      ok: code === 0,
      ms: Date.now() - started,
      at: Date.now(),
      // The end of the output is where the failures and summaries are.
      output: scrub(output.length > MAX_OUTPUT ? `…\n${output.slice(-MAX_OUTPUT)}` : output),
    };
    if (plan.kind === "audit") {
      result.vulnerabilities = parseAudit(output);
      // Audit tools exit non-zero when they find something; that's a result, not a failure to run.
      result.ok = !!result.vulnerabilities && Object.values(result.vulnerabilities).every((n) => n === 0);
    }
    if (plan.kind === "test") {
      const passed = output.match(/(\d+)\s+(pass|passed|passing)\b/i);
      const failed = output.match(/(\d+)\s+(fail|failed|failing)\b/i);
      result.tests = { passed: passed ? Number(passed[1]) : undefined, failed: failed ? Number(failed[1]) : undefined };
    }
    return result;
  } finally {
    clearTimeout(timer);
    unregister();
  }
}

export const TOOL_KINDS: ToolKind[] = ["typecheck", "lint", "test", "audit"];
