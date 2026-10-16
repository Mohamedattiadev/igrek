import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreCategories } from "./checks";
import { takeSnapshot } from "./snapshot";
import { parseAudit, planTools, runTool } from "./tools";

describe("project tools", () => {
  test("plans come from the project's own scripts and package manager", () => {
    const root = mkdtempSync(join(tmpdir(), "godeye-tools-"));
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
    const root = mkdtempSync(join(tmpdir(), "godeye-tools-"));
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
    const root = mkdtempSync(join(tmpdir(), "godeye-tools-"));
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
