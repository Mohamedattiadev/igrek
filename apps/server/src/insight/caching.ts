import type { CodeCacheReport } from "@godeye/core";
import type { Snapshot } from "./snapshot";

/**
 * Cache layers inside a project's code (plan.md 15.4): which ones it uses (application memory,
 * Redis, framework data cache, service worker, database query cache), and values cached with no
 * expiry, which keep showing old data after it changed. Pattern matching, reviewed by the reader.
 */

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|php|java|kt|cs)$/;
const TEST = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/;

const LAYERS: [CodeCacheReport["layers"][number], RegExp][] = [
  ["memory", /\b(new\s+(LRUCache|NodeCache)\s*\(|lru-cache|node-cache|cachetools|functools\.lru_cache|@cache\b)/],
  ["redis", /\b(ioredis|createClient\(|redis\.(set|get)|Redis\(|from\s+["']redis["']|django_redis|go-redis)/],
  ["framework", /\b(unstable_cache|revalidateTag|revalidatePath|cache_page|@Cacheable|Rails\.cache|Cache::remember)\b/],
  ["serviceWorker", /\b(serviceWorker\.register|workbox|caches\.open\()/],
  ["database", /\b(cacheStrategy|\$accelerate|query_cache|QueryCache|cache:\s*\{\s*ttl)/],
];

/** Caching calls that set no expiry: rule, and a test that the same call names a lifetime. */
const NO_TTL: { rule: CodeCacheReport["findings"][number]["rule"]; call: RegExp; ttl: RegExp }[] = [
  {
    rule: "redisNoExpiry",
    call: /\bredis\w*\.set\(/gi,
    ttl: /\b(EX|PX|EXAT|PXAT|KEEPTTL)\b|\bex\s*:|\bpx\s*:|\bEX\b/,
  },
  { rule: "lruNoTtl", call: /new\s+(LRUCache|LRU)\s*\(\s*\{[^}]*\}/g, ttl: /\bttl\b|\bmaxAge\b/ },
  { rule: "nodeCacheNoTtl", call: /new\s+NodeCache\s*\(\s*(\{[^}]*\})?\s*\)/g, ttl: /stdTTL/ },
  { rule: "unstableCacheNoRevalidate", call: /unstable_cache\s*\([\s\S]{0,600}?\)\s*;?/g, ttl: /revalidate\s*:/ },
];

const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** A call from its name to its closing parenthesis (arguments often contain calls of their own). */
function wholeCall(text: string, start: number, matched: string): string {
  const open = text.indexOf("(", start);
  if (open < 0 || open > start + matched.length) return matched;
  let depth = 0;
  for (let i = open; i < Math.min(text.length, open + 2000); i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start, open + 2000);
}

/** Values cached with no lifetime in one file. */
function noExpiry(path: string, text: string): CodeCacheReport["findings"] {
  const out: CodeCacheReport["findings"] = [];
  for (const { rule, call, ttl } of NO_TTL)
    for (const m of text.matchAll(call))
      if (!ttl.test(wholeCall(text, m.index ?? 0, m[0])))
        out.push({ rule, file: path, line: lineAt(text, m.index ?? 0) });
  return out;
}

export function cachingOf(snap: Snapshot): CodeCacheReport {
  const files = snap.files.filter((f) => CODE.test(f.path) && !TEST.test(f.path) && f.text);
  const layers = new Set(LAYERS.filter(([, re]) => files.some((f) => re.test(f.text ?? ""))).map(([layer]) => layer));
  const findings = files.flatMap((f) => noExpiry(f.path, f.text ?? "")).slice(0, 40);
  // A Redis or memory cache with nothing that ever removes or replaces a key goes stale for good.
  const invalidates = files.some((f) =>
    /\b(del|unlink|delete|invalidate|evict|revalidateTag|revalidatePath|clear|expire)\s*\(/.test(f.text ?? ""),
  );
  if ((layers.has("redis") || layers.has("memory")) && !invalidates)
    findings.push({ rule: "noInvalidation", file: "", line: 0 });
  return { layers: [...layers], findings };
}
