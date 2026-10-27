import { describe, expect, test } from "bun:test";
import { accessReport } from "./server-access";
import { firewallCommand, openPorts } from "./server-ports";

// A VPS like the one this was written for: Caddy on 80/443, a database published by Docker, ufw on.
const PORTS = [
  'LISTEN:tcp~0.0.0.0:22~users:(("sshd",pid=1,fd=3));tcp~0.0.0.0:443~users:(("caddy",pid=9,fd=7));tcp~0.0.0.0:5432~users:(("docker-proxy",pid=33,fd=4));tcp~127.0.0.1:8080~users:(("node",pid=40,fd=20));tcp~[::]:22~users:(("sshd",pid=1,fd=4));udp~224.0.0.251:5353~;tcp~0.0.0.0:9100~users:(("node_exporter",pid=50,fd=3));',
  "UFW:Status: active",
  "RULES:OpenSSH ALLOW Anywhere;443/tcp ALLOW Anywhere;OpenSSH (v6) ALLOW Anywhere (v6);",
  "DOCKER:db=0.0.0.0:5432->5432/tcp;web=127.0.0.1:8080->80/tcp;",
].join("\n");

describe("a server's open ports and firewall", () => {
  test("each port says who listens, whether the world can reach it, and what the firewall does", () => {
    const { ports, firewall } = openPorts(PORTS);
    expect(firewall).toBe("active");
    const at = (port: number) => ports.find((p) => p.port === port);
    expect(at(22)).toMatchObject({ program: "sshd", public: true, firewall: "open" });
    expect(at(443)).toMatchObject({ program: "caddy", public: true, firewall: "open" });
    // Docker publishes the database around ufw: open to the world although no rule allows it.
    expect(at(5432)).toMatchObject({ public: true, firewall: "open", container: "db" });
    expect(at(9100)).toMatchObject({ program: "node_exporter", public: true, firewall: "closed" });
    expect(at(8080)?.public).toBe(false);
    expect(at(5353)?.public).toBe(false);
    // One line per port and side, not one per address family.
    expect(ports.filter((p) => p.port === 22)).toHaveLength(1);
    // The ones the world can reach come first.
    expect(ports[0]?.public).toBe(true);
  });

  test("a firewall change is one ufw command, and the SSH port is never closed from here", () => {
    expect(firewallCommand("open", 9100, "tcp")).toEqual({ command: "ufw allow 9100/tcp" });
    expect(firewallCommand("close", 5432, "tcp")).toEqual({ command: "ufw deny 5432/tcp" });
    expect(firewallCommand("forget", 8080, "udp")).toEqual({ command: "ufw delete allow 8080/udp" });
    expect(firewallCommand("close", 22, "tcp")).toHaveProperty("error");
    expect(firewallCommand("close", 2222, "tcp", 2222)).toHaveProperty("error");
    expect(firewallCommand("open", "22; rm -rf /", "tcp")).toEqual({ error: "Not a port" });
    expect(firewallCommand("drop", 80, "tcp")).toEqual({ error: "Unknown change" });
  });
});

describe("who used a server", () => {
  test("sign-ins name the person by their key's label; tries, sudo and who is on now are counted", () => {
    const report = accessReport(
      [
        "WHO:root~pts/0~2026-10-27 10:02~85.10.1.2;",
        "ACCEPTED:2026-10-26T09:00:00+0300~root~85.10.1.2~publickey~SHA256:aaa;2026-10-27T10:02:00+0300~root~31.4.5.6~publickey~SHA256:bbb;2026-10-27T11:00:00+0300~deploy~31.4.5.6~password~;",
        "KEYS:SHA256:aaa~ati@laptop~root;SHA256:bbb~kerim@macbook~root;",
        "FAILEDN:340",
        "FAILEDBY:45.9.1.1~200;61.2.2.2~140;",
        "SUDO:2026-10-27T11:05:00+0300~deploy~/usr/bin/apt update;",
        "JOURNAL:yes",
      ].join("\n"),
    );
    expect(report.readable).toBe(true);
    expect(report.logins.map((l) => [l.user, l.who ?? l.method])).toEqual([
      ["deploy", "password"],
      ["root", "kerim@macbook"],
      ["root", "ati@laptop"],
    ]);
    expect(report.logins[1]?.at).toBe(Date.parse("2026-10-27T10:02:00+03:00"));
    expect(report.now).toEqual([{ user: "root", tty: "pts/0", since: "2026-10-27 10:02", from: "85.10.1.2" }]);
    expect(report.failed).toEqual({
      total: 340,
      top: [
        { ip: "45.9.1.1", count: 200 },
        { ip: "61.2.2.2", count: 140 },
      ],
    });
    expect(report.sudo[0]).toMatchObject({ user: "deploy", command: "/usr/bin/apt update" });
    expect(accessReport("JOURNAL:no").readable).toBe(false);
  });
});
