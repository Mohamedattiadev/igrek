/**
 * A server's security and health in plain findings (plan.md, 26 Oct 2026): one read-only command
 * reads what a careful admin would look at first, and each finding that has a safe, known fix comes
 * with the exact command. Nothing runs from here: fixes go through Servers.run, so they are
 * classified, confirmed and in the audit log like any command the user types.
 */

/** Read-only; every line is "KEY:value" so a missing tool only leaves its value empty. */
export const SCAN_COMMAND = [
  `echo "UFW:$(ufw status 2>/dev/null | head -1)"`,
  `echo "SSHD:$(sshd -T 2>/dev/null | grep -E '^(permitrootlogin|passwordauthentication) ' | tr '\\n' ';')"`,
  `echo "F2B:$(systemctl is-active fail2ban 2>/dev/null)"`,
  `echo "UU:$(systemctl is-active unattended-upgrades 2>/dev/null)"`,
  `echo "UPD:$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep -c '^Inst')"`,
  `echo "SECUPD:$(apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep '^Inst' | grep -ci security)"`,
  `echo "REBOOT:$([ -f /var/run/reboot-required ] && echo yes || echo no)"`,
  `echo "DISK:$(df -P / | awk 'NR==2{print $5}' | tr -d %)"`,
  `echo "SWAP:$(free -m | awk '/^Swap/{print $2}')"`,
  `echo "PORTS:$(ss -tlnH 2>/dev/null | awk '{print $4}' | tr '\\n' ' ')"`,
  `echo "DOCKERPORTS:$(docker ps --format '{{.Names}}={{.Ports}}' 2>/dev/null | tr '\\n' ';')"`,
  `echo "NTP:$(timedatectl show -p NTPSynchronized --value 2>/dev/null)"`,
  `echo "FAILED:$(journalctl -u ssh -u sshd --since '24 hours ago' 2>/dev/null | grep -c 'Failed password')"`,
  `echo "RECLAIM:$(docker system df --format '{{.Type}}={{.Reclaimable}}' 2>/dev/null | tr '\\n' ';')"`,
].join("; ");

type Severity = "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  /** Numbers or names the page puts into the finding's sentence. */
  detail?: Record<string, string | number>;
  /** The exact command that fixes it, shown before it runs. */
  fix?: string;
}

const SSHD_DROPIN = "/etc/ssh/sshd_config.d/90-igrek.conf";
const reloadSsh = "sshd -t && (systemctl reload ssh 2>/dev/null || systemctl reload sshd)";

/** "KEY:value" lines into a map; a key that never printed is absent, an empty one is "". */
function parseScan(output: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of output.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0 && /^[A-Z0-9]+$/.test(line.slice(0, at))) out.set(line.slice(0, at), line.slice(at + 1).trim());
  }
  return out;
}

/** Listening addresses reachable from outside: not loopback, not a resolver stub. */
function publicPorts(ports: string): number[] {
  const out = new Set<number>();
  for (const addr of ports.split(/\s+/).filter(Boolean)) {
    const port = Number(addr.slice(addr.lastIndexOf(":") + 1));
    const host = addr.slice(0, addr.lastIndexOf(":"));
    if (!port || /^(127\.|\[::1\]|::1|localhost)/.test(host) || host.startsWith("127.")) continue;
    out.add(port);
  }
  return [...out].sort((a, b) => a - b);
}

