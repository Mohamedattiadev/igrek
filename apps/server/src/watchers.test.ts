import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { Store } from "./store";
import { compareVersions, DependencyWatcher, SecretScanner, secretsInPatch } from "./watchers";

// Built at run time so this file itself holds no secret-looking text.
const FAKE_KEY = ["sk", "live", "x".repeat(4) + "Q".repeat(20)].join("_");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "godeye-watch-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  return { dir, git };
}

describe("secret scanning", () => {
  test("added lines with keys are found with file and line; placeholders and removed lines are not", () => {
    const patch = `+++ b/src/pay.ts\n@@ -1,0 +3,2 @@\n+const ok = 1;\n+const key = "${FAKE_KEY}";\n+++ b/.env.example\n@@ -0,0 +1 @@\n+STRIPE_KEY=${FAKE_KEY}\n-old = "${FAKE_KEY}"`;
    expect(secretsInPatch(patch)).toEqual([{ file: "src/pay.ts", line: 4, hint: expect.stringMatching(/^sk_l••••/) }]);
    // Tests and fixtures hold made-up keys on purpose.
    expect(
      secretsInPatch(
        `+++ b/src/pay.test.ts\n@@ -0,0 +1 @@\n+const key = "${FAKE_KEY}";\n+++ b/test/fixtures/keys.json\n@@ -0,0 +1 @@\n+"${FAKE_KEY}"`,
      ),
    ).toEqual([]);
  });

  test("placeholders in guides are not secrets; real-looking values still are", () => {
    const patch = (line: string) => `+++ b/docs/guide.md\n@@ -0,0 +1 @@\n+${line}`;
    for (const line of [
      "TOKEN=paste-the-token-here",
      'export FLASK_SECRET_KEY="paste-the-key-here"',
      "MONGODB_URI=mongodb://blog_app:PASSWORD@localhost:27017/?authSource=admin",
      "DATABASE_URL=postgres://app:<password>@db:5432/app",
      "API_KEY=your-api-key-goes-in-here",
      "SECRET_KEY=xxxxxxxxxxxx",
    ])
      expect(secretsInPatch(patch(line))).toEqual([]);
    // In code, a type or a value made at run time is not a secret either.
    const code = (line: string) => `+++ b/src/x.ts\n@@ -0,0 +1 @@\n+${line}`;
    expect(secretsInPatch(code("export const SECRET_PATTERNS: RegExp[] = [];"))).toEqual([]);
    expect(secretsInPatch(code('SECRET_KEY="$(openssl rand -hex 32)"'))).toEqual([]);
    expect(secretsInPatch(code("const env = password ? { PGPASSWORD: password } : {};"))).toEqual([]);
    expect(secretsInPatch(code('const url = "postgres://postgres:learn@127.0.0.1:55432";'))).toEqual([]);
    expect(secretsInPatch(code('placeholder="postgres://user:password@host:5432/db"'))).toEqual([]);
    expect(
      secretsInPatch(code('const pem = "-----BEGIN RSA PRIVATE KEY-----\\nMIIabc\\n-----END RSA PRIVATE KEY-----";')),
    ).toEqual([]);
    // Guides and teaching content: example credentials are fine, a real provider key is not.
    expect(secretsInPatch(patch("DATABASE_URL=postgres://postgres:postgres@localhost:5432/app"))).toEqual([]);
    expect(secretsInPatch(`+++ b/packages/learn/content/x.yaml\n@@ -0,0 +1 @@\n+  SECRET_KEY=dev-only-1234`)).toEqual(
      [],
    );
    expect(secretsInPatch(patch(`key: ${FAKE_KEY}`))).toHaveLength(1);
    const real = ["Zq81", "vR2t", "Lm0p", "Wx7c"].join("");
    expect(secretsInPatch(code(`const SECRET_KEY = "${real}${real}";`))).toHaveLength(1);
    expect(secretsInPatch(`+++ b/.env\n@@ -0,0 +1 @@\n+SECRET_KEY=${real}${real}`)).toHaveLength(1);
    expect(secretsInPatch(code(`DATABASE_URL=postgres://app:${real}@db/app`)).length).toBeGreaterThan(0);
  });

  test("new commits are scanned once; the pre-commit check answers OK or the lines", () => {
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const { dir, git } = repo();
    const projectId = store.addProject(dir);
    const scanner = new SecretScanner(sqlite, store);
    expect(scanner.scan(projectId)).toBe(0);
    writeFileSync(join(dir, "pay.ts"), `export const key = "${FAKE_KEY}";\n`);
    git("add", "-A");
    git("commit", "-qm", "add payments");
    expect(scanner.scan(projectId)).toBe(1);
    expect(scanner.scan(projectId)).toBe(0);
    const [f] = scanner.list(projectId);
    expect(f).toMatchObject({ file: "pay.ts", line: 1 });
    expect(scanner.notices()[0]?.kind).toBe("secret");
    scanner.dismiss(projectId, f?.hash as string, "pay.ts", 1);
    expect(scanner.list(projectId)).toEqual([]);
    expect(scanner.check("+++ b/x\n@@ -0,0 +1 @@\n+hello")).toBe("OK");
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    scanner.installGuard(dir, dir, 7777);
    expect(scanner.guardInstalled(dir)).toBe(true);
  });
});

describe("dependency watcher", () => {
  test("versions compared and vulnerabilities from OSV attached", async () => {
    expect(compareVersions("4.2.1", "5.0.0")).toBe("major");
    expect(compareVersions("4.2.1", "4.3.0")).toBe("minor");
    expect(compareVersions("4.2.1", "4.2.3")).toBe("patch");
    expect(compareVersions("4.2.1", "4.2.1")).toBe("none");
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    const dir = mkdtempSync(join(tmpdir(), "godeye-deps-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4.17.20", local: "workspace:*" } }),
    );
    const projectId = store.addProject(dir);
    const fake = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("registry.npmjs.org/lodash")) return Response.json({ version: "4.17.21" });
      if (url.endsWith("/querybatch")) return Response.json({ results: [{ vulns: [{ id: "GHSA-test" }] }] });
      if (url.includes("/vulns/GHSA-test"))
        return Response.json({ summary: "Prototype pollution", database_specific: { severity: "HIGH" } });
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const watcher = new DependencyWatcher(sqlite, store, fake);
    const report = await watcher.check(projectId);
    expect(report.deps).toEqual([
      {
        name: "lodash",
        ecosystem: "npm",
        current: "4.17.20",
        latest: "4.17.21",
        outdated: "patch",
        vulns: [{ id: "GHSA-test", summary: "Prototype pollution", severity: "HIGH" }],
      },
    ]);
    expect(watcher.notices()[0]).toMatchObject({ kind: "vuln", detail: "lodash@4.17.20" });
  });
});
