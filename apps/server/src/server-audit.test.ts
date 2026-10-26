import { describe, expect, test } from "bun:test";
import { findings, scanned, unread } from "./server-audit";

// What the scan printed on the shared VPS this was written for (Ubuntu 24.04, root, Docker, no ufw).
const VPS = [
  "UFW:Status: inactive",
  "SSHD:permitrootlogin yes;passwordauthentication yes;",
  "F2B:active",
  "UU:active",
  "UPD:12",
  "SECUPD:4",
  "REBOOT:no",
  "DISK:54",
  "SWAP:0",
  "PORTS:127.0.0.53%lo:53 127.0.0.1:10050 127.0.0.1:8080 0.0.0.0:443 0.0.0.0:22 0.0.0.0:80 [::]:443 [::]:22",
  "DOCKERPORTS:pda-phpmyadmin-1=127.0.0.1:8080->80/tcp;caddy=0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp;api=3000/tcp;",
  "NTP:yes",
  "FAILED:340",
  "RECLAIM:Images=6.4GB (72%);Containers=0B (0%);",
].join("\n");

describe("a server's security and health findings", () => {
  test("root and password logins, security updates and an off firewall are found, most serious first", () => {
    const list = findings(VPS);
    expect(list.map((f) => f.id)).toEqual([
      "root-password",
      "password-login",
      "security-updates",
      "no-firewall",
      "no-swap",
    ]);
    expect(list.find((f) => f.id === "security-updates")?.detail).toEqual({ count: 4, all: 12 });
    // Turning the firewall on keeps SSH, HTTP and HTTPS open, so nothing working today is cut off.
    expect(list.find((f) => f.id === "no-firewall")?.fix).toContain("ufw allow OpenSSH");
    // Root keeps signing in with a key; only its password stops working.
    expect(list.find((f) => f.id === "root-password")?.fix).toContain("PermitRootLogin prohibit-password");
  });

  test("loopback ports and ports only Caddy publishes on 80/443 are not reported as open", () => {
    const ids = findings(VPS).map((f) => f.id);
    expect(ids).not.toContain("open-ports");
    expect(ids).not.toContain("docker-ports");
  });

  test("a published database port and a full disk are found, with docker's reclaimable space as the fix", () => {
    const out = findings(
      [
        "UFW:Status: active",
        "SSHD:permitrootlogin prohibit-password;passwordauthentication no;",
        "F2B:inactive",
        "UU:inactive",
        "UPD:0",
        "SECUPD:0",
        "REBOOT:yes",
        "DISK:96",
        "SWAP:2047",
        "PORTS:0.0.0.0:22 0.0.0.0:5432",
        "DOCKERPORTS:db=0.0.0.0:5432->5432/tcp;",
        "NTP:no",
        "FAILED:12",
        "RECLAIM:Images=3GB (50%);",
      ].join("\n"),
    );
    expect(out.map((f) => [f.id, f.severity])).toEqual([
      ["disk-full", "high"],
      ["no-fail2ban", "medium"],
      ["no-auto-updates", "medium"],
      ["reboot", "medium"],
      ["docker-ports", "medium"],
      ["clock", "low"],
      ["open-ports", "info"],
    ]);
    expect(out.find((f) => f.id === "disk-full")?.fix).toContain("docker image prune");
    expect(out.find((f) => f.id === "open-ports")?.detail).toEqual({ ports: "5432" });
    expect(out.find((f) => f.id === "docker-ports")?.detail).toEqual({ containers: "db" });
  });

  test("a scan that never reached the server is not a clean server", () => {
    expect(scanned("ssh: connect to host 203.0.113.9 port 22: Connection timed out")).toBe(false);
    expect(scanned(VPS)).toBe(true);
  });

  test("what could not be read (no root, no ufw) is said, not counted as fine", () => {
    expect(unread("UFW:\nSSHD:\nF2B:active\nUU:")).toEqual(["SSHD", "UFW", "UU"]);
    expect(findings("UFW:\nSSHD:\nF2B:\nUU:")).toEqual([]);
  });
});
