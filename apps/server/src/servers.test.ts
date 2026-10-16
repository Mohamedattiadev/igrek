import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bus, StopRegistry } from "./bus";
import { migrate } from "./db";
import { parseHealth, Servers, sshConfigHosts, validTarget } from "./servers";

function setup() {
  const sqlite = new Database(":memory:");
  migrate(sqlite);
  const bus = new Bus();
  const events: string[] = [];
  bus.subscribe((m) => events.push(m.type));
  return { servers: new Servers(sqlite, bus, new StopRegistry()), events };
}

describe("servers", () => {
  test("targets can't smuggle ssh options", () => {
    expect(validTarget("deploy@195.2.10.4")).toBe(true);
    expect(validTarget("prod-vps")).toBe(true);
    expect(validTarget("-oProxyCommand=evil")).toBe(false);
    expect(validTarget("a b")).toBe(false);
    const { servers } = setup();
    expect(() => servers.add({ name: "x", target: "-oProxyCommand=sh" })).toThrow();
  });

  test("reads host aliases from ~/.ssh/config, skipping wildcards", () => {
    const file = join(mkdtempSync(join(tmpdir(), "godeye-ssh-")), "config");
    writeFileSync(
      file,
      "Host *\n  ServerAliveInterval 30\nHost prod-vps vps\n  HostName 195.2.10.4\n  User deploy\n  Port 2222\n",
    );
    expect(sshConfigHosts(file)).toEqual([
      { alias: "prod-vps", hostname: "195.2.10.4", user: "deploy", port: 2222 },
      { alias: "vps", hostname: "195.2.10.4", user: "deploy", port: 2222 },
    ]);
  });

  test("understands the health probe output", () => {
    const health = parseHealth(
      "UP:up 3 days\nLOAD:0.10 0.20 0.30\nDISK:71%\nMEM:43\nCT:api\tUp 2 hours\nFAIL:backup.service\n",
    );
    expect(health).toEqual({
      uptime: "up 3 days",
      load: "0.10 0.20 0.30",
      diskPercent: 71,
      memPercent: 43,
      containers: [{ name: "api", status: "Up 2 hours" }],
      failedUnits: ["backup.service"],
    });
  });

  test("user runs need confirmations that match the risk", async () => {
    const { servers } = setup();
    const server = servers.add({ name: "prod", target: "deploy@example.invalid", tag: "prod" });
    await expect(
      servers.run(server.id, "systemctl restart nginx", { confirmations: 0, actor: "user" }),
    ).rejects.toThrow(/1 confirmation/);
    await expect(servers.run(server.id, "rm -rf /srv/app", { confirmations: 1, actor: "user" })).rejects.toThrow(
      /2 confirmation/,
    );
  });

  test("agent requests that change something wait for the user, and a denial is final", async () => {
    const { servers, events } = setup();
    servers.add({ name: "prod", target: "deploy@example.invalid", tag: "prod" });
    const request = await servers.agentRequest("prod", "docker compose restart api", "restart after config change");
    expect(request.status).toBe("pending");
    const id = request.status === "pending" ? request.approvalId : "";
    expect(servers.pendingApprovals()).toMatchObject([
      { serverName: "prod", risk: "change", reason: "restart after config change" },
    ]);
    expect(events).toContain("approvals");
    await servers.decide(id, false);
    expect(servers.approvalStatus(id)?.status).toBe("denied");
    expect(servers.pendingApprovals()).toHaveLength(0);
    // Deciding again changes nothing.
    await servers.decide(id, true);
    expect(servers.approvalStatus(id)?.status).toBe("denied");
  });

  test("unknown servers get a helpful error for the agent", async () => {
    const { servers } = setup();
    await expect(servers.agentRequest("nope", "ls", "")).rejects.toThrow(/Servers/);
  });
});
