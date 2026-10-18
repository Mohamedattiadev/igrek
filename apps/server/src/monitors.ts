import type { Database } from "bun:sqlite";
import { promises as dns } from "node:dns";
import { connect } from "node:tls";
import {
  certCovers,
  type DnsRecords,
  type DomainWatch,
  daysLeft,
  expiryStep,
  type InboxNotice,
  registrableDomain,
  type UptimeCheck,
  type UptimeMonitor,
} from "@godeye/core";
import type { Bus } from "./bus";
import type { Store } from "./store";

const DAY = 86_400_000;
/** Two failed checks in a row before a site counts as down: one lost packet is not an outage. */
const DOWN_AFTER = 2;

type MonitorState = Pick<UptimeMonitor, "up" | "status" | "ms" | "error" | "checkedAt" | "since"> & {
  fails?: number;
};

type DomainState = Omit<DomainWatch, "id" | "host" | "projectId" | "createdAt">;

interface MonitorRow {
  id: string;
  name: string;
  url: string;
  project_id: string | null;
  interval_sec: number;
  state: string | null;
  created_at: number;
}

interface DomainRow {
  id: string;
  host: string;
  project_id: string | null;
  state: string | null;
  created_at: number;
}

function validUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validHost(host: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host);
}

/** The certificate a host presents on port 443. */
export function readCertificate(
  host: string,
  timeout = 10_000,
): Promise<{ expires: number; issuer?: string; names: string[] }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) return reject(new Error("No certificate"));
      const names = (cert.subjectaltname ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.startsWith("DNS:"))
        .map((s) => s.slice(4));
      const issuer = cert.issuer as Record<string, string | string[]> | undefined;
      const org = issuer?.O ?? issuer?.CN;
      resolve({
        expires: Date.parse(cert.valid_to),
        issuer: Array.isArray(org) ? org[0] : org,
        names: names.length ? names : [String((cert.subject as Record<string, string> | undefined)?.CN ?? "")],
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timed out"));
    });
    socket.on("error", reject);
  });
}

/** Domain expiry and registrar from RDAP (rdap.org forwards to the registry of the domain's ending). */
export async function readRdap(
  domain: string,
  fetcher: typeof fetch = fetch,
): Promise<{ expires?: number; registrar?: string }> {
  const res = await fetcher(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { accept: "application/rdap+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RDAP ${res.status}`);
  const data = (await res.json()) as {
    events?: { eventAction: string; eventDate: string }[];
    entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[];
  };
  const expiry = data.events?.find((e) => e.eventAction === "expiration")?.eventDate;
  const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));
  const fn = registrarEntity?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
  return { expires: expiry ? Date.parse(expiry) : undefined, registrar: fn };
}

export async function readDns(host: string): Promise<DnsRecords> {
  const safe = <T>(p: Promise<T>, empty: T) => p.catch(() => empty);
  const [A, AAAA, CNAME, MX, NS, TXT] = await Promise.all([
    safe(dns.resolve4(host), [] as string[]),
    safe(dns.resolve6(host), [] as string[]),
    safe(dns.resolveCname(host), [] as string[]),
    safe(dns.resolveMx(host), [] as { exchange: string; priority: number }[]),
    safe(dns.resolveNs(registrableDomain(host)), [] as string[]),
    safe(dns.resolveTxt(host), [] as string[][]),
  ]);
  return {
    A,
    AAAA,
    CNAME,
    MX: MX.sort((a, b) => a.priority - b.priority),
    NS: NS.sort(),
    TXT: TXT.map((parts) => parts.join("")),
  };
}

/**
 * Uptime, domains and certificates (plan.md 12). Sites are opened on their own interval from
 * this computer; a site that fails twice in a row is down and goes to the inbox (and a desktop
 * notification). Domains are checked once a day: certificate on port 443, expiry from RDAP,
 * DNS records. Warnings come at 30, 14, 7 and 1 days before anything runs out.
 */
