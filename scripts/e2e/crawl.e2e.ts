/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import { NAV_ITEMS } from "../../apps/web/src/components/nav";
import { reachesOut, SESSION, seededProjectId, seedProject, startTestServer, type TestServer } from "../test-server";

/**
 * Every page, and on every page every button, link and tab, clicked one after the other, the way a
 * curious user would (`bun run test:e2e`). A click may do anything to the sealed-off install; what
 * counts as broken is a script error, a server error (5xx), a blank screen, or a back button that
 * does not return to the page before. Requests that would reach the real machine (Docker, update,
 * a shell, a dev server) are stopped in the browser. Models are never called (test-server.ts).
 */

const WEB_DIST = resolve(import.meta.dir, "../../apps/web/dist");
/** Clicks per page: enough to reach everything a page shows first, small enough to finish in minutes. */
const CLICKS = 40;
const CLICKABLE = 'button:visible, a[href]:visible, [role="tab"]:visible, summary:visible';

function browserPath(): string | undefined {
  const candidates = [process.env.IGREK_E2E_BROWSER, "/usr/bin/chromium", "/usr/bin/google-chrome"];
  return candidates.find((path): path is string => !!path && existsSync(path));
}

const executablePath = browserPath();
const ready = !!executablePath && existsSync(join(WEB_DIST, "index.html"));

/** "/p/abc?tab=x" → "/p/abc": a click that only changes the query stays on the same page. */
const pathOf = (url: string) => new URL(url).pathname;

describe.skipIf(!ready)("every page, every button", () => {
  let server: TestServer;
  let browser: Browser;
  let ctx: BrowserContext;
  let page: Page;
  let project = "";
  let chat = "";
  const problems: string[] = [];
  let where = "";

  beforeAll(async () => {
    server = await startTestServer({ webDist: WEB_DIST, seed: seedProject, stubAgent: true });
    project = (await seededProjectId(server)) ?? "";
    await server.call("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ onboarded: true, language: "en" }),
    });
    const started = await server.call("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project }),
    });
    chat = ((await started.json()) as { id: string }).id;
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    ctx = await browser.newContext({ locale: "en-US", viewport: { width: 1366, height: 860 }, acceptDownloads: true });
    // The try: this also runs in sandboxed plugin frames, where storage is off.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("igrek.tour.seen", "1");
      } catch {
        // No storage in a sandboxed frame; nothing to remember there.
      }
    });
    await ctx.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (reachesOut(route.request().method(), url.pathname))
        return route.fulfill({ status: 403, json: { error: "blocked in tests" } });
      return route.continue();
    });
    page = await ctx.newPage();
    page.on("pageerror", (e) => problems.push(`${where}: script error: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 500 && r.status() !== 502 && r.status() !== 503)
        problems.push(`${where}: ${r.status()} ${r.request().method()} ${pathOf(r.url())}`);
    });
    // Links that leave the app open elsewhere; close them and stay here.
    ctx.on("page", (other) => void other.close());
    page.on("dialog", (dialog) => void dialog.dismiss());
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  });

  async function blank(): Promise<boolean> {
    return page.evaluate(() => (document.getElementById("root")?.innerText ?? "").trim().length === 0);
  }

  async function visit(path: string): Promise<void> {
    where = path;
    await page.goto(`${server.url}${path}`, { waitUntil: "networkidle" }).catch(() => undefined);
    if (await blank()) problems.push(`${path}: blank screen`);
  }

  /** A page's code loads before the address changes, so a click is given a moment to land. */
  const settle = () => page.waitForTimeout(450);

  /** Clicks the n-th clickable thing; after a move to another page, the back button must return. */
  async function clickOne(path: string, n: number): Promise<boolean> {
    const home = pathOf(`${server.url}${path}`);
    if (pathOf(page.url()) !== home) await visit(path);
    const items = page.locator(CLICKABLE);
    if (n >= (await items.count())) return false;
    const item = items.nth(n);
    const label = ((await item.getAttribute("aria-label")) || (await item.innerText().catch(() => ""))).trim();
    where = `${path} → "${label.slice(0, 40)}"`;
    await item.click({ timeout: 2_000 }).catch(() => undefined);
    await settle();
    if (await blank()) problems.push(`${where}: blank screen`);
    const after = page.url();
    if (new URL(after).origin !== new URL(server.url).origin) {
      await visit(path);
    } else if (pathOf(after) !== home) {
      await page.goBack().catch(() => undefined);
      await settle();
      if (pathOf(page.url()) !== home) {
        problems.push(`${where}: back went to ${pathOf(page.url())}, not ${home}`);
        await visit(path);
      }
    }
    // Whatever opened (a dialog, a menu, a drawer) closes before the next click.
    await page.keyboard.press("Escape").catch(() => undefined);
    return true;
  }

  async function crawl(path: string): Promise<void> {
    await visit(path);
    for (let n = 0; n < CLICKS; n++) if (!(await clickOne(path, n))) break;
  }

  test("every page in the sidebar", async () => {
    problems.length = 0;
    for (const item of NAV_ITEMS) await crawl(item.to);
    expect(problems).toEqual([]);
  }, 900_000);

  test("every tab of a project, a session and a chat", async () => {
    problems.length = 0;
    const tabs = ["overview", "board", "preview", "sections", "timeline", "sessions", "experts", "code", "memory"];
    const more = ["docs", "host", "environments", "monitor", "plugins", "setup"];
    for (const tab of [...tabs, ...more]) await crawl(`/p/${project}?tab=${tab}`);
    await crawl(`/p/${project}/s/${SESSION}`);
    await crawl(`/c/${chat}`);
    expect(problems).toEqual([]);
  }, 900_000);

  test("the pages one level down", async () => {
    problems.length = 0;
    for (const path of ["/personas/architect", "/personas/new", "/guide", "/weekly", "/lessons", "/knowledge"])
      await crawl(path);
    expect(problems).toEqual([]);
  }, 600_000);

  test("continuing a session shows what was said, and the back arrow returns to the session", async () => {
    problems.length = 0;
    where = "continue a session";
    await visit(`/p/${project}/s/${SESSION}`);
    await page.getByRole("button", { name: "Continue in chat" }).click();
    await page.waitForURL(/\/c\//);
    await page.getByText("Add a cart page").first().waitFor();
    await page.getByText("Added the cart page.").first().waitFor();
    await page.locator("header a").first().click();
    await page.waitForURL((url) => url.pathname === `/p/${project}/s/${SESSION}`);
    expect(problems).toEqual([]);
  }, 60_000);
});
