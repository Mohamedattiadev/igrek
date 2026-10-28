import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { addressIn, discoverParts, Launcher } from "./launcher";
import { Services } from "./preview/services";

/** A project like PoultryCareAI: a monorepo with two apps, a worker in a Procfile, a Makefile, Compose. */
function project(): string {
  const root = mkdtempSync(join(tmpdir(), "igrek-launch-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "poultry", scripts: { dev: "turbo dev" } }));
  writeFileSync(join(root, "pnpm-lock.yaml"), "");
  for (const [app, scripts] of [
    ["web", { dev: "vite", build: "vite build" }],
    ["api", { start: "node server.js" }],
    ["docs", { build: "x" }],
  ] as const) {
    mkdirSync(join(root, "apps", app), { recursive: true });
    writeFileSync(join(root, "apps", app, "package.json"), JSON.stringify({ name: app, scripts }));
  }
  writeFileSync(join(root, "Procfile"), "worker: echo Listening on port 4917 && sleep 30\n");
  writeFileSync(join(root, "Makefile"), "dev-db:\n\techo db\nbuild:\n\techo b\nX := 1\n");
  writeFileSync(join(root, "docker-compose.yml"), "services:\n  db:\n    image: postgres\n");
  return root;
}

/** Docker as it answers for a file with one service, "db", that is not running. */
function fakeDocker(calls: string[][]) {
  return new Services(async (args) => {
    calls.push(args);
    if (args.includes("config")) return { code: 0, out: "db\n", err: "" };
    return { code: 0, out: "", err: "" };
  });
}

describe("starting a project (plan.md 19.4)", () => {
  test("every part the project names is found: each app's dev script, the Procfile, Makefile targets", () => {
    const parts = discoverParts(project());
    expect(parts.map((p) => [p.id, p.command])).toEqual([
      ["script:.:dev", "pnpm run dev"],
      ["script:apps/api:start", "pnpm run start"],
      ["script:apps/web:dev", "pnpm run dev"],
      ["procfile:worker", "echo Listening on port 4917 && sleep 30"],
      ["make:dev-db", "make dev-db"],
    ]);
  });

  test("the address a part serves is read from what it prints", () => {
    expect(addressIn("  ➜  Local:   http://localhost:5173/")).toEqual({ url: "http://localhost:5173", port: 5173 });
    expect(addressIn("Server listening on 0.0.0.0:8000 at http://0.0.0.0:8000")).toMatchObject({ port: 8000 });
    expect(addressIn("Listening on port 3001")).toEqual({ port: 3001 });
    expect(addressIn("compiled 12 modules")).toBeUndefined();
  });

  test("a part starts, says its port, writes its log and stops; Compose services start one by one", async () => {
    const root = project();
    const { sqlite } = openDb(":memory:");
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'poultry', ?, 1)").run(root);
    const calls: string[][] = [];
    const launcher = new Launcher(sqlite, new Bus(), new StopRegistry(), fakeDocker(calls), () => root);
    const before = await launcher.parts("p");
    expect(before.map((p) => `${p.id}:${p.status}`)).toContain("compose:db:stopped");
    await launcher.start("p", "procfile:worker");
    for (
      let i = 0;
      i < 100 && (await launcher.parts("p")).find((p) => p.id === "procfile:worker")?.port === undefined;
      i++
    )
      await Bun.sleep(30);
    expect((await launcher.parts("p")).find((p) => p.id === "procfile:worker")).toMatchObject({
      status: "running",
      port: 4917,
    });
    expect(launcher.logs("p", "procfile:worker")).toContain("Listening on port 4917");
    await launcher.stop("p", "procfile:worker");
    expect((await launcher.parts("p")).find((p) => p.id === "procfile:worker")?.status).toBe("stopped");
    await launcher.start("p", "compose:db");
    expect(calls.some((a) => a.join(" ") === "compose -f docker-compose.yml up -d db")).toBe(true);
    await expect(launcher.start("p", "script:../../etc:x")).rejects.toThrow(/not in the project/);
  });

  test("the parts chosen to start on open start when the project is opened, the others do not", async () => {
    const root = project();
    const { sqlite } = openDb(":memory:");
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'poultry', ?, 1)").run(root);
    const calls: string[][] = [];
    const launcher = new Launcher(sqlite, new Bus(), new StopRegistry(), fakeDocker(calls), () => root);
    launcher.setAuto("p", ["compose:db"]);
    expect(launcher.auto("p")).toEqual(["compose:db"]);
    await launcher.opened("p");
    expect(calls.filter((a) => a.includes("up")).map((a) => a.at(-1))).toEqual(["db"]);
    expect((await launcher.parts("p")).filter((p) => p.kind !== "compose").every((p) => p.status === "stopped")).toBe(
      true,
    );
    launcher.stopEverything();
  });
});
