import { describe, expect, test } from "bun:test";
import { assetsOf, auditCaching, cdnOf, judge } from "./cache-audit";

describe("cache audit", () => {
  test("each kind of file has its own rule", () => {
    expect(judge("/", "html", { "cache-control": "public, max-age=86400" }).map((f) => f.rule)).toContain(
      "htmlCachedLong",
    );
    expect(judge("/", "html", { "cache-control": "no-cache", etag: "x" })).toEqual([]);
    expect(judge("/a.3f9c2a1b.js", "hashed", { "cache-control": "max-age=3600" }).map((f) => f.rule)).toEqual([
      "hashedNotImmutable",
    ]);
    expect(judge("/a.3f9c2a1b.js", "hashed", { "cache-control": "public, max-age=31536000, immutable" })).toEqual([]);
    expect(judge("/app.js", "asset", {}).map((f) => f.rule)).toEqual(["noCache"]);
    const big = { "cache-control": "no-cache", etag: "x", "content-type": "text/css", "content-length": "50000" };
    expect(judge("/a.css", "asset", big).map((f) => f.rule)).toEqual(["notCompressed"]);
    expect(judge("/a.css", "asset", { ...big, "content-encoding": "br" })).toEqual([]);
  });

  test("CDNs are recognised from their headers", () => {
    expect(cdnOf({ "cf-ray": "1", "cf-cache-status": "HIT" })).toEqual({ name: "Cloudflare", hit: true });
    expect(cdnOf({ "x-vercel-id": "x", "x-vercel-cache": "MISS" })).toEqual({ name: "Vercel", hit: false });
    expect(cdnOf({})).toBeUndefined();
  });

  test("same-site scripts and styles are found; other sites are not fetched", () => {
    const html = `<script src="/assets/index-BkX9_2Qa.js"></script><link href="/style.css" rel="stylesheet"><script src="https://cdn.other.com/x.js"></script>`;
    expect(assetsOf(html, "https://shop.test/")).toEqual([
      "https://shop.test/assets/index-BkX9_2Qa.js",
      "https://shop.test/style.css",
    ]);
  });

  test("a whole audit with a fake network", async () => {
    const pages: Record<string, [string, Record<string, string>]> = {
      "https://shop.test/": [
        '<script src="/app.3f9c2a1b.js"></script><script>navigator.serviceWorker.register("/sw.js")</script>',
        { "cache-control": "max-age=86400", "cf-ray": "1", "cf-cache-status": "MISS" },
      ],
      "https://shop.test/app.3f9c2a1b.js": ["x", { "cache-control": "max-age=60" }],
    };
    const fake = (async (input: string | URL | Request) => {
      const [body, headers] = pages[String(input)] ?? ["", {}];
      return new Response(body, { headers });
    }) as typeof fetch;
    const audit = await auditCaching("https://shop.test/", fake);
    expect(audit.checked).toBe(2);
    expect(audit.findings.map((f) => f.rule).sort()).toEqual(["hashedNotImmutable", "htmlCachedLong", "noValidator"]);
    expect(audit.cdn).toEqual({ name: "Cloudflare", hit: false });
    expect(audit.serviceWorker).toBe(true);
    await expect(auditCaching("file:///etc/passwd", fake)).rejects.toThrow("http");
  });
});
