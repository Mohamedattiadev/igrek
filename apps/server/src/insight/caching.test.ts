import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachingOf } from "./caching";
import { takeSnapshot } from "./snapshot";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gd-cache-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("caches in the code", () => {
  test("layers are found, and values cached with no expiry are flagged", () => {
    const report = cachingOf(
      takeSnapshot(
        project({
          "src/cache.ts": [
            'import Redis from "ioredis";',
            'import { LRUCache } from "lru-cache";',
            "const redis = new Redis();",
            "export const users = new LRUCache({ max: 500 });",
            "export const pages = new LRUCache({ max: 100, ttl: 60_000 });",
            "await redis.set(`user:${id}`, JSON.stringify(user));",
            'await redis.set(`page:${id}`, JSON.stringify(page), "EX", 300);',
            "await redis.del(`user:${id}`);",
          ].join("\n"),
          "app/data.ts": 'export const get = unstable_cache(async () => load(), ["k"]);',
          "sw.js": "caches.open('v1')",
        }),
      ),
    );
    expect(report.layers.sort()).toEqual(["framework", "memory", "redis", "serviceWorker"]);
    expect(report.findings.map((f) => [f.rule, f.line]).sort()).toEqual([
      ["lruNoTtl", 4],
      ["redisNoExpiry", 6],
      ["unstableCacheNoRevalidate", 1],
    ]);
  });

  test("a cache nothing ever removes from is flagged once", () => {
    const report = cachingOf(
      takeSnapshot(
        project({ "a.ts": 'import NodeCache from "node-cache";\nconst c = new NodeCache({ stdTTL: 60 });' }),
      ),
    );
    expect(report.findings.map((f) => f.rule)).toEqual(["noInvalidation"]);
  });
});