export class Monitors {
  private timer?: ReturnType<typeof setInterval>;
  private checking = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly deps: {
      fetcher?: typeof fetch;
      cert?: typeof readCertificate;
      rdap?: typeof readRdap;
      dns?: typeof readDns;
      now?: () => number;
    } = {},
  ) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), 30_000);
    setTimeout(() => void this.tick(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ---- uptime -------------------------------------------------------------------------------

  private toMonitor(row: MonitorRow): UptimeMonitor {
    const state = (row.state ? JSON.parse(row.state) : {}) as MonitorState;
    const since = this.now() - DAY;
    const checks = this.db
      .query("SELECT up, ms FROM uptime_checks WHERE monitor_id = ? AND at > ?")
      .all(row.id, since) as { up: number; ms: number | null }[];
    const times = checks
      .filter((c) => c.up && c.ms !== null)
      .map((c) => c.ms as number)
      .sort((a, b) => a - b);
    const { fails: _fails, ...shown } = state;
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      interval: row.interval_sec,
      ...shown,
      ...(checks.length
        ? { uptime24h: Math.round((checks.filter((c) => c.up).length / checks.length) * 1000) / 10 }
        : {}),
      ...(times.length ? { p50: times[Math.floor(times.length / 2)] } : {}),
      createdAt: row.created_at,
    };
  }

  list(): UptimeMonitor[] {
    return (this.db.query("SELECT * FROM uptime_monitors ORDER BY created_at").all() as MonitorRow[]).map((r) =>
      this.toMonitor(r),
    );
  }

  add(input: { name?: string; url: string; projectId?: string; interval?: number }): UptimeMonitor {
    const url = input.url.trim();
    if (!validUrl(url)) throw new Error("Enter a full address that starts with http:// or https://");
    const id = crypto.randomUUID().slice(0, 12);
    const interval = Math.min(3600, Math.max(60, Math.round(input.interval ?? 300)));
    const name = (input.name?.trim() || new URL(url).host).slice(0, 80);
    this.db
      .query(
        "INSERT INTO uptime_monitors (id, name, url, project_id, interval_sec, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, name, url, input.projectId ?? null, interval, this.now());
    void this.checkSite(id);
    return this.toMonitor(this.db.query("SELECT * FROM uptime_monitors WHERE id = ?").get(id) as MonitorRow);
  }

  remove(id: string): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM uptime_monitors WHERE id = ?").run(id);
      this.db.query("DELETE FROM uptime_checks WHERE monitor_id = ?").run(id);
    })();
    this.bus.publish({ type: "monitors-changed" });
  }

  history(id: string, hours = 24): UptimeCheck[] {
    return (
      this.db
        .query("SELECT at, up, status, ms, error FROM uptime_checks WHERE monitor_id = ? AND at > ? ORDER BY at")
        .all(id, this.now() - hours * 3_600_000) as {
        at: number;
        up: number;
        status: number | null;
        ms: number | null;
        error: string | null;
      }[]
    ).map((c) => ({
      at: c.at,
      up: !!c.up,
      ...(c.status !== null ? { status: c.status } : {}),
      ...(c.ms !== null ? { ms: c.ms } : {}),
      ...(c.error ? { error: c.error } : {}),
    }));
  }

  /** One request; a 4xx/5xx answer or no answer at all is a failed check. */
  async probe(url: string): Promise<Omit<UptimeCheck, "at">> {
    const started = performance.now();
    try {
      const res = await (this.deps.fetcher ?? fetch)(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "GodEye-Uptime/1.0" },
      });
      await res.body?.cancel().catch(() => undefined);
      const ms = Math.round(performance.now() - started);
      return { up: res.status < 400, status: res.status, ms };
    } catch (err) {
      const e = err as Error;
      return { up: false, error: e.name === "TimeoutError" ? "No answer in 15 s" : e.message.slice(0, 200) };
    }
  }

  async checkSite(id: string): Promise<UptimeMonitor | undefined> {
    const row = this.db.query("SELECT * FROM uptime_monitors WHERE id = ?").get(id) as MonitorRow | null;
    if (!row || this.checking.has(id)) return row ? this.toMonitor(row) : undefined;
    this.checking.add(id);
    try {
      const result = await this.probe(row.url);
      const at = this.now();
      this.db
        .query("INSERT INTO uptime_checks (monitor_id, at, up, status, ms, error) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, at, result.up ? 1 : 0, result.status ?? null, result.ms ?? null, result.error ?? null);
      this.db.query("DELETE FROM uptime_checks WHERE monitor_id = ? AND at < ?").run(id, at - 30 * DAY);
      const before = (row.state ? JSON.parse(row.state) : {}) as MonitorState;
      const fails = result.up ? 0 : (before.fails ?? 0) + 1;
      // The shown state changes after DOWN_AFTER failures, and back on the first success.
      const up = result.up ? true : fails >= DOWN_AFTER ? false : (before.up ?? true);
      const state: MonitorState = {
        ...result,
        up,
        fails,
        checkedAt: at,
        since: before.up === up && before.since ? before.since : at,
      };
      this.db.query("UPDATE uptime_monitors SET state = ? WHERE id = ?").run(JSON.stringify(state), id);
      if (before.up !== undefined && before.up !== up)
        this.bus.publish({ type: "alert", kind: up ? "up" : "down", title: row.name, link: "/tools?tab=uptime" });
      this.bus.publish({ type: "monitors-changed" });
      return this.toMonitor({ ...row, state: JSON.stringify(state) });
    } finally {
      this.checking.delete(id);
    }
  }

  // ---- domains and certificates -------------------------------------------------------------

  private toDomain(row: DomainRow): DomainWatch {
    const state = (row.state ? JSON.parse(row.state) : {}) as DomainState;
    return {
      id: row.id,
      host: row.host,
      ...(row.project_id ? { projectId: row.project_id } : {}),
      ...state,
      createdAt: row.created_at,
    };
  }

  domains(): DomainWatch[] {
    return (this.db.query("SELECT * FROM domain_watches ORDER BY host").all() as DomainRow[]).map((r) =>
      this.toDomain(r),
    );
  }

  async addDomain(input: { host: string; projectId?: string }): Promise<DomainWatch> {
    let host = input.host.trim().toLowerCase();
    if (validUrl(host)) host = new URL(host).hostname;
    host = host.replace(/\.$/, "");
    if (!validHost(host)) throw new Error("Enter a domain like example.com");
    const id = crypto.randomUUID().slice(0, 12);
    this.db
      .query("INSERT OR IGNORE INTO domain_watches (id, host, project_id, created_at) VALUES (?, ?, ?, ?)")
      .run(id, host, input.projectId ?? null, this.now());
    const row = this.db.query("SELECT * FROM domain_watches WHERE host = ?").get(host) as DomainRow;
    return (await this.checkDomain(row.id)) ?? this.toDomain(row);
  }

  removeDomain(id: string): void {
    this.db.query("DELETE FROM domain_watches WHERE id = ?").run(id);
    this.bus.publish({ type: "monitors-changed" });
  }

  async checkDomain(id: string): Promise<DomainWatch | undefined> {
    const row = this.db.query("SELECT * FROM domain_watches WHERE id = ?").get(id) as DomainRow | null;
    if (!row) return undefined;
    const before = (row.state ? JSON.parse(row.state) : {}) as DomainState;
    const registrable = registrableDomain(row.host);
    const [cert, rdap, records] = await Promise.allSettled([
      (this.deps.cert ?? readCertificate)(row.host),
      (this.deps.rdap ?? readRdap)(registrable, this.deps.fetcher),
      (this.deps.dns ?? readDns)(row.host),
    ]);
    const errors: string[] = [];
    const state: DomainState = { registrable, checkedAt: this.now() };
    if (cert.status === "fulfilled") {
      state.certExpires = cert.value.expires;
      state.certIssuer = cert.value.issuer;
      state.certNames = cert.value.names.slice(0, 20);
      state.certMismatch = !cert.value.names.some((n) => certCovers(n, row.host));
    } else errors.push(`Certificate: ${(cert.reason as Error).message}`);
    if (rdap.status === "fulfilled") {
      state.domainExpires = rdap.value.expires;
      state.registrar = rdap.value.registrar;
    } else {
      // Keep what was known: some registries answer slowly or not every day.
      state.domainExpires = before.domainExpires;
      state.registrar = before.registrar;
    }
    if (records.status === "fulfilled") state.dns = records.value;
    if (errors.length) state.error = errors.join("; ");
    this.db.query("UPDATE domain_watches SET state = ? WHERE id = ?").run(JSON.stringify(state), id);
    this.bus.publish({ type: "monitors-changed" });
    return this.toDomain({ ...row, state: JSON.stringify(state) });
  }

  async tick(): Promise<void> {
    const now = this.now();
    for (const row of this.db.query("SELECT * FROM uptime_monitors").all() as MonitorRow[]) {
      const state = (row.state ? JSON.parse(row.state) : {}) as MonitorState;
      if (!state.checkedAt || now - state.checkedAt >= row.interval_sec * 1000 - 5_000) void this.checkSite(row.id);
    }
    for (const row of this.db.query("SELECT * FROM domain_watches").all() as DomainRow[]) {
      const state = (row.state ? JSON.parse(row.state) : {}) as DomainState;
      if (!state.checkedAt || now - state.checkedAt >= DAY) await this.checkDomain(row.id).catch(() => undefined);
    }
  }

  // ---- inbox --------------------------------------------------------------------------------

  notices(): InboxNotice[] {
    const out: InboxNotice[] = [];
    const now = this.now();
    for (const m of this.list())
      if (m.up === false)
        out.push({
          id: `down:${m.id}:${m.since}`,
          kind: "down",
          projectId: m.projectId ?? "",
          projectName: m.projectId ? (this.store.projectRow(m.projectId)?.name ?? "") : "",
          detail: `${m.name} · ${m.status ?? m.error ?? ""}`,
          at: m.since ?? now,
          link: "/tools?tab=uptime",
        });
    for (const d of this.domains()) {
      const project = d.projectId ? (this.store.projectRow(d.projectId)?.name ?? "") : "";
      for (const [what, at] of [
        ["cert", d.certExpires],
        ["domain", d.domainExpires],
      ] as const) {
        const step = expiryStep(at, now);
        if (step === undefined || at === undefined) continue;
        out.push({
          id: `expiry:${d.id}:${what}:${step}:${at}`,
          kind: what === "cert" ? "cert" : "domain",
          projectId: d.projectId ?? "",
          projectName: project,
          detail: `${what === "cert" ? d.host : (d.registrable ?? d.host)} · ${daysLeft(at, now)}d`,
          at: now,
          link: "/tools?tab=domains",
        });
      }
      if (d.certMismatch)
        out.push({
          id: `certname:${d.id}:${d.certExpires}`,
          kind: "cert",
          projectId: d.projectId ?? "",
          projectName: project,
          detail: `${d.host} · ${(d.certNames ?? []).slice(0, 2).join(", ")}`,
          at: d.checkedAt ?? now,
          link: "/tools?tab=domains",
        });
    }
    return out;
  }
}
