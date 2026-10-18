import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { architectureOf } from "./patterns";
import { takeSnapshot } from "./snapshot";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gd-arch-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("architecture patterns", () => {
  test("layered: closed layers; skipping the business layer and reaching up are flagged", () => {
    const root = project({
      "package.json": "{}",
      "src/controllers/orders.ts":
        'import { listOrders } from "../services/orders";\nimport { db } from "../repositories/orders";\n',
      "src/services/orders.ts": 'import { db } from "../repositories/orders";\nexport const listOrders = () => db;\n',
      "src/repositories/orders.ts": 'import { route } from "../controllers/orders";\nexport const db = 1;\n',
    });
    const report = architectureOf(takeSnapshot(root));
    expect(report.pattern).toBe("layered");
    expect(report.violations.map((v) => [v.rule, v.from])).toEqual([
      ["skipsLayer", "src/controllers/orders.ts"],
      ["reachesUp", "src/repositories/orders.ts"],
    ]);
  });

  test("separate services with their own image are microservices; a broker means event-driven", () => {
    const services = project({
      "api/package.json": "{}",
      "api/Dockerfile": "FROM node",
      "worker/package.json": "{}",
      "worker/Dockerfile": "FROM node",
    });
    expect(architectureOf(takeSnapshot(services))).toMatchObject({ pattern: "microservices" });
    const events = project({ "package.json": JSON.stringify({ dependencies: { bullmq: "5.0.0" } }), "src/a.ts": "x" });
    expect(architectureOf(takeSnapshot(events))).toMatchObject({
      pattern: "eventDriven",
      evidence: ["brokers:bullmq"],
    });
    expect(architectureOf(takeSnapshot(project({ "index.ts": "x" }))).pattern).toBe("unknown");
  });
});
