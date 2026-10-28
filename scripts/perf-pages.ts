/**
 * Page switches, measured in a real browser (plan.md 19.10): the built app on a sealed-off test
 * server, each page of the strip opened by its link, timed from the click until the new page has
 * painted. The first visit of a page also loads its code; the second is what a person feels day to
 * day, and that is the one held to 100 ms. Part of `bun run test:perf` when a browser is there.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { seedProject, startTestServer } from "./test-server";

const WEB_DIST = resolve(import.meta.dir, "../apps/web/dist");
const PAGES = ["/chat", "/inbox", "/mine", "/team", "/company", "/org", "/personas", "/chief", "/"];
export const PAGE_LIMIT_MS = 100;

const browserPath = [process.env.IGREK_E2E_BROWSER, "/usr/bin/chromium", "/usr/bin/google-chrome"].find(
  (p): p is string => !!p && existsSync(p),
);

/** Median time of a page switch, first visits and visits back, or undefined when there is no browser or build. */
export async function measurePages(): Promise<
  { cold: number; warm: number; pages: Record<string, number> } | undefined
> {
  if (!browserPath || !existsSync(join(WEB_DIST, "index.html"))) return undefined;
  const server = await startTestServer({ webDist: WEB_DIST, seed: seedProject, stubAgent: true });
  const browser = await chromium.launch({ executablePath: browserPath, args: ["--no-sandbox"] });
  try {
    await server.call("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onboarded: true, askedCoding: true }),
    });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 820 } })).newPage();
    await page.goto(server.url);
    await page.waitForLoadState("networkidle");
    const visit = (path: string) =>
      page.evaluate(async (to) => {
        const before = document.querySelector("main .ge-page");
        const link = document.querySelector<HTMLAnchorElement>(`nav a[href="${to}"]`);
        if (!link) return -1;
        const t0 = performance.now();
        link.click();
        // Painted: the page element was replaced and two frames have gone by since.
        for (let i = 0; i < 300; i++) {
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          const now = document.querySelector("main .ge-page");
          if (now && now !== before && now.childElementCount > 0) {
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
            return performance.now() - t0;
          }
        }
        return -1;
      }, path);
    const cold: number[] = [];
    const pages: Record<string, number> = {};
    for (const p of PAGES) cold.push(await visit(p));
    const warm: number[] = [];
    for (const p of PAGES) {
      const ms = await visit(p);
      warm.push(ms);
      pages[p] = Math.round(ms);
    }
    const median = (xs: number[]) => {
      const s = xs.filter((x) => x >= 0).sort((a, b) => a - b);
      return Math.round(s[Math.floor(s.length / 2)] ?? -1);
    };
    return { cold: median(cold), warm: median(warm), pages };
  } finally {
    await browser.close();
    await server.stop();
  }
}

if (import.meta.main) console.log(JSON.stringify(await measurePages(), null, 2));
