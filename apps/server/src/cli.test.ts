import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const seen: { path: string; cookie: string | null; body: string }[] = [];
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    seen.push({
      path: url.pathname + url.search,
      cookie: req.headers.get("cookie"),
      body: req.method === "POST" ? await req.text() : "",
    });
    if (url.pathname === "/api/projects")
      return Response.json([
        { id: "p1", name: "Shop", sessionCount: 3, activeSessions: 0, lastActivity: Date.now(), hidden: false },
      ]);
    if (url.pathname === "/api/flows") return Response.json({ id: "run1" });
    return Response.json({ error: "nope" }, { status: 404 });
  },
});
const home = mkdtempSync(join(tmpdir(), "godeye-cli-"));
writeFileSync(join(home, "session.key"), "secret-session-key");
const before = { home: process.env.GODEYE_HOME, port: process.env.GODEYE_PORT };
process.env.GODEYE_HOME = home;
process.env.GODEYE_PORT = String(server.port);
afterAll(() => {
  server.stop(true);
  // Other test files run in the same process.
  if (before.home === undefined) delete process.env.GODEYE_HOME;
  else process.env.GODEYE_HOME = before.home;
  if (before.port === undefined) delete process.env.GODEYE_PORT;
  else process.env.GODEYE_PORT = before.port;
});

describe("godeye CLI", () => {
  test("talks to the local God Eye with this computer's session key; runs a flow by project name", async () => {
    const { main } = await import("./cli");
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["projects"])).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain("Shop");
    expect(await main(["run", "shop", "task", "Rename", "the", "helper"])).toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toContain("/runs/run1");
    log.mockRestore();
    expect(seen.find((s) => s.path === "/api/flows")?.body).toBe(
      '{"projectId":"p1","flow":"task","request":"Rename the helper"}',
    );
    expect(seen.every((s) => s.cookie === "godeye_session=secret-session-key")).toBe(true);
    await expect(main(["run", "nope", "task", "x"])).rejects.toThrow('No project called "nope"');
  });
});
