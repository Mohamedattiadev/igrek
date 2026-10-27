/**
 * A server's open doors (plan.md 18.8): every listening port with the program behind it, whether
 * the world can reach it (the firewall, and Docker, which goes around it), and the firewall rule
 * that opens or closes it. Reading is one read-only command; a change is a single ufw command that
 * goes through Servers.run, confirmed and logged like any other.
 */

export const PORTS_COMMAND = [
  `echo "LISTEN:$(ss -tulnpH 2>/dev/null | awk '{p=$NF; if (p !~ /^users:/) p=""; print $1"~"$5"~"p}' | tr '\\n' ';')"`,
  `echo "UFW:$(ufw status 2>/dev/null | head -1)"`,
  `echo "RULES:$(ufw status 2>/dev/null | awk 'NR>4 && NF' | tr -s ' ' | tr '\\n' ';')"`,
  `echo "DOCKER:$(docker ps --format '{{.Names}}={{.Ports}}' 2>/dev/null | tr '\\n' ';')"`,
].join("; ");

export interface OpenPort {
  proto: "tcp" | "udp";
  port: number;
  address: string;
  /** "sshd", "caddy", "postgres": the program listening. */
  program: string;
  /** Not loopback: something outside this server could reach it, unless the firewall says no. */
  public: boolean;
  /** What the firewall does with it: open, closed, or no firewall at all. */
  firewall: "open" | "closed" | "off";
  /** A container that publishes it: Docker opens it whatever ufw says. */
  container?: string;
}

function scanOf(output: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of output.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0 && /^[A-Z]+$/.test(line.slice(0, at))) out.set(line.slice(0, at), line.slice(at + 1).trim());
  }
  return out;
}

/** ufw's "22/tcp ALLOW Anywhere", "OpenSSH ALLOW Anywhere": which ports it lets in. */
function allowed(rules: string): (port: number, proto: string) => boolean {
  const named: Record<string, number[]> = {
    OpenSSH: [22],
    "Nginx Full": [80, 443],
    "Nginx HTTP": [80],
    "Nginx HTTPS": [443],
    "Apache Full": [80, 443],
    Apache: [80],
    "Apache Secure": [443],
  };
  const open: { from: number; to: number; proto?: string }[] = [];
  for (const rule of rules.split(";").filter(Boolean)) {
    if (!/\bALLOW\b/.test(rule)) continue;
    const to = rule
      .slice(0, rule.search(/\s(ALLOW|DENY|REJECT|LIMIT)\b/))
      .replace(" (v6)", "")
      .trim();
    for (const [name, ports] of Object.entries(named))
      if (to === name) for (const p of ports) open.push({ from: p, to: p });
    const m = to.match(/^(\d+)(?::(\d+))?(?:\/(tcp|udp))?$/);
    if (m) open.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), proto: m[3] });
  }
  return (port, proto) => open.some((o) => port >= o.from && port <= o.to && (!o.proto || o.proto === proto));
}

/** Ports Docker publishes to everyone, by port: Docker opens them around ufw. */
function dockerPublished(value: string): Map<number, string> {
  const published = new Map<number, string>();
  for (const c of value.split(";").filter(Boolean)) {
    const [name = "", ports = ""] = c.split("=");
    for (const m of ports.matchAll(/(?:0\.0\.0\.0|\[::\]|:::):(\d+)->/g)) published.set(Number(m[1]), name);
  }
  return published;
}

/** One "tcp~0.0.0.0:22~users:((...))" line as protocol, port, address and program. */
function listener(line: string) {
  const [netid = "", local = "", proc = ""] = line.split("~");
  const at = local.lastIndexOf(":");
  const address = local.slice(0, at);
  return {
    proto: netid.startsWith("udp") ? ("udp" as const) : ("tcp" as const),
    port: Number(local.slice(at + 1)),
    address,
    program: proc.match(/\(\("([^"]+)"/)?.[1] ?? "",
    // Loopback, link-local and multicast cannot be reached from the internet.
    public: !/^(127\.|\[::1\]|::1|localhost|\[fe80|224\.|239\.|\[ff)/.test(address) && !address.includes("%lo"),
  };
}

export function openPorts(output: string): { ports: OpenPort[]; firewall: "active" | "inactive" | "unknown" } {
  const scan = scanOf(output);
  const ufw = scan.get("UFW") ?? "";
  const firewall = /inactive/i.test(ufw) ? "inactive" : /active/i.test(ufw) ? "active" : "unknown";
  const lets = allowed(scan.get("RULES") ?? "");
  const published = dockerPublished(scan.get("DOCKER") ?? "");
  const seen = new Set<string>();
  const ports: OpenPort[] = [];
  for (const line of (scan.get("LISTEN") ?? "").split(";").filter(Boolean)) {
    const l = listener(line);
    // One line per port and side (IPv4 and IPv6 of the same socket are one door).
    const key = `${l.proto}/${l.port}/${l.public}`;
    if (!l.port || seen.has(key)) continue;
    seen.add(key);
    const container = published.get(l.port);
    const open = Boolean(container) || lets(l.port, l.proto);
    ports.push({
      ...l,
      firewall: firewall !== "active" ? "off" : open ? "open" : "closed",
      ...(container ? { container } : {}),
    });
  }
  return { ports: ports.sort((a, b) => Number(b.public) - Number(a.public) || a.port - b.port), firewall };
}

/**
 * The one ufw command for a change, or why not. The SSH port is never closed from here: that would
 * lock Igrek and everyone else out of the server.
 */
export function firewallCommand(
  action: unknown,
  port: unknown,
  proto: unknown,
  sshPort = 22,
): { command: string } | { error: string } {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: "Not a port" };
  const p = proto === "udp" ? "udp" : "tcp";
  if ((action === "close" || action === "forget") && n === sshPort)
    return { error: "The SSH port stays open: closing it would lock you out of the server" };
  if (action === "open") return { command: `ufw allow ${n}/${p}` };
  if (action === "close") return { command: `ufw deny ${n}/${p}` };
  if (action === "forget") return { command: `ufw delete allow ${n}/${p}` };
  return { error: "Unknown change" };
}
