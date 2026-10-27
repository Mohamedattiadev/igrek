/**
 * A server's security and health in plain findings (plan.md, 26 Oct 2026): one read-only command
 * reads what a careful admin would look at first, and each finding that has a safe, known fix comes
 * with the exact command. Nothing runs from here: fixes go through Servers.run, so they are
 * classified, confirmed and in the audit log like any command the user types.
 */

/**
 * Process names of common Linux miners and the malware that drops them. Each is written "[x]mrig":
 * it still matches "xmrig", but not the scan's own command line, which holds the pattern itself.
 */
const MINER_NAMES = [
  "xmrig",
  "xmr-stak",
  "kdevtmpfsi",
  "kinsing",
  "minerd",
  "cpuminer",
  "nbminer",
  "t-rex",
  "lolminer",
  "ethminer",
  "phoenixminer",
  "srbminer",
  "stratum\\+tcp",
  "stratum\\+ssl",
]
  .map((name) => `[${name[0]}]${name.slice(1)}`)
  .join("|");
/** Ports mining pools commonly listen on. */
const POOL_PORTS = "3333|4444|5555|7777|14444|14433|45560|45700";

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
  // Threats (plan.md 18.8): what a hijacked server looks like, all read-only.
  // Known miners by name, and anything talking stratum (the mining protocol) in its arguments.
  `echo "MINER:$(ps -eo pid=,user=,pcpu=,comm=,args= 2>/dev/null | grep -Ei '${MINER_NAMES}' | grep -v grep | awk '{print $1"/"$2"/"$3"/"$4}' | head -10 | tr '\\n' ';')"`,
  // Whatever eats the CPU (a miner renamed to look harmless still has to do this).
  `echo "HOTCPU:$(ps -eo pid=,user=,pcpu=,comm= --sort=-pcpu 2>/dev/null | awk '$3>85{print $1"/"$2"/"$3"/"$4}' | head -5 | tr '\\n' ';')"`,
  // Connections out to the ports mining pools listen on.
  `echo "POOL:$(ss -tnpH state established 2>/dev/null | awk '{print $4"|"$NF}' | grep -E ':(${POOL_PORTS})\\|' | head -5 | tr '\\n' ';')"`,
  // Programs running from /tmp, /var/tmp or /dev/shm: where dropped malware lives.
  `echo "TMPEXE:$(for p in /proc/[0-9]*; do e=$(readlink $p/exe 2>/dev/null); case "$e" in /tmp/*|/var/tmp/*|/dev/shm/*) printf '%s=%s;' "\${p#/proc/}" "$e";; esac; done)"`,
  // Scheduled jobs that download or decode something and run it: how miners come back after a kill.
  `echo "CRON:$( (crontab -l 2>/dev/null; cat /etc/crontab /etc/cron.d/* /var/spool/cron/crontabs/* 2>/dev/null) | grep -v '^\\s*#' | grep -Ei 'curl|wget|base64|/tmp/|/dev/shm|\\|\\s*(ba)?sh' | head -5 | tr '\\n' ';')"`,
  // A second all-powerful user, and a library forced into every program (a rootkit's trick).
  `echo "UID0:$(awk -F: '$3==0 && $1!="root"{print $1}' /etc/passwd 2>/dev/null | tr '\\n' ' ')"`,
  `echo "PRELOAD:$(cat /etc/ld.so.preload 2>/dev/null | tr '\\n' ' ')"`,
  // A shell handed to someone over the network: a shell reading from a network socket (a terminal
  // or SSH gives it a tty instead), or "nc -e", "socat exec", "/dev/tcp/" in a running program.
  // Shells started over SSH (Igrek's own, a deploy script's) read from a socket too: skipped.
  `ssh_child() { q=$1; while [ "$q" -gt 1 ] 2>/dev/null; do case "$(cat /proc/$q/comm 2>/dev/null)" in sshd*) return 0;; esac; q=$(awk '{print $4}' /proc/$q/stat 2>/dev/null); done; return 1; }`,
  `echo "BACKDOOR:$( (for p in $(pgrep -x 'bash|sh|dash|zsh' 2>/dev/null); do ssh_child $p && continue; readlink /proc/$p/fd/0 2>/dev/null | grep -q '^socket:' && echo "$p~$(stat -c %U /proc/$p 2>/dev/null)~$(tr '\\0' ' ' < /proc/$p/cmdline | cut -c1-60)"; done; ps -eo pid=,user=,args= 2>/dev/null | grep -E '[n]c(at)? .*-e |[s]ocat .*exec|/[d]ev/tcp/' | grep -v grep | awk '{a=$3; for(i=4;i<=NF;i++) a=a" "$i; print $1"~"$2"~"substr(a,1,60)}') | sort -u | head -5 | tr '\\n' ';')"`,
  // System programs that no longer match their package (a rootkit replaces ps, ls, ssh...).
  `echo "BINCHG:$(timeout 30 dpkg --verify coreutils procps openssh-server openssh-client util-linux sudo passwd login iproute2 net-tools findutils 2>/dev/null | awk '$1 ~ /5/ && $NF ~ /^\\/(usr\\/)?s?bin\\// {print $NF}' | head -10 | tr '\\n' ' ')"`,
  // Containers that may do anything on the host.
  `echo "PRIVDOCKER:$(docker ps -q 2>/dev/null | xargs -r docker inspect --format '{{.Name}}={{.HostConfig.Privileged}}' 2>/dev/null | grep '=true' | tr -d / | cut -d= -f1 | tr '\\n' ' ')"`,
  // Web shells: PHP files that run what a request sends them.
  `echo "WEBSHELL:$(timeout 20 grep -rlE 'eval\\(base64_decode|eval\\(gzinflate|assert\\(\\$_(POST|GET|REQUEST)|(system|shell_exec|passthru|exec)\\(\\$_(POST|GET|REQUEST)' /var/www /srv /home --include=*.php 2>/dev/null | head -5 | tr '\\n' ' ')"`,
  // Who may sign in as root with a key: a key added by an intruder is how they keep a door open.
  `echo "ROOTKEYS:$(awk 'NF{print $NF}' /root/.ssh/authorized_keys 2>/dev/null | tr '\\n' ';')"`,
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

