/**
 * Network and cache layers of a live site (plan.md 15.4): the page and the files it loads are
 * fetched once, and their response headers are checked against the usual rules. Each finding
 * names the file, what is wrong, and the fix; sources are MDN and web.dev.
 */
import type { CacheAudit, CacheFinding } from "@godeye/core";

/** Response headers of one file, lower-case names. */
export type Headers = Record<string, string>;

/** Build tools put a content hash in file names: app.3f9c2a1b.js, index-BkX9_2Qa.css. */
const HASHED = /[.-][A-Za-z0-9_]{8,}\.(js|mjs|css|woff2?|png|jpe?g|webp|avif|svg)(\?|$)/;
const TEXT = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;
const YEAR = 31_536_000;

function maxAge(cacheControl: string): number | undefined {
  const m = cacheControl.match(/(?:^|,)\s*(?:s-)?max-age=(\d+)/);
  return m ? Number(m[1]) : undefined;
}

/** What is wrong with one response, judged by what kind of file it is. */
export function judge(url: string, kind: CacheFinding["kind"], h: Headers): CacheFinding[] {
  const out: CacheFinding[] = [];
  const cc = (h["cache-control"] ?? "").toLowerCase();
  const age = maxAge(cc);
  const validator = !!(h.etag || h["last-modified"]);
  if (kind === "html" && age !== undefined && age > 600 && !cc.includes("no-cache"))
    out.push({ url, kind, rule: "htmlCachedLong", seen: cc });
  if (kind === "hashed" && !(age !== undefined && age >= YEAR / 2 && cc.includes("immutable")))
    out.push({ url, kind, rule: "hashedNotImmutable", seen: cc || "(none)" });
  if (kind === "asset" && !cc && !validator) out.push({ url, kind, rule: "noCache", seen: "(none)" });
  else if (kind !== "hashed" && !validator && !cc.includes("no-store"))
    out.push({ url, kind, rule: "noValidator", seen: "no ETag, no Last-Modified" });
  const type = (h["content-type"] ?? "").toLowerCase();
  const size = Number(h["content-length"] ?? 0);
  if (TEXT.test(type) && size !== 0 && size > 1024 && !/br|gzip|zstd|deflate/.test(h["content-encoding"] ?? ""))
    out.push({ url, kind, rule: "notCompressed", seen: h["content-encoding"] || "(none)" });
  return out;
}

/** A CDN or cache proxy, from the headers it adds. */
export function cdnOf(h: Headers): CacheAudit["cdn"] {
  const status = (h["cf-cache-status"] ?? h["x-cache"] ?? h["x-vercel-cache"] ?? h["x-nf-cache"] ?? "").toUpperCase();
  const hit = status ? status.includes("HIT") : undefined;
  if (h["cf-ray"] || h["cf-cache-status"]) return { name: "Cloudflare", hit };
  if (h["x-vercel-id"] || h["x-vercel-cache"]) return { name: "Vercel", hit };
  if (h["x-nf-request-id"]) return { name: "Netlify", hit };
  if (h["x-amz-cf-id"]) return { name: "CloudFront", hit };
  if (h["x-served-by"]?.includes("cache")) return { name: "Fastly", hit };
  if (h["x-cache"] || h.via || h.age) return { name: h.via ? h.via.split(" ").pop() || "proxy" : "proxy", hit };
  return undefined;
}

/** Scripts, styles and preloads the page links to (same site only, at most `limit`). */
export function assetsOf(html: string, base: string, limit = 12): string[] {
  const origin = new URL(base).origin;
  const urls = new Set<string>();
  for (const m of html.matchAll(/<(?:script[^>]+src|link[^>]+href)=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1] ?? "", base);
      if (u.origin === origin && /\.(js|mjs|css|woff2?)(\?|$)/.test(u.pathname)) urls.add(u.href);
    } catch {
      // Not a URL.
    }
    if (urls.size >= limit) break;
  }
  return [...urls];
}

const headersOf = (res: Response): Headers =>
  Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));

/** Fetches the page and its files with compression allowed, the way a browser would. */
export async function auditCaching(url: string, get: typeof fetch = fetch): Promise<CacheAudit> {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Give an http or https address");
  const init = {
    headers: { "accept-encoding": "br, gzip", "user-agent": "GodEye-cache-check" },
    redirect: "follow" as const,
  };
  const page = await get(target.href, { ...init, signal: AbortSignal.timeout(15_000) });
  const html = await page.text();
  const first = headersOf(page);
  const findings = judge(page.url || target.href, "html", first);
  const assets = assetsOf(html, page.url || target.href);
  for (const asset of assets) {
    try {
      const res = await get(asset, { ...init, signal: AbortSignal.timeout(10_000) });
      await res.arrayBuffer();
      findings.push(...judge(asset, HASHED.test(asset) ? "hashed" : "asset", headersOf(res)));
    } catch {
      // A file that would not load is a different problem; the uptime checks catch that.
    }
  }
  return {
    url: page.url || target.href,
    at: Date.now(),
    checked: 1 + assets.length,
    findings,
    ...(cdnOf(first) ? { cdn: cdnOf(first) } : {}),
    serviceWorker: /serviceWorker\.register\(/.test(html),
  };
}
