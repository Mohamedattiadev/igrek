import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  getRoutes,
  SESSION,
  seededProjectId,
  seedProject,
  startTestServer,
  type TestServer,
  writeRoutes,
} from "./test-server";

/**
 * Every route of a real server answers without crashing, on a fresh install with one project in it:
 * every GET, then every route that changes something, called with an empty body. Unit tests cover the
 * logic; this catches a route that throws once all the parts are wired together (routes.ts and its
 * neighbours had almost no tests of their own). A 500 means an error nobody handled; a deliberate 502
 * (an outside tool failed) or 503 is fine here.
 */

interface Call {
  method: string;
  route: string;
}

/** A concrete path for a route: the seeded project and chat where the route names them, "missing" elsewhere. */
function concrete(route: string, project?: string): string {
  let path = route;
  if (project) path = path.replace(/^\/api\/projects\/:[\w]+/, `/api/projects/${project}`);
  path = path.replace(/^\/api\/sessions\/:[\w]+/, `/api/sessions/${SESSION}`);
  return path.replace(/:[\w]+(\{[^}]*\})?/g, "missing").replace(/\*/g, "missing");
}

async function crashes(server: TestServer, calls: Call[], project?: string): Promise<string[]> {
  const failures: string[] = [];
  for (const { method, route } of calls) {
    const path = concrete(route, project);
    const body = method === "get" || method === "delete" ? undefined : "{}";
    const status = await server
      .call(path, {
        method: method.toUpperCase(),
        headers: body ? { "content-type": "application/json" } : {},
        body,
        signal: AbortSignal.timeout(20_000),
      })
      .then((res) => res.status)
      .catch((e: Error) => e.name);
    if (status === 500 || typeof status !== "number") failures.push(`${status} ${method} ${path}`);
  }
  return failures;
}

describe("API smoke test (a real server, sealed off)", () => {
  let server: TestServer;
  let project: string | undefined;

  beforeAll(async () => {
    server = await startTestServer({ seed: seedProject });
    project = await seededProjectId(server);
  }, 60_000);

  afterAll(async () => {
    await server?.stop();
  });

  test("the routes are found in the source", () => {
    const routes = getRoutes();
    expect(routes.length).toBeGreaterThan(150);
    expect(routes).toContain("/api/projects");
    expect(routes).toContain("/api/projects/:id");
    const writes = writeRoutes().map((r) => r.route);
    expect(writes.length).toBeGreaterThan(200);
    // What reaches into the real machine is never called.
    expect(writes).not.toContain("/api/docker/:name/:action");
    expect(writes).not.toContain("/api/update");
  });

  test("the seeded chat becomes a project", () => {
    expect(project).toBeString();
  });

  test("the API stays closed without the session cookie and to other hosts", async () => {
    expect((await fetch(`${server.url}/api/projects`)).status).toBe(401);
    const foreign = await fetch(`${server.url}/api/health`, { headers: { host: "evil.example" } });
    expect(foreign.status).toBe(403);
  });

  test("the project page's main data is there", async () => {
    const res = await server.call(`/api/projects/${project}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).toContain("demo-shop");
  });

  test("no GET route crashes", async () => {
    const calls = getRoutes().map((route) => ({ method: "get", route }));
    expect(await crashes(server, calls, project), server.output().slice(-3000)).toEqual([]);
  }, 300_000);

  // Last: these change the install (and in the end delete the project).
  test("no route that changes something crashes on an empty request", async () => {
    expect(await crashes(server, writeRoutes(), project), server.output().slice(-3000)).toEqual([]);
  }, 300_000);
});
