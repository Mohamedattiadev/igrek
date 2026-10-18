import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreCategories } from "./checks";
import { takeSnapshot } from "./snapshot";
import { parseAudit, planTools, runTool } from "./tools";

describe("project tools", () => {
  test("plans come from the project's own scripts and package manager", () => {
    const root = mkdtempSync(join(tmpdir(), "igrek-tools-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { typecheck: "tsc", lint: "biome check", test: "bun test" } }),
    );
    writeFileSync(join(root, "bun.lock"), "");
    const plans = planTools(root).map((p) => [p.kind, p.command.join(" ")]);
    expect(plans).toEqual([
      ["typecheck", "bun run typecheck"],
      ["lint", "bun run lint"],
      ["test", "bun test"],
      ["audit", "bun audit --json"],
    ]);
  });

  test("audit output in the different formats", () => {
    expect(parseAudit(JSON.stringify({ metadata: { vulnerabilities: { low: 1, high: 2, total: 3 } } }))).toEqual({
      low: 1,
      high: 2,
    });
    expect(
      parseAudit(JSON.stringify({ vulnerabilities: { a: { severity: "critical" }, b: { severity: "low" } } })),
    ).toEqual({ critical: 1, low: 1 });
    expect(parseAudit(JSON.stringify({ lodash: [{ severity: "moderate" }] }))).toEqual({ moderate: 1 });
    expect(
      parseAudit(`{"type":"auditAdvisory","data":{"advisory":{"severity":"high"}}}\n{"type":"auditSummary"}`),
    ).toEqual({ high: 1 });
  });

  test("a real run: exit code, test counts and secrets removed from output", async () => {
    const root = mkdtempSync(join(tmpdir(), "igrek-tools-"));
    const result = await runTool(
      root,
      {
        kind: "test",
        command: ["sh", "-c", "echo '3 pass'; echo '1 fail'; echo sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123; exit 1"],
      },
      () => () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.tests).toEqual({ passed: 3, failed: 1 });
    expect(result.output).not.toContain("abcdefghijklmnop");
  });

  test("tool results and scoring choices change the scores", () => {
    const root = mkdtempSync(join(tmpdir(), "igrek-tools-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { a: "^1" } }));
    writeFileSync(join(root, "index.ts"), "export const a: number = 1;\n");
    writeFileSync(join(root, "README.md"), "# x\n");
    const snap = takeSnapshot(root);
    const base = scoreCategories(snap);
    const failing = scoreCategories(snap, {
      tools: [
        {
          kind: "typecheck",
          command: "tsc",
          exitCode: 2,
          ok: false,
          ms: 1,
          at: Date.now(),
          output: "index.ts(1,14): error TS2322",
        },
        {
          kind: "audit",
          command: "audit",
          exitCode: 1,
          ok: false,
          ms: 1,
          at: Date.now(),
          output: "",
          vulnerabilities: { high: 1 },
        },
      ],
    });
    const arch = (r: typeof base) => r.categories.find((c) => c.category === "architecture");
    expect(arch(failing)?.score).toBeLessThan(arch(base)?.score ?? 0);
    expect(arch(failing)?.findings.find((f) => f.id === "tool.typecheck")?.evidence).toEqual([
      { path: "index.ts", line: 1 },
    ]);
    expect(
      failing.categories.find((c) => c.category === "security")?.findings.some((f) => f.id === "tool.auditSecurity"),
    ).toBe(true);
    // Turning a check off and weighting a part to 0.
    const tuned = scoreCategories(snap, { config: { weights: { docs: 0 }, disabled: ["arch.readme"] } });
    expect(arch(tuned)?.findings.some((f) => f.id === "arch.readme")).toBe(false);
    expect(tuned.catalog.architecture).toContain("arch.readme");
  });
});

describe("dead code tools", () => {
  test("knip headings and one-line-per-finding tools are both counted", async () => {
    const { countDead } = await import("./tools");
    expect(countDead("Unused files (2)\nsrc/a.ts\nsrc/b.ts\nUnused exports (3)\nx  src/c.ts:1:1\n")).toBe(5);
    expect(
      countDead("app.py:12: unused function 'old' (60% confidence)\napp.py:30: unused variable 'x' (60% confidence)\n"),
    ).toBe(2);
    expect(countDead("main.go:8:6: func helper is unused (U1000)\n")).toBe(1);
    expect(countDead("")).toBe(0);
  });

  test("knip is planned only when the project has it installed, and the gate leaves it out", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, chmodSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { planTools, runChecks, runTool } = await import("./tools");
    const root = mkdtempSync(join(tmpdir(), "gd-dead-"));
    writeFileSync(join(root, "package.json"), "{}");
    expect(planTools(root).some((p) => p.kind === "dead")).toBe(false);
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(root, "node_modules/.bin/knip"), "#!/bin/sh\necho 'Unused files (1)'\necho src/x.ts\nexit 1\n");
    chmodSync(join(root, "node_modules/.bin/knip"), 0o755);
    expect(planTools(root).find((p) => p.kind === "dead")?.command[0]).toBe("./node_modules/.bin/knip");
    const plan = planTools(root).find((p) => p.kind === "dead");
    const result = plan ? await runTool(root, plan, () => () => undefined) : undefined;
    expect(result).toMatchObject({ kind: "dead", dead: 1, ok: false });
    const ran = await runChecks(root, () => () => undefined);
    expect(ran.some((r) => r.kind === "dead")).toBe(false);
  });
});