/** "pid/user/cpu/name;..." from the scan into its parts. */
function procs(value: string): { pid: string; user: string; cpu: string; name: string }[] {
  return value
    .split(";")
    .filter(Boolean)
    .map((p) => {
      const [pid = "", user = "", cpu = "", name = ""] = p.split("/");
      return { pid, user, cpu, name };
    })
    .filter((p) => /^\d+$/.test(p.pid));
}

/**
 * Signs that someone else uses the server: a miner, a connection to a mining pool, a program run
 * from a temporary folder, a cron job that fetches and runs code, a second root, a forced library.
 * Stopping a process is offered; cleaning up what started it is said, since that needs a look.
 */
function threats(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const miners = procs(scan.get("MINER") ?? "");
  if (miners.length)
    out.push({
      id: "miner",
      severity: "high",
      detail: { processes: miners.map((m) => `${m.name} (${m.pid}, ${m.user}, ${m.cpu}%)`).join(", ") },
      fix: `kill -9 ${miners.map((m) => m.pid).join(" ")}`,
    });
  const pool = (scan.get("POOL") ?? "").split(";").filter(Boolean);
  if (pool.length)
    out.push({
      id: "pool-connection",
      severity: "high",
      detail: { connections: pool.map((c) => c.replace("|", " ")).join(", ") },
    });
  const tmp = (scan.get("TMPEXE") ?? "").split(";").filter(Boolean);
  if (tmp.length) {
    const pids = tmp.map((x) => x.split("=")[0]).filter((pid) => /^\d+$/.test(pid ?? ""));
    out.push({
      id: "tmp-program",
      severity: "high",
      detail: { programs: tmp.map((x) => x.replace("=", ": ")).join(", ") },
      ...(pids.length ? { fix: `kill -9 ${pids.join(" ")}` } : {}),
    });
  }
  // "pid~user~command": the command may hold slashes, so it has its own separator.
  const backdoor = (scan.get("BACKDOOR") ?? "")
    .split(";")
    .map((line) => line.split("~"))
    .filter(([pid]) => /^\d+$/.test(pid ?? ""));
  if (backdoor.length)
    out.push({
      id: "backdoor",
      severity: "high",
      detail: { processes: backdoor.map(([pid, user, cmd]) => `${cmd?.trim()} (${pid}, ${user})`).join(", ") },
      fix: `kill -9 ${backdoor.map(([pid]) => pid).join(" ")}`,
    });
  // A busy server is not a hacked one: high CPU is only worth a look when nothing else explains it.
  const hot = procs(scan.get("HOTCPU") ?? "").filter((p) => !miners.some((m) => m.pid === p.pid));
  if (hot.length)
    out.push({
      id: "hot-cpu",
      severity: "low",
      detail: { processes: hot.map((h) => `${h.name} (${h.pid}, ${h.user}, ${h.cpu}%)`).join(", ") },
    });
  return out;
}

/** What was left behind to come back: a fetching cron job, changed programs, a web shell, a second root. */
function planted(scan: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  const cron = (scan.get("CRON") ?? "").split(";").filter((l) => l.trim());
  // Some honest jobs ping a URL too; worth a look, not an alarm.
  if (cron.length) out.push({ id: "cron-download", severity: "medium", detail: { lines: cron.join(" | ") } });
  // Each scan line that names something when it should be empty: [key, finding, severity, detail name].
  const present: [string, string, Severity, string][] = [
    ["BINCHG", "changed-binaries", "high", "files"],
    ["WEBSHELL", "webshell", "high", "files"],
    ["PRIVDOCKER", "privileged-container", "medium", "containers"],
    ["UID0", "second-root", "high", "users"],
    ["PRELOAD", "preload", "high", "libraries"],
  ];
  for (const [key, id, severity, name] of present) {
    const value = (scan.get(key) ?? "").trim();
    if (value) out.push({ id, severity, detail: { [name]: value } });
  }
  const keys = (scan.get("ROOTKEYS") ?? "").split(";").filter(Boolean);
  if (keys.length)
    out.push({ id: "root-keys", severity: "info", detail: { count: keys.length, keys: keys.join(", ") } });
  return out;
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** Findings from a scan, most serious first; an empty list means nothing to fix was seen. */
export function findings(output: string): Finding[] {
  const scan = parseScan(output);
  return [
    ...threats(scan),
    ...planted(scan),
    ...access(scan),
    ...updates(scan),
    ...resources(scan),
    ...exposure(scan),
  ].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
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
