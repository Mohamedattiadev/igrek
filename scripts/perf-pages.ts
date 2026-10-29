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

/**
 * The same in WebKitGTK, the desktop window's engine on Linux, when its Python bindings are there
 * (scripts/perf-webkit.py); undefined otherwise.
 */
async function webkit(
  url: string,
  median: (xs: number[]) => number,
): Promise<{ cold: number; warm: number } | undefined> {
  const proc = Bun.spawn(["python3", resolve(import.meta.dir, "perf-webkit.py"), url, JSON.stringify(PAGES)], {
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, WEBKIT_DISABLE_COMPOSITING_MODE: "1", WEBKIT_DISABLE_DMABUF_RENDERER: "1" },
  });
  const out = (await new Response(proc.stdout).text()).trim().split("\n").at(-1) ?? "";
  await proc.exited;
  try {
    const r = JSON.parse(out) as { cold: number[]; warm: Record<string, number> };
    return { cold: median(r.cold), warm: median(Object.values(r.warm)) };
  } catch {
    return undefined;
  }
}

/**
 * Typing: 120 keys at a quick typist's pace into the first page's start box, watching for the page
 * being stuck (long tasks over 50 ms) and the slowest key from press to the next frame.
 */
async function typingLag(page: import("playwright-core").Page): Promise<{ longTasks: number; slowestKeyMs: number }> {
  await page.goto(page.url().replace(/\/[^/]*$/, "/"));
  await page.waitForLoadState("networkidle");
  // The start box: what a person types first.
  const box = page.locator("main input[type=text], main input:not([type]), main textarea").first();
  if (!(await box.count())) return { longTasks: -1, slowestKeyMs: -1 };
  await box.click();
  await page.evaluate(() => {
    const w = window as unknown as { igrekLong: number; igrekKeys: number[] };
    w.igrekLong = 0;
    w.igrekKeys = [];
    new PerformanceObserver((list) => {
      w.igrekLong += list.getEntries().length;
    }).observe({ type: "longtask" });
    addEventListener(
      "keydown",
      () => {
        const t0 = performance.now();
        requestAnimationFrame(() => w.igrekKeys.push(performance.now() - t0));
      },
      true,
    );
  });
  await page.keyboard.type(
    "Ödeme sayfasına kupon alanı ekle, sepet toplamını güncelle ve testlerini yaz. ".repeat(2).slice(0, 120),
    { delay: 30 },
  );
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const w = window as unknown as { igrekLong: number; igrekKeys: number[] };
    return { longTasks: w.igrekLong, slowestKeyMs: Math.round(Math.max(0, ...w.igrekKeys)) };
  });
}

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
    const typing = await typingLag(page);
    return { cold: median(cold), warm: median(warm), pages, typing, webkit: await webkit(server.url, median) };
  } finally {
    await browser.close();
    await server.stop();
  }
}

if (import.meta.main) console.log(JSON.stringify(await measurePages(), null, 2));
