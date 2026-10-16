import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvFiles, mask } from "./envfiles";

const SECRET = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "godeye-env-"));
  writeFileSync(
    join(root, ".env"),
    `# keys\nANTHROPIC_API_KEY=${SECRET}\nPORT=abc\nDATABASE_URL=localhost:5432\nEMPTY=\nOLD=1\n`,
    { mode: 0o600 },
  );
  writeFileSync(join(root, ".env.example"), "ANTHROPIC_API_KEY=\nPORT=3000\n");
  mkdirSync(join(root, "apps/api"), { recursive: true });
  writeFileSync(join(root, "apps/api/.env.production"), `PORT=8080\nANTHROPIC_API_KEY="${SECRET}"\n`);
  const used = [
    { name: "ANTHROPIC_API_KEY", refs: [{ path: "src/a.ts", line: 3 }], documented: true, provider: "anthropic" },
    { name: "PORT", refs: [], documented: true },
    { name: "STRIPE_SECRET_KEY", refs: [{ path: "src/pay.ts", line: 9 }], documented: false, provider: "stripe" },
  ];
  return { root, env: new EnvFiles(join(root, "..", `${root.split("/").pop()}-backups`)), used };
}

describe("env files", () => {
  test("lists files with their environment and never returns raw values", () => {
    const { root, env, used } = setup();
    const o = env.overview(root, used);
    expect(o.files.map((f) => [f.path, f.env, f.example])).toEqual([
      [".env", "default", false],
      [".env.example", "default", true],
      ["apps/api/.env.production", "production", false],
    ]);
    expect(JSON.stringify(o)).not.toContain("abcdefghijklmnop");
    const key = o.keys.find((k) => k.name === "ANTHROPIC_API_KEY");
    expect(key?.values[".env"]?.masked).toBe("sk-••••6789");
    expect(key?.provider).toBe("anthropic");
    const issues = (name: string) => o.keys.find((k) => k.name === name)?.issues.map((i) => i.kind);
    expect(issues("PORT")).toContain("format");
    expect(issues("DATABASE_URL")).toContain("format");
    expect(issues("EMPTY")).toContain("empty");
    expect(issues("OLD")).toContain("unused");
    expect(issues("STRIPE_SECRET_KEY")).toEqual(["missing"]);
  });

  test("reveal, set, remove with backups; comments and permissions kept", () => {
    const { root, env } = setup();
    expect(env.reveal(root, "apps/api/.env.production", "ANTHROPIC_API_KEY")).toBe(SECRET);
    env.set(root, ".env", "PORT", "3000");
    env.set(root, ".env", "NEW_KEY", "has space");
    env.remove(root, ".env", "OLD");
    const text = readFileSync(join(root, ".env"), "utf8");
    expect(text).toContain("# keys\n");
    expect(text).toContain("PORT=3000\n");
    expect(text).toContain('NEW_KEY="has space"');
    expect(text).not.toContain("OLD=");
    expect(statSync(join(root, ".env")).mode & 0o777).toBe(0o600);
    const history = env.history(root, ".env");
    expect(history.length).toBeGreaterThanOrEqual(1);
    env.restore(root, ".env", history.at(-1)?.id ?? "");
    expect(readFileSync(join(root, ".env"), "utf8")).toContain("PORT=abc");
  });

  test("refuses anything that isn't an env file inside the project", () => {
    const { root, env } = setup();
    expect(() => env.reveal(root, "../../etc/passwd", "root")).toThrow();
    expect(() => env.set(root, "package.json", "A", "1")).toThrow();
    expect(() => env.set(root, "../.env", "A", "1")).toThrow();
    expect(() => env.set(root, ".env", "BAD KEY", "1")).toThrow();
    expect(() => env.set(root, ".env", "A", "line\nbreak")).toThrow();
  });

  test(".env.example gets names, never values", () => {
    const { root, env, used } = setup();
    const { added } = env.syncExample(root, used);
    expect(added).toEqual(["DATABASE_URL", "EMPTY", "OLD", "STRIPE_SECRET_KEY"]);
    const text = readFileSync(join(root, ".env.example"), "utf8");
    expect(text).toContain("STRIPE_SECRET_KEY=\n");
    expect(text).not.toContain("localhost:5432");
    expect(text).not.toContain(SECRET);
  });

  test("multi-line quoted values (private keys) are read, replaced and removed as one", () => {
    const { root, env } = setup();
    writeFileSync(
      join(root, ".env.local"),
      'A=1\nPRIVATE_KEY="-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----"\nB=2\n',
    );
    expect(env.reveal(root, ".env.local", "PRIVATE_KEY")).toBe("-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----");
    expect(env.reveal(root, ".env.local", "B")).toBe("2");
    env.set(root, ".env.local", "PRIVATE_KEY", "short");
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("A=1\nPRIVATE_KEY=short\nB=2\n");
    writeFileSync(join(root, ".env.local"), 'A=1\nPRIVATE_KEY="x\ny"\nB=2\n');
    env.remove(root, ".env.local", "PRIVATE_KEY");
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe("A=1\nB=2\n");
  });

  test("mask", () => {
    expect(mask("")).toBe("");
    expect(mask("short")).toBe("••••••");
    expect(mask("abcdefghij")).toBe("abc••••");
  });
});
