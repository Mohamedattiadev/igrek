import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getRoutes, SESSION, seededProjectId, seedProject, startTestServer, type TestServer } from "./test-server";

/**
 * Every GET route of a real server answers without a server error, on a fresh install with one
 * project in it. Unit tests cover the logic; this catches a route that throws once all the parts are
 * wired together (routes.ts and its neighbours had almost no tests of their own).
 */

/** A concrete path for a route: the seeded project and chat where the route names them, "missing" elsewhere. */
function concrete(route: string, ids: { project?: string }): string {
  let path = route;
  if (ids.project) path = path.replace(/^\/api\/projects\/:[\w]+/, `/api/projects/${ids.project}`);
  path = path.replace(/^\/api\/sessions\/:[\w]+/, `/api/sessions/${SESSION}`);
  return path.replace(/:[\w]+(\{[^}]*\})?/g, "missing").replace(/\*/g, "missing");
}

async function serverErrors(server: TestServer, ids: { project?: string }): Promise<string[]> {
  const failures: string[] = [];
  for (const route of getRoutes()) {
    const path = concrete(route, ids);
    const status = await server
      .call(path, { signal: AbortSignal.timeout(20_000) })
      .then((res) => res.status)
      .catch((e: Error) => e.name);
    if (typeof status !== "number" || status >= 500) failures.push(`${status} ${path}`);
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
  });

  test("the seeded chat becomes a project", () => {
    expect(project).toBeString();
  });

  test("no GET route answers with a server error", async () => {
    const failures = await serverErrors(server, { project });
    expect(failures, server.output().slice(-3000)).toEqual([]);
  }, 300_000);

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
});
