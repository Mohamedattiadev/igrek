import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freePort, injectAgent, planDevServer } from "./devservers";

describe("live preview", () => {
  test("the picker goes into HTML pages", () => {
    expect(injectAgent("<html><head><title>x</title></head><body></body></html>")).toContain(
      '<script src="/__godeye/agent.js"></script></head>',
    );
    expect(injectAgent("<body class='a'><p>hi</p></body>")).toContain(
      "<body class='a'><script src=\"/__godeye/agent.js\"></script>",
    );
  });

  test("the dev script and package manager are found; a plain vite script can carry the source plugin", () => {
    const dir = mkdtempSync(join(tmpdir(), "godeye-dev-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: "vite", build: "vite build" }, devDependencies: { vite: "8" } }),
    );
    writeFileSync(join(dir, "bun.lock"), "");
    mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".bin", "vite"), "");
    expect(planDevServer(dir)).toEqual({
      script: "dev",
      command: ["bun", "run", "dev"],
      framework: "vite",
      vite: true,
    });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { start: "next dev" }, dependencies: { next: "16" } }),
    );
    expect(planDevServer(dir)).toMatchObject({ script: "start", framework: "next", vite: false });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }));
    expect(planDevServer(dir)).toBeUndefined();
  });

  test("a free port is found", async () => {
    const port = await freePort(45000);
    expect(port).toBeGreaterThanOrEqual(45000);
  });
});
