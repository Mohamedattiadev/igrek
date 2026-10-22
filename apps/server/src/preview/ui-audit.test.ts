import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { openDb } from "../db";
import { auditUi, UiAudits } from "./ui-audit";

const BROWSER = [process.env.IGREK_E2E_BROWSER, "/usr/bin/chromium", "/usr/bin/google-chrome"].find(
  (path): path is string => !!path && existsSync(path),
);

/** A small app with the problems a person would meet: unreadable text, a picture with no words, a page wider than a phone. */
const HOME = `<!doctype html><html lang="en"><head><title>Shop</title></head><body>
<a href="/about">About</a>
<p style="color:#bbb;background:#fff">Hard to read</p>
<img src="/missing.png">
<div style="width:900px">Too wide for a phone</div>
<script>console.error("boom")</script>
</body></html>`;
const ABOUT = `<!doctype html><html lang="en"><head><title>About</title></head><body><main><h1>About</h1><p>Fine.</p></main></body></html>`;

describe.skipIf(!BROWSER)("the real-screen check", () => {
  test("finds what a person would meet on each page, at laptop and phone width", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (req) => {
        const path = new URL(req.url).pathname;
        if (path === "/") return new Response(HOME, { headers: { "content-type": "text/html" } });
        if (path === "/about") return new Response(ABOUT, { headers: { "content-type": "text/html" } });
        return new Response("no", { status: 404 });
      },
    });
    const browser = await chromium.launch({ executablePath: BROWSER, args: ["--no-sandbox"] });
    let shots = 0;
    try {
      const audit = await auditUi("p1", `http://localhost:${server.port}`, browser, () => `shot-${++shots}.png`, 5);
      expect(audit.pages.map((p) => `${p.path} ${p.viewport}`)).toEqual([
        "/ desktop",
        "/ phone",
        "/about desktop",
        "/about phone",
      ]);
      const home = audit.pages.find((p) => p.path === "/" && p.viewport === "phone");
      expect(home?.violations.map((v) => v.id)).toEqual(expect.arrayContaining(["color-contrast", "image-alt"]));
      expect(home?.overflowX).toBe(true);
      expect(home?.brokenImages).toBe(1);
      expect(home?.consoleErrors.some((e) => e.includes("boom"))).toBe(true);
      const about = audit.pages.find((p) => p.path === "/about" && p.viewport === "phone");
      expect(about?.overflowX).toBe(false);
      expect(about?.consoleErrors).toEqual([]);
      expect(shots).toBe(4);

      const store = new UiAudits(openDb(":memory:").sqlite);
      expect(() => store.save(audit)).toThrow(); // the project must exist (a foreign key)
    } finally {
      await browser.close();
      server.stop(true);
    }
  }, 60_000);
});
