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

/** Where a project's code is hosted (plan.md 12 "GitHub/GitLab entegrasyonu"). */
export interface CodeHostInfo {
  host: "github" | "gitlab" | "other" | "none";
  /** owner/repo */
  repo?: string;
  url?: string;
  /** The CLI God Eye uses with your own login (gh, glab). */
  cli?: "gh" | "glab";
  cliInstalled: boolean;
  signedIn: boolean;
  error?: string;
}

export interface HostIssue {
  number: number;
  title: string;
  author: string;
  labels: string[];
  url: string;
  updatedAt: string;
  comments: number;
  body?: string;
}

export interface HostPull {
  number: number;
  title: string;
  author: string;
  branch: string;
  state: string;
  draft: boolean;
  /** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED or empty. */
  review: string;
  checks: { passed: number; failed: number; pending: number };
  url: string;
  updatedAt: string;
}

export interface HostRun {
  id: number;
  title: string;
  workflow: string;
  branch: string;
  status: string;
  /** success, failure, cancelled… when finished. */
  conclusion: string;
  url: string;
  createdAt: string;
}

/** One thing on the calendar (plan.md 12 "Takvim görünümü"). */
export interface CalendarItem {
  id: string;
  kind: "schedule" | "backup" | "deploy" | "cert" | "domain" | "deadline" | "milestone" | "note" | "run";
  title: string;
  at: number;
  projectId?: string;
  /** Where clicking goes. */
  link?: string;
  /** Past deploys and runs: whether they worked. */
  ok?: boolean;
  /** Only events you added can be removed. */
  own?: boolean;
  /** Milestones and deadlines you marked as reached. */
  done?: boolean;
}

/** Sprints are two weeks long and start on Mondays, counted from 5 January 2026 (plan.md 13.2). */
export function sprintOf(at: number, weeks = 2): { index: number; start: number; end: number } {
  const anchor = new Date(2026, 0, 5).getTime();
  const length = weeks * 7 * 86_400_000;
  const index = Math.floor((at - anchor) / length);
  const start = new Date(anchor + index * length);
  // Whole local days, so daylight saving time doesn't shift the edges.
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);
  return { index, start: start.getTime(), end: end.getTime() - 1 };
}

/** A secret as the vault lists it (plan.md 12 "Sır kasası"): never the value itself. */
export interface VaultEntry {
  /** "env:<projectId>:<file>:<KEY>" or "item:<id>" */
  ref: string;
  kind: "env" | "item";
  name: string;
  projectId?: string;
  /** The .env file it is in, relative to the project. */
  file?: string;
  note?: string;
  /** Last time the value changed (file time for .env keys God Eye saw change, or when saved). */
  changedAt?: number;
  /** Rotation reminder in days; 0 = none. */
  rotateDays: number;
  /** Due for a change. */
  due: boolean;
  /** Other places with exactly the same value (compared by hash on this computer). */
  sameAs: number;
}

/** A recurring cost (plan.md 12 "Maliyet paneli"). */
export interface CostItem {
  id: string;
  name: string;
  category: "server" | "ai" | "api" | "saas" | "domain" | "other";
  amount: number;
  /** ISO code: USD, EUR, TRY… */
  currency: string;
  period: "month" | "year" | "once";
  /** First month it counts (ms). */
  startsAt: number;
  /** Cancelled: last month it counts. */
  endsAt?: number;
  projectId?: string;
  note?: string;
}

export interface CostSummary {
  currency: string;
  /** This month, in the chosen currency. */
  month: number;
  /** The next 12 months if nothing changes. */
  year: number;
  byCategory: { category: CostItem["category"]; amount: number }[];
  byProject: { projectId?: string; amount: number }[];
  /** Last 12 months, oldest first: "2026-10" and the total. */
  trend: { month: string; amount: number }[];
  /** Exchange rates date (ECB), or missing when an item's currency could not be converted. */
  ratesDate?: string;
  unconverted: string[];
}

/** The amount an item adds to one calendar month (yearly costs spread evenly). */
export function costInMonth(
  item: Pick<CostItem, "amount" | "period" | "startsAt" | "endsAt">,
  year: number,
  month: number,
): number {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime() - 1;
  if (item.startsAt > end || (item.endsAt !== undefined && item.endsAt < start)) return 0;
  if (item.period === "once") return item.startsAt >= start && item.startsAt <= end ? item.amount : 0;
  return item.period === "year" ? item.amount / 12 : item.amount;
}

/** Where sign-ups are counted from: a table in the project's database (plan.md 12 "Ürün analitiği"). */
export interface AnalyticsSource {
  connectionId: string;
  table: string;
  /** The column with the sign-up time. */
  createdColumn: string;
}

export interface AnalyticsSummary {
  /** From the database, when a source is set. */
  users?: {
    total: number;
    last7: number;
    previous7: number;
    weekly: { week: string; count: number }[];
    error?: string;
  };
  /** From events the app sends. */
  active?: { day: number; week: number; month: number; daily: { day: string; users: number }[] };
  events: { event: string; last7: number; previous7: number }[];
  source?: AnalyticsSource;
}

