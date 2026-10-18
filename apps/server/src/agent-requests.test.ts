import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRequests } from "./agent-requests";
import { openDb } from "./db";
import { EnvFiles } from "./envfiles";
import type { Personas } from "./personas";
import { Store } from "./store";
import type { Vault } from "./vault";

function setup() {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "igrek-agentreq-"));
  store.addProject(dir);
  const vaulted: { name: string; value: string }[] = [];
  const vault = { addItem: async (i: { name: string; value: string }) => (vaulted.push(i), "v1") } as unknown as Vault;
  const requests = new AgentRequests(
    store,
    vault,
    new EnvFiles(mkdtempSync(join(tmpdir(), "igrek-envb-"))),
    {} as Personas,
  );
  return { requests, dir, vaulted };
}

describe("secrets agents ask for", () => {
  test("bad names and files outside the project are refused", () => {
    const { requests, dir } = setup();
    expect(() => requests.requestSecret({ cwd: dir, key: "stripe key", reason: "x" })).toThrow();
    expect(() => requests.requestSecret({ cwd: dir, key: "API_KEY", file: "../.env" })).toThrow();
    expect(() => requests.requestSecret({ cwd: dir, key: "API_KEY", file: "/etc/passwd" })).toThrow();
    expect(() => requests.requestSecret({ cwd: dir, key: "API_KEY", file: "src/main.ts" })).toThrow();
    expect(() => requests.requestSecret({ cwd: "/nowhere", key: "API_KEY" })).toThrow();
  });

  test("the user's answer goes to the vault and the env file; the agent only sees that it is stored", async () => {
    const { requests, dir, vaulted } = setup();
    const r = requests.requestSecret({ cwd: dir, key: "STRIPE_API_KEY", reason: "payments", file: ".env.local" });
    expect(requests.notices().map((n) => n.kind)).toEqual(["secretRequest"]);
    await requests.answerSecret(r.id, "sk_test_123");
    expect(vaulted).toEqual([expect.objectContaining({ name: "STRIPE_API_KEY", value: "sk_test_123" })]);
    expect(readFileSync(join(dir, ".env.local"), "utf8")).toContain("STRIPE_API_KEY=sk_test_123");
    const seen = requests.secretStatus(r.id);
    expect(seen).toEqual({ status: "stored", key: "STRIPE_API_KEY", file: ".env.local" });
    expect(JSON.stringify(seen)).not.toContain("sk_test");
    expect(requests.notices()).toEqual([]);
    await expect(requests.answerSecret(r.id, "again")).rejects.toThrow();
  });

  test("a page an agent made waits in the inbox", () => {
    const { requests, dir } = setup();
    const report = requests.showReport({ cwd: dir, title: "Coverage", html: "<h1>81%</h1>" });
    expect(requests.report(report.id)?.html).toBe("<h1>81%</h1>");
    expect(requests.notices()[0]).toMatchObject({ kind: "agentReport", link: `/agent/report/${report.id}` });
  });
});
