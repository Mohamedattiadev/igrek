/**
 * The suite's operations tools (plan.md 12): uptime, domains and certificates, Docker, logs and
 * error tracking. Everything is read from your own machines and public, free sources.
 */

/** A site God Eye opens every few minutes (plan.md 12 "Uptime izleme"). */
export interface UptimeMonitor {
  id: string;
  name: string;
  url: string;
  projectId?: string;
  /** Seconds between checks (60 to 3600). */
  interval: number;
  /** Last result. */
  up?: boolean;
  status?: number;
  ms?: number;
  error?: string;
  checkedAt?: number;
  /** When the current state began (down since, up since). */
  since?: number;
  /** Share of successful checks over the last 24 hours, 0–100. */
  uptime24h?: number;
  /** Median response time over the last 24 hours. */
  p50?: number;
  createdAt: number;
}

export interface UptimeCheck {
  at: number;
  up: boolean;
  status?: number;
  ms?: number;
  error?: string;
}

export interface DnsRecords {
  A: string[];
  AAAA: string[];
  CNAME: string[];
  MX: { exchange: string; priority: number }[];
  NS: string[];
  TXT: string[];
}

/** A domain and its certificate (plan.md 12 "Domain ve SSL takibi"). */
export interface DomainWatch {
  id: string;
  /** The host as entered: example.com, api.example.com. */
  host: string;
  projectId?: string;
  /** The registrable domain the registry is asked about (example.com for api.example.com). */
  registrable?: string;
  /** From RDAP (the free, official successor of WHOIS); unknown for some country domains. */
  domainExpires?: number;
  registrar?: string;
  certExpires?: number;
  certIssuer?: string;
  /** Names the certificate covers. */
  certNames?: string[];
  /** True when the certificate doesn't cover the host. */
  certMismatch?: boolean;
  dns?: DnsRecords;
  error?: string;
  checkedAt?: number;
  createdAt: number;
}

/** Days left before `at`, rounded down (negative once passed). */
export function daysLeft(at: number, now = Date.now()): number {
  return Math.floor((at - now) / 86_400_000);
}

/** Warning steps for expiry: 30, 14, 7, 1 days. Returns the step reached, or undefined. */
export function expiryStep(at: number | undefined, now = Date.now()): number | undefined {
  if (at === undefined) return undefined;
  const left = daysLeft(at, now);
  return [1, 7, 14, 30].find((step) => left <= step);
}

/** Second-level suffixes that are sold like top-level ones (api.shop.com.tr → shop.com.tr). */
const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "com.tr",
  "net.tr",
  "org.tr",
  "edu.tr",
  "gov.tr",
  "web.tr",
  "gen.tr",
  "biz.tr",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.br",
  "net.br",
  "com.cn",
  "com.mx",
  "co.in",
  "co.za",
  "com.sg",
  "com.eg",
  "com.sa",
  "co.il",
  "co.kr",
]);

/** The domain you register and renew, for a host name. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** Whether a certificate name (possibly *.example.com) covers a host. */
export function certCovers(name: string, host: string): boolean {
  const n = name.toLowerCase();
  const h = host.toLowerCase();
  if (n === h) return true;
  if (!n.startsWith("*.")) return false;
  const rest = n.slice(2);
  // A wildcard covers exactly one label: *.example.com covers a.example.com, not a.b.example.com.
  return h.endsWith(`.${rest}`) && !h.slice(0, -rest.length - 1).includes(".");
}

/** Where a Docker manager looks: this computer or a server added on the Servers page. */
export type DockerHost = { kind: "local" } | { kind: "server"; serverId: string };

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  /** running, exited, restarting, paused, created, dead */
  state: string;
  /** "Up 3 hours", "Exited (1) 2 minutes ago" */
  status: string;
  ports: string;
  /** From docker compose labels, when there are any. */
  project?: string;
  service?: string;
  createdAt?: string;
  cpu?: string;
  mem?: string;
  memPercent?: string;
}

/** One place a log comes from (plan.md 12 "Log merkezi"). */
export type LogSource =
  | { kind: "file"; path: string; label?: string }
  | { kind: "docker"; container: string; serverId?: string; label?: string }
  | { kind: "journal"; unit: string; serverId?: string; label?: string }
  | { kind: "terminal"; terminalId: string; label?: string };

