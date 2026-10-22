import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeFiles, runningServices, Services } from "./services";

describe("a project's services", () => {
  test("compose files are found in the usual places, the development one first", () => {
    const root = mkdtempSync(join(tmpdir(), "svc-"));
    mkdirSync(join(root, "infra", "compose"), { recursive: true });
    writeFileSync(join(root, "docker-compose.prod.yml"), "");
    writeFileSync(join(root, "infra", "compose", "docker-compose.dev.yml"), "");
    writeFileSync(join(root, "infra", "notes.yml"), "");
    expect(composeFiles(root)).toEqual(["infra/compose/docker-compose.dev.yml", "docker-compose.prod.yml"]);
  });

  test("both shapes of `docker compose ps --format json` are read", () => {
    expect([...runningServices('{"Service":"db","State":"running"}\n{"Service":"cache","State":"exited"}')]).toEqual([
      "db",
    ]);
    expect([...runningServices('[{"Service":"db","State":"running"}]')]).toEqual(["db"]);
    expect(runningServices("").size).toBe(0);
  });

  test("services show their state, and starting runs `up -d` on the development file", async () => {
    const root = mkdtempSync(join(tmpdir(), "svc-"));
    writeFileSync(join(root, "compose.yaml"), "");
    const calls: string[] = [];
    const services = new Services(async (args) => {
      calls.push(args.join(" "));
      if (args.includes("--services")) return { code: 0, out: "db\ncache\n", err: "" };
      if (args.includes("ps")) return { code: 0, out: '{"Service":"db","State":"running"}', err: "" };
      return { code: 0, out: "", err: "" };
    });
    expect(await services.list(root)).toEqual({
      file: "compose.yaml",
      services: [
        { name: "db", running: true },
        { name: "cache", running: false },
      ],
    });
    await services.start(root);
    expect(calls).toContain("compose -f compose.yaml up -d");
  });
});
