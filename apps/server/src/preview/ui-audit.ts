/// <reference lib="dom" />
// Parts of this file run inside the browser page (page.evaluate), so they use the DOM types.
import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import type { UiAudit, UiPageCheck } from "@igrek/core";
import type { Browser, Page } from "playwright-core";

/** Widths a real person uses: a laptop and a phone. */
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "phone", width: 390, height: 844 },
] as const;
/** The home page plus this many pages its links lead to: enough to see the app, quick enough to wait for. */
const MORE_PAGES = 4;
const IMPACTS = new Set(["minor", "moderate", "serious", "critical"]);

let axeSource: string | undefined;
/** axe-core (MPL-2.0), the accessibility checker browsers' own tools use, loaded once. */
function axe(): string {
  axeSource ??= readFileSync(Bun.resolveSync("axe-core/axe.min.js", import.meta.dir), "utf8");
  return axeSource;
}

/** Links on the page that stay in the app, as paths, without the home page and repeats. */
async function appLinks(page: Page, base: string): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (links) => links.map((a) => (a as HTMLAnchorElement).href));
  const origin = new URL(base).origin;
  const paths = new Set<string>();
  for (const href of hrefs) {
    try {
      const u = new URL(href);
      if (u.origin === origin && u.pathname !== "/" && !/\.(pdf|zip|png|jpe?g|svg)$/i.test(u.pathname))
        paths.add(u.pathname);
    } catch {
      // Not an address.
    }
  }
  return [...paths].slice(0, MORE_PAGES);
}

/** What the page shows after it loaded: overflow, broken images and the two Web Vitals that need no clicks. */
function measure(): Promise<{ overflowX: boolean; brokenImages: number; lcpMs?: number; cls?: number }> {
  return new Promise((done) => {
    let lcp: number | undefined;
    let cls = 0;
    let sawShift = false;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          sawShift = true;
          if (!e.hadRecentInput) cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // A browser without these entries: the numbers stay unknown.
    }
    setTimeout(() => {
      const images = [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && img.src);
      done({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        brokenImages: images.length,
        lcpMs: lcp === undefined ? undefined : Math.round(lcp),
        cls: sawShift ? Math.round(cls * 1000) / 1000 : 0,
      });
    }, 600);
  });
}

async function checkPage(
  browser: Browser,
  url: string,
  path: string,
  viewport: (typeof VIEWPORTS)[number],
  saveShot: (png: Buffer) => string,
): Promise<UiPageCheck> {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => consoleErrors.push(e.message.slice(0, 300)));
  const base: UiPageCheck = {
    path,
    viewport: viewport.name,
    violations: [],
    overflowX: false,
    consoleErrors,
    brokenImages: 0,
  };
  try {
    await page.goto(new URL(path, url).href, { waitUntil: "networkidle", timeout: 20_000 });
    const shown = await page.evaluate(measure);
    await page.addScriptTag({ content: axe() });
    const result = (await page.evaluate(() =>
      (
        window as unknown as {
          axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: unknown[] }> };
        }
      ).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }),
    )) as { violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] };
    const shot = saveShot(await page.screenshot());
    return {
      ...base,
      ...shown,
      shot,
      consoleErrors: consoleErrors.slice(0, 10),
      violations: result.violations
        .filter((v) => IMPACTS.has(v.impact))
        .map((v) => ({
          id: v.id,
          impact: v.impact as UiPageCheck["violations"][number]["impact"],
          help: v.help,
          nodes: v.nodes.length,
          target: v.nodes[0]?.target?.join(" ").slice(0, 200),
        })),
    };
  } catch (err) {
    return { ...base, error: (err as Error).message.split("\n")[0]?.slice(0, 200) };
  } finally {
    await page.close();
  }
}

/**
 * The real-screen check: opens the running app (its preview) in a browser, the home page and a
 * few pages it links to, at laptop and phone width, and measures what a person would meet there.
 * No model is called. The browser is the one Igrek uses for screenshots.
 */
export async function auditUi(
  projectId: string,
  url: string,
  browser: Browser,
  saveShot: (png: Buffer) => string,
  now = Date.now(),
): Promise<UiAudit> {
  const first = await browser.newPage();
  let paths = ["/"];
  try {
    await first.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    paths = ["/", ...(await appLinks(first, url))];
  } catch {
    // The home page alone; checkPage says what went wrong with it.
  } finally {
    await first.close();
  }
  const pages: UiPageCheck[] = [];
  for (const path of paths)
    for (const viewport of VIEWPORTS) pages.push(await checkPage(browser, url, path, viewport, saveShot));
  return { projectId, at: now, url, pages };
}

/** The checks of a project, kept so a score can show what changed. */
export class UiAudits {
  constructor(private readonly db: Database) {}

  save(audit: UiAudit): void {
    this.db
      .query("INSERT INTO ui_audits (project_id, created_at, data) VALUES (?, ?, ?)")
      .run(audit.projectId, audit.at, JSON.stringify(audit));
  }

  /** The newest checks first. */
  recent(projectId: string, limit = 2): UiAudit[] {
    return (
      this.db
        .query("SELECT data FROM ui_audits WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(projectId, limit) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as UiAudit);
  }
}