function access(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const sshd = scan.get("SSHD") ?? "";
  if (/permitrootlogin yes/.test(sshd))
    out.push({
      id: "root-password",
      severity: "high",
      // Root may still sign in with a key (as Igrek does); only its password stops working.
      fix: `mkdir -p /etc/ssh/sshd_config.d && grep -q '^PermitRootLogin' ${SSHD_DROPIN} 2>/dev/null || echo 'PermitRootLogin prohibit-password' >> ${SSHD_DROPIN}; ${reloadSsh}`,
    });
  if (/passwordauthentication yes/.test(sshd))
    out.push({
      id: "password-login",
      severity: "high",
      fix: `mkdir -p /etc/ssh/sshd_config.d && grep -q '^PasswordAuthentication' ${SSHD_DROPIN} 2>/dev/null || echo 'PasswordAuthentication no' >> ${SSHD_DROPIN}; ${reloadSsh}`,
    });
  // Empty means it could not be read (no systemd): unknown, not off.
  if (scan.get("F2B") && scan.get("F2B") !== "active")
    out.push({
      id: "no-fail2ban",
      severity: "medium",
      detail: { failed: Number(scan.get("FAILED") || 0) },
      fix: "apt-get install -y fail2ban && systemctl enable --now fail2ban",
    });
  const ufw = scan.get("UFW") ?? "";
  if (/inactive/i.test(ufw))
    out.push({
      id: "no-firewall",
      severity: "medium",
      // SSH, HTTP and HTTPS stay open, so nothing that works today is cut off.
      fix: "ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable",
    });
  return out;
}

function updates(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  if (scan.get("UU") && scan.get("UU") !== "active")
    out.push({
      id: "no-auto-updates",
      severity: "medium",
      fix: "apt-get install -y unattended-upgrades && systemctl enable --now unattended-upgrades",
    });
  const security = Number(scan.get("SECUPD") || 0);
  const all = Number(scan.get("UPD") || 0);
  if (security > 0)
    out.push({
      id: "security-updates",
      severity: "high",
      detail: { count: security, all },
      fix: "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
    });
  else if (all > 0) out.push({ id: "updates", severity: "low", detail: { count: all } });
  if (scan.get("REBOOT") === "yes") out.push({ id: "reboot", severity: "medium" });
  return out;
}

function resources(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const disk = Number(scan.get("DISK") || 0);
  const reclaim = scan.get("RECLAIM") ?? "";
  if (disk >= 85)
    out.push({
      id: "disk-full",
      severity: disk >= 95 ? "high" : "medium",
      detail: { percent: disk },
      ...(/Images=/.test(reclaim) ? { fix: "docker image prune -f && docker builder prune -f" } : {}),
    });
  if (scan.get("SWAP") === "0")
    out.push({
      id: "no-swap",
      severity: "low",
      fix: "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab",
    });
  if (scan.get("NTP") === "no") out.push({ id: "clock", severity: "low", fix: "timedatectl set-ntp true" });
  return out;
}

function exposure(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const open = publicPorts(scan.get("PORTS") ?? "").filter((p) => ![22, 80, 443].includes(p));
  if (open.length) out.push({ id: "open-ports", severity: "info", detail: { ports: open.join(", ") } });
  // Docker writes its own firewall rules: a published port is open to the world even behind ufw.
  const published = (scan.get("DOCKERPORTS") ?? "")
    .split(";")
    .filter((c) => /0\.0\.0\.0:(\d+)/.test(c))
    .filter((c) => [...c.matchAll(/0\.0\.0\.0:(\d+)/g)].some((m) => !["80", "443"].includes(m[1] ?? "")))
    .map((c) => c.split("=")[0]);
  if (published.length)
    out.push({ id: "docker-ports", severity: "medium", detail: { containers: published.join(", ") } });
  return out;
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** Findings from a scan, most serious first; an empty list means nothing to fix was seen. */
export function findings(output: string): Finding[] {
  const scan = parseScan(output);
  return [...access(scan), ...updates(scan), ...resources(scan), ...exposure(scan)].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );
}

/** The scan ran on the server at all: its lines are there (a failed connection prints none). */
export function scanned(output: string): boolean {
  return parseScan(output).has("DISK");
}

/** Things the scan could not read (not root, no such tool): said, not guessed. */
export function unread(output: string): string[] {
  const scan = parseScan(output);
  return ["SSHD", "UFW", "F2B", "UU"].filter((k) => !scan.get(k));
}
