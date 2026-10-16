import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bus, StopRegistry } from "../bus";
import { migrate } from "../db";
import { Store } from "../store";
import { scoreCategories } from "./checks";
import { databaseDiagram, groupOf } from "./diagram";
import { Insight } from "./index";
import { takeSnapshot } from "./snapshot";

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "godeye-insight-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const finding = (r: ReturnType<typeof scoreCategories>, id: string) =>
  r.categories.flatMap((c) => c.findings).find((f) => f.id === id);

describe("checks", () => {
  test("a small web app: parts are detected and problems point at file and line", () => {
    const root = repo({
      "package.json": JSON.stringify({
        name: "demo",
        dependencies: { react: "^19.0.0", express: "*", pg: "^8" },
        scripts: { test: "vitest" },
      }),
      "src/App.tsx": 'export function App() {\n  return <img src="/a.png" />;\n}\n',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture is source code with a template literal in it
      "src/server/db.ts": "export const q = (id: string) => db.query(`SELECT * FROM users WHERE id = ${id}`);\n",
      "src/server/key.ts": 'const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";\n',
      "src/App.test.tsx": 'const fake = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";\n',
      ".env": "SECRET=1\n",
      ".env.prod.example": "SECRET=\n",
    });
    const r = scoreCategories(takeSnapshot(root));
    const present = r.categories.map((c) => c.category);
    expect(present).toEqual(
      expect.arrayContaining([
        "architecture",
        "frontend",
        "uiux",
        "backend",
        "database",
        "security",
        "testing",
        "docs",
        "dependencies",
      ]),
    );
    expect(present).not.toContain("devops");
    expect(finding(r, "ux.alt")?.evidence[0]).toEqual({ path: "src/App.tsx", line: 2 });
    expect(finding(r, "db.injection")?.evidence[0]).toEqual({ path: "src/server/db.ts", line: 1 });
    // The real key is found; the fake one in a test file isn't. The example .env isn't "tracked .env".
    expect(finding(r, "sec.secrets")?.evidence).toEqual([{ path: "src/server/key.ts", line: 1 }]);
    expect(finding(r, "sec.envTracked")?.evidence).toEqual([{ path: ".env" }]);
    expect(finding(r, "deps.loose")?.evidence[0]?.note).toBe("express@*");
    expect(finding(r, "test.exists")?.status).toBe("pass");
    // Fixing the biggest problem must say how many points it is worth.
    const security = r.categories.find((c) => c.category === "security");
    expect(security?.findings[0]?.gain).toBeGreaterThan(0);
    expect(security?.score).toBeLessThan(60);
  });

  test("secret values never appear in findings", () => {
    const root = repo({ "a.ts": 'export const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";\n' });
    expect(JSON.stringify(scoreCategories(takeSnapshot(root)))).not.toContain("sk-ant-api03");
  });

  test("diagrams: groups and tables, not comment examples", () => {
    expect(groupOf("apps/web/src/x.ts")).toBe("apps/web");
    expect(groupOf("src/lib/x.ts")).toBe("src/lib");
    const root = repo({
      "db.ts":
        "// CREATE TABLE example (x int)\nconst m = `CREATE TABLE users (\n id TEXT PRIMARY KEY,\n name TEXT\n);\nCREATE TABLE posts (\n id TEXT,\n user_id TEXT REFERENCES users(id)\n);`;\n",
    });
    const diagram = databaseDiagram(takeSnapshot(root)) ?? "";
    expect(diagram).toContain("users {");
    expect(diagram).toContain("users ||--o{ posts");
    expect(diagram).not.toContain("example");
  });
});

describe("insight service", () => {
  test("scans in a worker, keeps a trend, finds related sessions", async () => {
    const root = repo({ "package.json": "{}", "src/index.ts": "export const a = 1;\n", "README.md": "# Demo\n" });
    const db = new Database(":memory:");
    migrate(db);
    db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Demo', ?, 0)").run(root);
    db.query(
      "INSERT INTO sessions (id, project_id, tool, title, updated_at, files_touched) VALUES ('s1', 'p1', 'claude', 'Touch index', 5, ?)",
    ).run(JSON.stringify([join(root, "src/index.ts")]));
    const insight = new Insight(
      db,
      new Store(db),
      new Bus(),
      new StopRegistry(),
      () => ({ language: "tr" }) as never,
      root,
    );
    const first = await insight.scan("p1");
    await insight.scan("p1");
    expect(first.categories.length).toBeGreaterThan(0);
    const latest = insight.latest("p1");
    expect("trend" in latest && latest.trend.length).toBe(2);
    const architecture = insight.detail("p1", "architecture");
    expect(architecture?.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(architecture?.trend.length).toBe(2);
    insight.stop();
  });
});
