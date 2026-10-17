import type { PackageCheck, Settings } from "@godeye/core";
import { gitLog } from "./adapters/git";
import type { Bus } from "./bus";
import type { Store } from "./store";
import type { Summarizer } from "./summarizer";

const DAY = 24 * 60 * 60_000;

function localDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Looks a package up in its public registry. Missing packages and very new,
 * barely used ones are flagged: AI sometimes invents package names, and attackers
 * register those names ("slopsquatting", plan.md 1.9).
 */
export async function checkPackage(manager: "npm" | "pip", name: string): Promise<PackageCheck> {
  try {
    if (manager === "npm") {
      const encoded = name.replace("/", "%2F");
      // HEAD keeps it small even for packages with thousands of versions.
      const res = await fetch(`https://registry.npmjs.org/${encoded}`, {
        method: "HEAD",
        headers: { accept: "application/vnd.npm.install-v1+json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) return { manager, name, status: "missing", detail: "not on npm" };
      if (!res.ok) return { manager, name, status: "unknown" };
      const stats = await fetch(`https://api.npmjs.org/downloads/point/last-week/${name}`, {
        signal: AbortSignal.timeout(8000),
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ downloads?: number }>) : undefined))
        .catch(() => undefined);
      if (stats?.downloads !== undefined && stats.downloads < 100) {
        return { manager, name, status: "new", detail: `${stats.downloads} downloads last week` };
      }
      return { manager, name, status: "ok" };
    }
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { manager, name, status: "missing", detail: "not on PyPI" };
    if (!res.ok) return { manager, name, status: "unknown" };
    const meta = (await res.json()) as { releases?: Record<string, { upload_time?: string }[]> };
    const uploads = Object.values(meta.releases ?? {})
      .flat()
      .map((r) => (r.upload_time ? Date.parse(r.upload_time) : Number.POSITIVE_INFINITY));
    const first = Math.min(...uploads);
    if (Number.isFinite(first) && Date.now() - first < 30 * DAY) {
      return { manager, name, status: "new", detail: `first release ${new Date(first).toISOString().slice(0, 10)}` };
    }
    return { manager, name, status: "ok" };
  } catch {
    return { manager, name, status: "unknown" };
  }
}

/** Cheap periodic work: commits, package checks and yesterday's daily report. */
export class Jobs {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly summarizer: Summarizer,
    private readonly settings: () => Settings,
    private readonly fetchImpl: typeof checkPackage = checkPackage,
  ) {}

  start(): void {
    setTimeout(() => void this.tick(), 5_000);
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.syncCommits();
      await this.checkPackages();
      if (this.settings().autoSummarize) await this.dailyDigests();
    } finally {
      this.running = false;
    }
  }

  syncCommits(): void {
    const changed: string[] = [];
    for (const project of this.store.liveProjectRows()) {
      const since = this.store.latestCommitAt(project.id) || Date.now() - 90 * DAY;
      const commits = gitLog(project.path, since);
      if (commits.length && this.store.saveCommits(project.id, commits) > 0) changed.push(project.id);
    }
    if (changed.length) this.bus.publish({ type: "sessions-changed", projectIds: changed, sessionIds: [] });
  }

  async checkPackages(): Promise<void> {
    for (const p of this.store.uncheckedPackages(10)) {
      this.store.savePackageCheck(await this.fetchImpl(p.manager, p.name));
    }
  }

  /** Writes yesterday's report for projects that had activity, once. */
  async dailyDigests(): Promise<void> {
    const yesterday = localDay(Date.now() - DAY);
    const from = Date.parse(`${yesterday}T00:00:00`);
    for (const project of this.store.liveProjectRows()) {
      if (project.hidden || project.last_activity < from) continue;
      if (this.store.hasDigest(project.id, "day", yesterday)) continue;
      if (this.store.sessionsBetween(project.id, from, from + DAY).length === 0) continue;
      await this.summarizer.digest(project.id, "day", yesterday).catch(() => undefined);
    }
  }
}

export { localDay };