/** What a plugin may read through the bridge (plan.md 12 "Eklenti sistemi"). Nothing can be written. */
export const PLUGIN_PERMISSIONS = [
  "projects:read",
  "memory:read",
  "sessions:read",
  "costs:read",
  "uptime:read",
] as const;
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  permissions: PluginPermission[];
  /** Pages shown in God Eye, in a sandbox: on the Tools page or in each project. */
  panels: { id: string; title: string; entry: string; place: "tools" | "project" }[];
  /** Shell commands run in a project's folder, in a terminal you can see, only when you click. */
  commands: { id: string; title: string; run: string[] }[];
}

export interface PluginInfo extends PluginManifest {
  enabled: boolean;
  /** Where it was installed from (a folder or a git URL). */
  source: string;
  installedAt: number;
  error?: string;
}

/** An MCP server the user added to God Eye (plan.md 13.1): its tools are offered in chats. */
export interface McpServerEntry {
  id: string;
  name: string;
  /** stdio: a command God Eye starts; http: a URL it connects to. */
  kind: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  /** Names of environment variables it gets (values stay encrypted, never shown). */
  envKeys: string[];
  enabled: boolean;
  /** From the catalog, by id. */
  catalog?: string;
  /** What the last connection test found. */
  tools?: string[];
  testedAt?: number;
  error?: string;
}

export interface McpCatalogEntry {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  /** Variables the user must fill in (an API key…). */
  env?: string[];
  homepage: string;
}

/** Well-known MCP servers that are free to use. Versions are pinned. */
export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "memory",
    name: "Memory (knowledge graph)",
    description: "A small knowledge graph the AI can write to and read from across chats.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory@2026.8.31"],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "sequential-thinking",
    name: "Sequential thinking",
    description: "Lets the AI think through hard problems step by step, revising earlier steps.",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking@2026.8.31"],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Reads a web page and turns it into Markdown for the AI.",
    command: "uvx",
    args: ["mcp-server-fetch"],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "git",
    name: "Git",
    description: "Read and search a git repository's history, branches and diffs.",
    command: "uvx",
    args: ["mcp-server-git"],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
  },
  {
    id: "playwright",
    name: "Playwright (browser)",
    description: "A real browser the AI can open, click and read (the same one God Eye's test users use).",
    command: "npx",
    args: ["-y", "@playwright/mcp@0.0.83"],
    homepage: "https://github.com/microsoft/playwright-mcp",
  },
  {
    id: "context7",
    name: "Context7 (library docs)",
    description: "Up-to-date documentation and examples for libraries and frameworks, fetched when needed.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp@4.1.1"],
    homepage: "https://github.com/upstash/context7",
  },
];

/** Time spent per project and day, from the sessions' own timestamps (plan.md 13.2 "Zaman takibi"). */
export interface TimeReport {
  from: number;
  to: number;
  /** "2026-10-17" → projectId → minutes */
  days: { day: string; minutes: Record<string, number> }[];
  totals: { projectId: string; minutes: number; sessions: number }[];
}

/** A gap longer than this ends a work block: you stepped away. */
export const IDLE_GAP_MS = 15 * 60_000;

/** Work blocks from sorted timestamps: each block counts from its first to its last moment, at least 2 minutes. */
export function workBlocks(times: number[], gap = IDLE_GAP_MS): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const t of times) {
    const last = out[out.length - 1];
    if (last && t - last.end <= gap) last.end = Math.max(last.end, t);
    else out.push({ start: t, end: t });
  }
  return out.map((b) => ({ start: b.start, end: Math.max(b.end, b.start + 2 * 60_000) }));
}

/** The evening recap of one day (plan.md 13.2 "Gün sonu özeti"): what got done, in numbers and words. */
export interface DayRecap {
  /** "2026-10-17", local day. */
  day: string;
  text: string;
  stats: {
    projects: {
      projectId: string;
      name: string;
      commits: number;
      sessions: number;
      minutes: number;
      merged: number;
      failed: number;
    }[];
    commits: number;
    sessions: number;
    minutes: number;
  };
  at: number;
}

/** Where God Eye can send a short notice outside the app (plan.md 13.3 "bildirim köprüleri"). */
export type BridgeKind = "telegram" | "discord" | "email";
export const BRIDGE_EVENTS = ["down", "up", "appError", "backupFailed", "approval", "run"] as const;
export type BridgeEvent = (typeof BRIDGE_EVENTS)[number];

export interface Bridge {
  id: string;
  kind: BridgeKind;
  name: string;
  events: BridgeEvent[];
  enabled: boolean;
  /** Where it goes, without secrets: "chat 12345", "#alerts webhook", "me@example.com". */
  target: string;
  lastSentAt?: number;
  lastError?: string;
}