export interface LogLine {
  source: string;
  text: string;
  /** Parsed from the line when it carries a time; otherwise when it was read. */
  at?: number;
  level: "error" | "warn" | "info";
}

/** Lines that are the same error once numbers, ids and paths are set aside. */
export interface LogGroup {
  fingerprint: string;
  /** The first line of the group as it appeared. */
  sample: string;
  count: number;
  level: LogLine["level"];
  sources: string[];
  firstAt?: number;
  lastAt?: number;
}

const LEVEL_ERROR =
  /\b(error|err|fatal|panic|exception|traceback|uncaught|unhandled|critical|failed|segfault|E\d{4})\b/i;
const LEVEL_WARN = /\b(warn|warning|deprecated|retry(ing)?|timeout|timed out)\b/i;

/** TypeError, ValueError, NullPointerException… */
const NAMED_ERROR = /\b[A-Z][a-zA-Z]*(Error|Exception)\b/;

export function lineLevel(text: string): LogLine["level"] {
  if (LEVEL_ERROR.test(text) || NAMED_ERROR.test(text)) return "error";
  if (LEVEL_WARN.test(text)) return "warn";
  return "info";
}

/**
 * The shape of a line without what changes between occurrences: times, numbers, ids, hashes,
 * quoted values, paths' line numbers. Two lines with the same shape are one problem.
 */
export function fingerprint(text: string): string {
  return text
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .replace(/\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}([.,]\d+)?(Z|\s?UTC|[+-]\d{2}:?\d{2})?\]?\s*/g, "")
    .replace(/^\[?\d{2}:\d{2}:\d{2}(\.\d+)?\]?\s*/, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hash>")
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "<str>")
    .replace(/:\d+(:\d+)?\b/g, ":<n>")
    .replace(/\b\d+(\.\d+)?(ms|s|kb|mb|gb|%)?\b/gi, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

/** Groups lines by fingerprint, errors first, then by how often they happened. */
export function groupLines(lines: LogLine[]): LogGroup[] {
  const groups = new Map<string, LogGroup>();
  for (const line of lines) {
    if (line.level === "info") continue;
    const fp = fingerprint(line.text);
    if (!fp) continue;
    const g = groups.get(fp);
    if (g) {
      g.count++;
      if (!g.sources.includes(line.source)) g.sources.push(line.source);
      if (line.at && (!g.firstAt || line.at < g.firstAt)) g.firstAt = line.at;
      if (line.at && (!g.lastAt || line.at > g.lastAt)) g.lastAt = line.at;
    } else
      groups.set(fp, {
        fingerprint: fp,
        sample: line.text.slice(0, 500),
        count: 1,
        level: line.level,
        sources: [line.source],
        firstAt: line.at,
        lastAt: line.at,
      });
  }
  return [...groups.values()].sort((a, b) => (a.level === b.level ? b.count - a.count : a.level === "error" ? -1 : 1));
}

/** An error your app sent to God Eye (plan.md 12 "Hata takibi"), grouped like Sentry does. */
export interface AppErrorGroup {
  id: string;
  projectId: string;
  fingerprint: string;
  message: string;
  /** The top frames of the first stack seen. */
  stack?: string;
  count: number;
  firstAt: number;
  lastAt: number;
  /** The release (commit) it was first seen in, and the one before it that had no such error. */
  firstRelease?: string;
  lastRelease?: string;
  /** Commits between the last release without it and the first with it: where to look. */
  suspects?: { hash: string; subject: string; author: string }[];
  urls: string[];
  browsers: string[];
  status: "open" | "resolved" | "ignored";
}

export interface AppErrorEvent {
  message: string;
  stack?: string;
  url?: string;
  release?: string;
  userAgent?: string;
  at?: number;
}

/** First stack frames without line/column numbers: the same bug on another line is still the same bug. */
export function errorFingerprint(event: Pick<AppErrorEvent, "message" | "stack">): string {
  const frames = (event.stack ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^at\s|@|File "/.test(l))
    .slice(0, 3)
    .map((l) => l.replace(/[?#][^\s):]*/g, "").replace(/:\d+(:\d+)?/g, ""));
  return fingerprint(`${event.message.split("\n")[0]}|${frames.join("|")}`);
}
