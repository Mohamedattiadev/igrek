/**
 * Zero telemetry, shown rather than promised (plan.md 13.6): every address God Eye's server
 * itself opens on the internet is counted here (host, how often, last time, what for), and
 * nothing is sent anywhere about you. Tools God Eye starts (claude, git, gh, ssh) talk to their
 * own services with your own logins; those are listed separately, not intercepted.
 */
export interface NetEntry {
  host: string;
  count: number;
  first: number;
  last: number;
  /** Paths seen, without query strings (they can hold keys). */
  paths: string[];
}

const LOCAL =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export const netLog = new Map<string, NetEntry>();

export function recordRequest(url: string, now = Date.now()): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (LOCAL.test(u.hostname)) return;
  const e = netLog.get(u.hostname) ?? { host: u.hostname, count: 0, first: now, last: now, paths: [] };
  e.count++;
  e.last = now;
  // The Telegram bot path carries the token: keep only the method name.
  const path =
    u.hostname === "api.telegram.org"
      ? `/bot…/${u.pathname.split("/").pop()}`
      : u.pathname.replace(/\/[\w-]{32,}/g, "/…");
  if (!e.paths.includes(path) && e.paths.length < 12) e.paths.push(path.slice(0, 80));
  netLog.set(u.hostname, e);
}

/** Wraps the server's fetch once at start. */
export function watchFetch(): void {
  const original = globalThis.fetch;
  if ((original as { godeye?: boolean }).godeye) return;
  const wrapped = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    recordRequest(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    return original(input, init);
  }) as typeof fetch;
  (wrapped as { godeye?: boolean }).godeye = true;
  globalThis.fetch = Object.assign(wrapped, original);
}

/** What each known host is for, so the list reads in plain words. */
export const HOST_PURPOSE: Record<string, string> = {
  "huggingface.co": "searchModel",
  "cdn-lfs.huggingface.co": "searchModel",
  "cas-bridge.xethub.hf.co": "searchModel",
  "api.osv.dev": "vulns",
  "registry.npmjs.org": "packages",
  "pypi.org": "packages",
  "endoflife.date": "packages",
  "rdap.org": "domains",
  "api.frankfurter.dev": "rates",
  "hn.algolia.com": "news",
  "www.reddit.com": "news",
  "lobste.rs": "news",
  "export.arxiv.org": "news",
  "huggingface.co/api/daily_papers": "news",
  "public.api.bsky.app": "news",
  "mastodon.social": "news",
  "api.telegram.org": "bridges",
  "discord.com": "bridges",
};
