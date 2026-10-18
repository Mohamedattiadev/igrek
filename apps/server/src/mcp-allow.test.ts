import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every write Igrek's own MCP server makes must be allowed for agents, or its tools break.
describe("agent writes", () => {
  test("each POST in mcp.ts is in the app's allow list", () => {
    const mcp = readFileSync(join(import.meta.dir, "mcp.ts"), "utf8");
    const app = readFileSync(join(import.meta.dir, "app.ts"), "utf8");
    const posts = [...mcp.matchAll(/post<[^>]*>\(\s*["`](\/api[^"`$]+)/g)].map((m) => m[1]);
    expect(posts.length).toBeGreaterThan(0);
    const allowed = app.match(/AGENT_WRITES = new Set\(\[([^\]]*)\]/)?.[1] ?? "";
    for (const path of posts) expect(allowed).toContain(`"${path}"`);
  });
});
