import type { CommandRisk } from "@igrek/core";

/**
 * Sorts a shell command by how much it can change a server (plan.md 2.5):
 * "read" runs freely, "change" needs one approval, "danger" needs two.
 * Anything not recognised as read-only counts as "change" — the safe default.
 */

const DANGER: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+/, // rm -rf / rm -r / rm -f
  /\bmkfs(\.\w+)?\b/,
  /\bdd\s+.*\bof=/,
  /\b(shutdown|reboot|poweroff|halt)\b/,
  /\binit\s+[06]\b/,
  /:\(\)\s*\{/, // fork bomb
  /\b(drop|truncate)\s+(database|table|schema)\b/i,
  /\bdelete\s+from\s+\w+\s*;?\s*$/i, // DELETE without WHERE
  /\b(iptables|ip6tables|nft|ufw|firewall-cmd)\b(?!.*\s(-L|-S|--list|status|list-all|list-ruleset)\b)/,
  /\bchmod\s+(-R\s+)?[0-7]*777\b/,
  /\bchown\s+-R\s+\S+\s+\/(\s|$)/,
  />\s*\/dev\/(sd|nvme|vd|xvd)/,
  /\bdocker\s+(system|volume|image|container)\s+prune\b/,
  /\bdocker\s+volume\s+rm\b/,
  /\bgit\s+push\s+.*(--force|-f\b)/,
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/,
  /\b(userdel|deluser|passwd|chpasswd)\b/,
  /\bcrontab\s+-r\b/,
  /\bkill\s+-9\s+1\b/,
  /\bsystemctl\s+(stop|disable|mask)\s+(ssh|sshd|docker|network|networking)\b/,
];

/** Programs that only look, never touch. Arguments are checked separately below. */
const READ_PROGRAMS = new Set(
  (
    "ls ll la cat less more head tail grep egrep fgrep rg find locate which whereis file stat wc du df free uptime w who " +
    "whoami id hostname uname date cal ps pgrep top htop vmstat iostat mpstat sar lsof ss netstat ip ifconfig ping traceroute " +
    "dig nslookup host env printenv echo printf pwd tree diff cmp md5sum sha256sum sha1sum journalctl dmesg lsblk lscpu lsmem " +
    "free nproc getent last lastlog history jq yq awk cut sort uniq tr column nl basename dirname realpath readlink test true " +
    "sleep watch openssl"
  ).split(" "),
);

/** Sub-commands that are read-only for tools that can also change things. */
const READ_SUBCOMMANDS: Record<string, RegExp> = {
  systemctl: /^(status|is-active|is-enabled|is-failed|list-units|list-unit-files|list-timers|show|cat)\b/,
  service: /^\S+\s+status\b/,
  docker:
    /^(ps|logs|inspect|images|stats|top|version|info|port|diff|events|history|system\s+df|network\s+(ls|inspect)|volume\s+(ls|inspect)|compose\s+(ps|logs|config|ls|top|images))\b/,
  "docker-compose": /^(ps|logs|config|top|images)\b/,
  git: /^(status|log|diff|show|branch|remote(\s+-v)?|rev-parse|describe|tag(\s+-l)?|blame|ls-files|fetch)\b/,
  npm: /^(ls|list|view|outdated|audit(?!\s+fix)|config\s+get|-v|--version)\b/,
  pm2: /^(ls|list|status|logs|show|describe|monit|jlist)\b/,
  nginx: /^(-t|-T|-v|-V)\b/,
  kubectl: /^(get|describe|logs|top|version|config\s+view|explain)\b/,
  apt: /^(list|show|search|policy)\b/,
  "apt-cache": /./,
  dpkg: /^(-l|-L|-s|--list|--status)\b/,
  crontab: /^-l\b/,
  ufw: /^status\b/,
  certbot: /^certificates\b/,
  psql: /^(?!.*\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b).*-c\s/i,
  curl: /^(?!.*(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s|-F\s|--upload-file|-T\s))/i,
  wget: /^(-q\s+)?(-O\s*-|--spider|-S)\b/,
  sudo: /$^/, // handled by recursion
};

const RANK: Record<CommandRisk, number> = { read: 0, change: 1, danger: 2 };

function worst(a: CommandRisk, b: CommandRisk): CommandRisk {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Splits on ; && || | and newlines, outside quotes. */
function segments(command: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] as string;
    if (quote) {
      if (ch === quote) quote = undefined;
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ";" || ch === "\n" || ch === "|" || (ch === "&" && command[i + 1] === "&")) {
      if (ch === "&" || (ch === "|" && command[i + 1] === "|")) i++;
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  out.push(current.trim());
  return out.filter(Boolean);
}

function classifySegment(segment: string): CommandRisk {
  let text = segment.replace(/^(\w+=\S+\s+)+/, ""); // VAR=x cmd
  if (/^sudo\s/.test(text)) text = text.replace(/^sudo\s+(-\S+\s+)*/, "");
  // Writing to files (but not to /dev/null or stderr juggling) changes the system.
  if (/(^|[^0-9&<>])>>?\s*(?!\/dev\/null|&)\S/.test(text)) return "change";
  if (/\btee\b/.test(text) && !/\btee\s+\/dev\/null/.test(text)) return "change";
  if (/\bsed\s+(-[a-zA-Z]*i|--in-place)/.test(text)) return "change";
  const [program = "", ...rest] = text.split(/\s+/);
  const args = rest.join(" ");
  const name = program.split("/").pop() ?? program;
  if (name === "find" && /\s-(delete|exec|execdir|ok)\b/.test(text)) return "change";
  if (READ_PROGRAMS.has(name)) return "read";
  const sub = READ_SUBCOMMANDS[name];
  if (sub?.test(args)) return "read";
  return "change";
}

export function classifyCommand(command: string): { risk: CommandRisk; reasons: string[] } {
  const trimmed = command.trim();
  if (!trimmed) return { risk: "read", reasons: [] };
  const reasons: string[] = [];
  let risk: CommandRisk = "read";
  for (const pattern of DANGER) {
    if (pattern.test(trimmed)) {
      risk = "danger";
      reasons.push(pattern.source);
    }
  }
  // Command substitution can hide anything.
  if (/\$\(|`/.test(trimmed)) risk = worst(risk, "change");
  for (const segment of segments(trimmed)) risk = worst(risk, classifySegment(segment));
  return { risk, reasons };
}
