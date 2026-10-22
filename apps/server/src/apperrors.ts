import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type AppErrorEvent, type AppErrorGroup, errorFingerprint, type InboxNotice } from "@igrek/core";
import type { Bus } from "./bus";
import type { Store } from "./store";

interface GroupRow {
  id: string;
  project_id: string;
  fingerprint: string;
  message: string;
  stack: string | null;
  count: number;
  first_at: number;
  last_at: number;
  first_release: string | null;
  last_release: string | null;
  suspects: string | null;
  urls: string;
  browsers: string;
  status: AppErrorGroup["status"];
}

/** Short browser name from a user agent: enough to see "only Safari". */
export function browserName(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return /Mobile/.test(ua) ? "Chrome Mobile" : "Chrome";
  if (/Safari\//.test(ua)) return /Mobile/.test(ua) ? "Safari Mobile" : "Safari";
  if (/^node|Node\.js|Bun\//i.test(ua)) return "Server";
  return "Other";
}

function git(cwd: string, args: string[]): string {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", timeout: 10_000 });
  return p.exitCode === 0 ? p.stdout.toString().trim() : "";
}

const MAX_PER_MINUTE = 120;

/**
 * Error tracking (plan.md 12), a small Sentry: your app sends its errors to Igrek with a
 * per-project key (a snippet of a few lines), they are grouped by message and stack, and each
 * group knows the release (commit) it first came with. The commits between the last release
 * without it and that one are the suspects. Nothing leaves this computer.
 */
export class AppErrors {
  private rate = new Map<string, { minute: number; n: number }>();

  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
  ) {}

  /** The project's ingest key, made on first use. It only allows sending errors, nothing else. */
  key(projectId: string): string {
    const row = this.db.query("SELECT key FROM app_error_keys WHERE project_id = ?").get(projectId) as {
      key: string;
    } | null;
    if (row) return row.key;
    const key = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
    this.db.query("INSERT INTO app_error_keys (project_id, key) VALUES (?, ?)").run(projectId, key);
    return key;
  }

  projectForKey(key: string): string | undefined {
    const row = this.db.query("SELECT project_id FROM app_error_keys WHERE key = ?").get(key) as {
      project_id: string;
    } | null;
    return row?.project_id;
  }

  /** The commit the project is on now: for local apps that don't send a release. */
  private currentCommit(projectId: string): string | undefined {
    const project = this.store.projectRow(projectId);
    if (!project || !existsSync(join(project.path, ".git"))) return undefined;
    return git(project.path, ["rev-parse", "--short=12", "HEAD"]) || undefined;
  }

  private suspects(projectId: string, release: string | undefined, at: number): AppErrorGroup["suspects"] {
    const project = this.store.projectRow(projectId);
    if (!project || !release || !existsSync(join(project.path, ".git"))) return undefined;
    // The newest release seen before this one, with no such error.
    const previous = this.db
      .query(
        "SELECT release FROM app_error_releases WHERE project_id = ? AND release != ? AND first_at < ? ORDER BY first_at DESC LIMIT 1",
      )
      .get(projectId, release, at) as { release: string } | null;
    const range = previous
      ? [`${previous.release}..${release}`]
      : [release, "--since", new Date(at - 86_400_000).toISOString()];
    const out = git(project.path, ["log", "--format=%h%x09%an%x09%s", "-n", "10", ...range]);
    const list = out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash = "", author = "", ...subject] = line.split("\t");
        return { hash, author, subject: subject.join("\t") };
      });
    return list.length ? list : undefined;
  }

  /** One event from an app. Returns false when the key is unknown or the app sends too much. */
  ingest(key: string, raw: unknown): boolean {
    const projectId = this.projectForKey(key);
    if (!projectId) return false;
    const minute = Math.floor(Date.now() / 60_000);
    const r = this.rate.get(key);
    if (r && r.minute === minute && r.n >= MAX_PER_MINUTE) return false;
    this.rate.set(key, r && r.minute === minute ? { minute, n: r.n + 1 } : { minute, n: 1 });
    const input = (raw ?? {}) as Partial<AppErrorEvent>;
    const message = String(input.message ?? "")
      .slice(0, 1000)
      .trim();
    if (!message) return false;
    const event: AppErrorEvent = {
      message,
      ...(input.stack ? { stack: String(input.stack).split("\n").slice(0, 30).join("\n").slice(0, 6000) } : {}),
      ...(input.url ? { url: String(input.url).split("?")[0]?.slice(0, 300) } : {}),
      release: input.release ? String(input.release).slice(0, 64) : this.currentCommit(projectId),
      ...(input.userAgent ? { userAgent: String(input.userAgent).slice(0, 300) } : {}),
    };
    const at = Date.now();
    if (event.release)
      this.db
        .query("INSERT OR IGNORE INTO app_error_releases (project_id, release, first_at) VALUES (?, ?, ?)")
        .run(projectId, event.release, at);
    const fp = errorFingerprint(event);
    const existing = this.db
      .query("SELECT * FROM app_error_groups WHERE project_id = ? AND fingerprint = ?")
      .get(projectId, fp) as GroupRow | null;
    const browser = browserName(event.userAgent);
    if (existing) {
      const urls = JSON.parse(existing.urls) as string[];
      const browsers = JSON.parse(existing.browsers) as string[];
      if (event.url && !urls.includes(event.url) && urls.length < 10) urls.push(event.url);
      if (browser && !browsers.includes(browser)) browsers.push(browser);
      // A resolved error that comes back is open again (a regression).
      const reopened = existing.status === "resolved";
      this.db
        .query(
          "UPDATE app_error_groups SET count = count + 1, last_at = ?, last_release = COALESCE(?, last_release), urls = ?, browsers = ?, status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END WHERE id = ?",
        )
        .run(at, event.release ?? null, JSON.stringify(urls), JSON.stringify(browsers), existing.id);
      if (reopened)
        this.bus.publish({
          type: "alert",
          kind: "appError",
          title: existing.message.slice(0, 80),
          link: `/p/${projectId}?tab=monitor`,
          projectId,
        });
    } else {
      const id = crypto.randomUUID().slice(0, 12);
      this.db
        .query(
          `INSERT INTO app_error_groups (id, project_id, fingerprint, message, stack, count, first_at, last_at, first_release, last_release, suspects, urls, browsers, status)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        )
        .run(
          id,
          projectId,
          fp,
          event.message,
          event.stack ?? null,
          at,
          at,
          event.release ?? null,
          event.release ?? null,
          JSON.stringify(this.suspects(projectId, event.release, at) ?? null),
          JSON.stringify(event.url ? [event.url] : []),
          JSON.stringify(browser ? [browser] : []),
        );
      this.bus.publish({
        type: "alert",
        kind: "appError",
        title: event.message.slice(0, 80),
        link: `/p/${projectId}?tab=monitor`,
        projectId,
      });
    }
    this.bus.publish({ type: "ops-changed", what: "errors" });
    return true;
  }

  private toGroup(r: GroupRow): AppErrorGroup {
    const suspects = r.suspects ? (JSON.parse(r.suspects) as AppErrorGroup["suspects"] | null) : null;
    return {
      id: r.id,
      projectId: r.project_id,
      fingerprint: r.fingerprint,
      message: r.message,
      ...(r.stack ? { stack: r.stack } : {}),
      count: r.count,
      firstAt: r.first_at,
      lastAt: r.last_at,
      ...(r.first_release ? { firstRelease: r.first_release } : {}),
      ...(r.last_release ? { lastRelease: r.last_release } : {}),
      ...(suspects ? { suspects } : {}),
      urls: JSON.parse(r.urls),
      browsers: JSON.parse(r.browsers),
      status: r.status,
    };
  }

  list(projectId: string): AppErrorGroup[] {
    return (
      this.db
        .query(
          "SELECT * FROM app_error_groups WHERE project_id = ? ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END, last_at DESC LIMIT 200",
        )
        .all(projectId) as GroupRow[]
    ).map((r) => this.toGroup(r));
  }

  get(id: string): AppErrorGroup | undefined {
    const row = this.db.query("SELECT * FROM app_error_groups WHERE id = ?").get(id) as GroupRow | null;
    return row ? this.toGroup(row) : undefined;
  }

  setStatus(id: string, status: AppErrorGroup["status"]): void {
    if (!["open", "resolved", "ignored"].includes(status)) throw new Error("Unknown status");
    this.db.query("UPDATE app_error_groups SET status = ? WHERE id = ?").run(status, id);
    this.bus.publish({ type: "ops-changed", what: "errors" });
  }

  /** Code to paste into the app: browser and Node/Bun. Sends only the message, stack, page and release. */
  snippet(projectId: string, base: string): { browser: string; server: string } {
    const url = `${base}/ingest/errors/${this.key(projectId)}`;
    const browser = `<script>
(function () {
  var url = "${url}";
  var release = ""; // optional: the commit this build came from
  function send(message, stack) {
    var body = JSON.stringify({ message: String(message), stack: stack, url: location.href, release: release, userAgent: navigator.userAgent });
    if (navigator.sendBeacon) navigator.sendBeacon(url, body);
    else fetch(url, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
  }
  addEventListener("error", function (e) { send(e.message, e.error && e.error.stack); });
  addEventListener("unhandledrejection", function (e) { var r = e.reason; send((r && r.message) || r, r && r.stack); });
  // Feedback box: igrekFeedback("text", "email (optional)"), or call it from your own form.
  var feedbackUrl = "${base}/ingest/feedback/${this.key(projectId)}";
  window.igrekFeedback = function (text, contact) {
    return fetch(feedbackUrl, { method: "POST", body: JSON.stringify({ text: text, contact: contact, page: location.pathname }), mode: "no-cors" });
  };
  // Core Web Vitals (LCP, INP, CLS) of this page view, sent once when the page is hidden.
  var vitalsUrl = "${base}/ingest/vitals/${this.key(projectId)}";
  var v = { lcp: 0, cls: 0, inp: 0 };
  function watch(type, fn, opts) {
    try { new PerformanceObserver(function (l) { l.getEntries().forEach(fn); }).observe(Object.assign({ type: type, buffered: true }, opts)); } catch (e) {}
  }
  watch("largest-contentful-paint", function (e) { v.lcp = e.startTime; });
  watch("layout-shift", function (e) { if (!e.hadRecentInput) v.cls += e.value; });
  watch("event", function (e) { if (e.interactionId && e.duration > v.inp) v.inp = e.duration; }, { durationThreshold: 40 });
  var vitalsSent = false;
  addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden" || vitalsSent || !navigator.sendBeacon) return;
    vitalsSent = true;
    navigator.sendBeacon(vitalsUrl, JSON.stringify({ page: location.pathname, lcp: Math.round(v.lcp), inp: Math.round(v.inp), cls: Math.round(v.cls * 1000) / 1000 }));
  });
  // Product analytics: igrekTrack("export_pdf", user.id). The id is hashed before it is stored.
  var events = "${base}/ingest/events/${this.key(projectId)}";
  window.igrekTrack = function (event, user) {
    var body = JSON.stringify({ event: event, user: user });
    if (navigator.sendBeacon) navigator.sendBeacon(events, body);
    else fetch(events, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
  };
})();
</script>`;
    const server = `// Node or Bun: send uncaught errors to Igrek (does not change how the app crashes).
const IGREK_ERRORS = "${url}";
const report = (err) =>
  fetch(IGREK_ERRORS, {
    method: "POST",
    body: JSON.stringify({ message: String(err?.message ?? err), stack: err?.stack, release: process.env.GIT_COMMIT, userAgent: "node" }),
  }).catch(() => {});
process.on("uncaughtException", (err) => { report(err).finally(() => process.exit(1)); });
process.on("unhandledRejection", (err) => { report(err); });

// Response times: wrap your request handler (Hono shown; any framework works the same way).
// app.use(async (c, next) => { const t = performance.now(); await next(); timing(c.req.routePath ?? c.req.path, c.req.method, performance.now() - t, c.res.status); });
const times = [];
export const timing = (route, method, ms, status) => {
  times.push({ route, method, ms: Math.round(ms), status });
  if (times.length >= 50) flushTimes();
};
const flushTimes = () => {
  if (!times.length) return;
  const events = times.splice(0);
  fetch("${base}/ingest/perf/${this.key(projectId)}", { method: "POST", body: JSON.stringify({ events }) }).catch(() => {});
};
setInterval(flushTimes, 30_000).unref?.();

// Product analytics: track("signup", user.id). The id is hashed before it is stored.
export const track = (event, user) =>
  fetch("${base}/ingest/events/${this.key(projectId)}", { method: "POST", body: JSON.stringify({ event, user }) }).catch(() => {});`;
    return { browser, server };
  }

  notices(): InboxNotice[] {
    const since = Date.now() - 2 * 86_400_000;
    return (
      this.db
        .query("SELECT * FROM app_error_groups WHERE status = 'open' AND last_at > ? ORDER BY last_at DESC LIMIT 10")
        .all(since) as GroupRow[]
    ).map((r) => ({
      id: `apperror:${r.id}:${r.count >= 100 ? "100" : r.count >= 10 ? "10" : "1"}`,
      kind: "appError" as const,
      projectId: r.project_id,
      projectName: this.store.projectRow(r.project_id)?.name ?? "",
      detail: `${r.message.slice(0, 80)} · ${r.count}x`,
      at: r.last_at,
      link: `/p/${r.project_id}?tab=monitor`,
    }));
  }
}
