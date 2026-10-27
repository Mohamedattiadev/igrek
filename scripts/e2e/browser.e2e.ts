/// <reference lib="dom" />
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import { NAV_ITEMS } from "../../apps/web/src/components/nav";
import { seededProjectId, seedProject, startTestServer, type TestServer } from "../test-server";

/**
 * The app in a real browser (`bun run test:e2e`, after `bun run build`): a fresh install greets, every
 * page opens in the light and the dark theme without a script error, the logo reads on both, and the
 * chat's "@" list works from the keyboard. The server is sealed off (see test-server.ts) and its
 * "claude" only waits, so no model is ever called. Screenshots go to IGREK_E2E_SHOTS when it is set.
 */

const WEB_DIST = resolve(import.meta.dir, "../../apps/web/dist");
const SHOTS = process.env.IGREK_E2E_SHOTS;
const SCHEMES = ["light", "dark"] as const;
// The design page is for Pro users only; the rest is what everyone sees.
const PAGES = NAV_ITEMS.filter((item) => !item.proOnly).map((item) => item.to);

function browserPath(): string | undefined {
  const candidates = [
    process.env.IGREK_E2E_BROWSER,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  return candidates.find((path): path is string => !!path && existsSync(path));
}

/** sRGB contrast ratio of two "rgb(r, g, b)" colors (WCAG). */
function contrast(a: string, b: string): number {
  const lum = (css: string) => {
    const [r = 0, g = 0, bl = 0] = (css.match(/[\d.]+/g) ?? []).map(Number).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const executablePath = browserPath();
const ready = !!executablePath && existsSync(join(WEB_DIST, "index.html"));
if (!ready) console.warn("browser tests skipped: needs `bun run build` and Chromium (or IGREK_E2E_BROWSER)");

describe.skipIf(!ready)("the app in a browser", () => {
  let server: TestServer;
  let browser: Browser;
  let project: string;

  beforeAll(async () => {
    server = await startTestServer({ webDist: WEB_DIST, seed: seedProject, stubAgent: true });
    project = (await seededProjectId(server)) ?? "";
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    await settings({ onboarded: true, askedCoding: true, language: "en" });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  });

  const settings = (patch: Record<string, unknown>) =>
    server.call("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });

  /** A page that records every script error and every console error it shows. */
  async function open(
    scheme: "light" | "dark",
    path: string,
  ): Promise<{ page: Page; ctx: BrowserContext; errors: string[] }> {
    const ctx = await browser.newContext({
      colorScheme: scheme,
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    // The guided tour would cover the page; people who finished it don't see it either.
    // The try: this also runs in sandboxed plugin frames, where storage is off.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("igrek.tour.seen", "1");
      } catch {
        // No storage in a sandboxed frame; nothing to remember there.
      }
    });
    // Every page opens as a first visit, without the session cookie, so no request may run ahead of it.
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${path}: ${m.text()}`);
    });
    await page.goto(`${server.url}${path}`, { waitUntil: "networkidle" });
    return { page, ctx, errors };
  }

  test("before setup is done, the welcome screen comes first, then the project folders, then the tools", async () => {
    expect((await settings({ onboarded: false })).status).toBe(200);
    const { page, ctx, errors } = await open("light", "/");
    await page.getByRole("heading", { name: "Welcome to Igrek" }).waitFor();
    // Projects are only the folders the user adds, so the next step asks for one.
    await page.getByRole("button", { name: "Continue" }).click();
    // Asked once, before the folders: the answer picks the Simple or the Developer view.
    await page.getByRole("heading", { name: "Do you write code?" }).waitFor();
    await page.getByRole("button", { name: /No, I don't/ }).click();
    await page.getByRole("heading", { name: "Where are your projects?" }).waitFor();
    // The seeded project is already added, so the last step opens. Codex is not on this PATH, so its
    // install button shows: it once needed a router the wizard did not have, and the window went white.
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    await page.getByRole("button", { name: /Install Codex/ }).waitFor();
    expect(errors).toEqual([]);
    await ctx.close();
    await settings({ onboarded: true, mode: "simple" });
  }, 30_000);

  test("the one box starts a chat in the picked project, and the chief's page lists it", async () => {
    const { page, ctx } = await open("light", "/");
    const box = page.getByRole("textbox", { name: "What do you want to do?" });
    await box.fill("Add a cart page to the shop");
    await page.getByRole("combobox", { name: "Where it goes" }).selectOption({ label: "demo-shop" });
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForURL(/\/c\/[^/?]+/);
    await page.goto(`${server.url}/chief`, { waitUntil: "networkidle" });
    await page.getByText("Add a cart page to the shop").first().waitFor();
    await ctx.close();
  }, 30_000);

  test("a problem report is prepared from the version and the log, and shown before anything is sent", async () => {
    const { page, ctx } = await open("light", "/");
    await page.getByRole("button", { name: "Helper", exact: true }).click();
    await page.getByRole("button", { name: "Report a problem" }).click();
    const report = page.getByRole("textbox", { name: "Report a problem" });
    await page.waitForFunction(
      () =>
        document.querySelector("dialog textarea")?.textContent?.includes("**System:** Igrek") ||
        (document.querySelector("dialog textarea") as HTMLTextAreaElement | null)?.value.includes("**System:** Igrek"),
    );
    expect(await report.inputValue()).toContain("**System:** Igrek");
    // Nothing goes anywhere by itself: the only way out is the link the user opens.
    const link = page.getByRole("link", { name: "Open on GitHub" });
    expect(await link.getAttribute("href")).toStartWith("https://github.com/Mohamedattiadev/igrek/issues/new?");
    await ctx.close();
  }, 30_000);

  test("the Simple view shows a project's overview, chats and files; the Developer view every tab", async () => {
    await settings({ mode: "simple" });
    const simple = await open("light", `/p/${project}`);
    const tabs = simple.page.locator("header nav button");
    await tabs.first().waitFor();
    const names = (await tabs.allInnerTexts()).map((x) => x.replace(/\d+/g, "").trim());
    expect(names).toEqual(["Overview", "Chats", "Files"]);
    await simple.ctx.close();
    await settings({ mode: "pro" });
    const pro = await open("light", `/p/${project}`);
    await pro.page.getByRole("button", { name: "Code", exact: true }).waitFor();
    await pro.ctx.close();
    await settings({ mode: "simple" });
  }, 30_000);

  for (const scheme of SCHEMES)
    test(`every page opens in the ${scheme} theme without errors`, async () => {
      const errors: string[] = [];
      for (const path of PAGES) {
        const opened = await open(scheme, path);
        await opened.page.locator("nav svg").first().waitFor();
        if (SHOTS)
          await opened.page.screenshot({ path: join(SHOTS, `${scheme}${path.replace(/\//g, "_") || "_"}.png`) });
        errors.push(...opened.errors);
        await opened.ctx.close();
      }
      expect(errors).toEqual([]);
    }, 120_000);

  for (const scheme of SCHEMES)
    test(`the logo reads on the ${scheme} sidebar`, async () => {
      const { page, ctx } = await open(scheme, "/");
      const colors = await page.evaluate(() => {
        const svg = document.querySelector("nav svg");
        const paths = [...(svg?.querySelectorAll("path") ?? [])].map((p) => getComputedStyle(p).stroke);
        return { paths, background: getComputedStyle(document.querySelector("nav") as Element).backgroundColor };
      });
      await ctx.close();
      expect(colors.paths).toHaveLength(2);
      // Both strokes stand out from the sidebar: 3:1 is the WCAG floor for graphics.
      for (const stroke of colors.paths) expect(contrast(stroke, colors.background)).toBeGreaterThan(3);
    }, 30_000);

  test("a folder Claude worked in but nobody added waits under found folders, one click from a project", async () => {
    const { page, ctx, errors } = await open("light", "/");
    await page.getByText("demo-shop", { exact: true }).filter({ visible: true }).first().waitFor();
    expect(await page.getByText("side-project", { exact: true }).filter({ visible: true }).count()).toBe(0);
    await page.getByRole("button", { name: /Found folders \(1\)/ }).click();
    await page.getByRole("button", { name: "Add" }).last().click();
    await page
      .getByRole("link", { name: /side-project/ })
      .first()
      .waitFor();
    await ctx.close();
    expect(errors).toEqual([]);
  }, 30_000);

  test("the projects page lists the seeded project", async () => {
    const { page, ctx } = await open("light", "/");
    await page.getByText("demo-shop", { exact: true }).filter({ visible: true }).first().waitFor();
    await ctx.close();
  }, 30_000);

  async function chat(body: Record<string, unknown>): Promise<string> {
    const res = await server.call("/api/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: project, ...body }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { id: string }).id;
  }

  test("typing @ in a chat lists experts, the keyboard picks one, Escape closes", async () => {
    const id = await chat({});
    const { page, ctx, errors } = await open("dark", `/c/${id}`);
    const box = page.locator("textarea").first();
    const list = page.getByRole("listbox", { name: "Experts to mention" });
    await box.click();
    await box.pressSequentially("ask @secu");
    await list.waitFor();
    expect(await list.getByRole("option").first().textContent()).toContain("@security");
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "chat-mention.png") });
    await box.press("Enter");
    expect(await box.inputValue()).toBe("ask @security ");
    expect(await list.count()).toBe(0);
    // An address is not a mention.
    await box.pressSequentially("mail me@exa");
    expect(await list.count()).toBe(0);
    await box.fill("");
    await box.pressSequentially("@");
    await list.waitFor();
    await box.press("ArrowDown");
    expect(await list.getByRole("option").nth(1).getAttribute("aria-selected")).toBe("true");
    await box.press("Escape");
    expect(await list.count()).toBe(0);
    expect(await box.inputValue()).toBe("@");
    await ctx.close();
    expect(errors).toEqual([]);
  }, 30_000);

  test("no @ list in a persona's own chat or with experts turned off", async () => {
    const asPersona = await chat({ personaId: "security" });
    let opened = await open("light", `/c/${asPersona}`);
    await opened.page.locator("textarea").first().pressSequentially("@");
    await Bun.sleep(300);
    expect(await opened.page.getByRole("listbox", { name: "Experts to mention" }).count()).toBe(0);
    await opened.ctx.close();

    await settings({ consultExperts: false });
    opened = await open("light", `/c/${await chat({})}`);
    await opened.page.locator("textarea").first().pressSequentially("@");
    await Bun.sleep(300);
    expect(await opened.page.getByRole("listbox", { name: "Experts to mention" }).count()).toBe(0);
    await opened.ctx.close();
    await settings({ consultExperts: true });
  }, 30_000);

  test("the helper's answer cards take you to the page they name", async () => {
    const { page, ctx, errors } = await open("light", "/inbox");
    // No model here: the helper's question fails at once, as it does offline, and the helper
    // answers from its own topic list.
    await ctx.route("**/api/help", (route) => route.fulfill({ status: 503, json: { error: "offline" } }));
    await page.getByRole("button", { name: "Helper" }).click();
    const box = page.getByRole("textbox", { name: "e.g. last chat in my blog project" });
    await box.fill("how do I talk to the expert team");
    await box.press("Enter");
    await page
      .getByRole("button", { name: /Expert team/ })
      .first()
      .click();
    await page.waitForURL((url) => url.pathname === "/personas");
    await ctx.close();
    // The only error allowed is the offline answer this test made up.
    expect(errors.filter((e) => !e.includes("503"))).toEqual([]);
  }, 30_000);

  test("a plugin page works without its own bridge file, also one written before the rename", async () => {
    // A page that never loads bridge.js and talks to the old name: Igrek's own bridge must carry it.
    const dir = join(server.home, "old-plugin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "godeye-plugin.json"),
      JSON.stringify({
        id: "old-plugin",
        name: "Old plugin",
        version: "1.0.0",
        permissions: ["projects:read"],
        panels: [{ id: "p", title: "Old plugin", entry: "page.html", place: "project" }],
      }),
    );
    writeFileSync(
      join(dir, "page.html"),
      '<html><head></head><body><p id="out">waiting</p><script>godeye.ask("projects").then((list) => { document.getElementById("out").textContent = "projects: " + list.length; });</script></body></html>',
    );
    const post = (path: string, body: object) =>
      server.call(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await post("/api/plugins", { source: dir })).status).toBe(200);
    await post("/api/plugins/old-plugin/enabled", { enabled: true });
    const { page, ctx, errors } = await open("light", `/p/${project}?tab=plugins`);
    const frame = page.frameLocator('iframe[title="Old plugin"]');
    await frame.getByText(/^projects: \d+$/).waitFor();
    await ctx.close();
    expect(errors).toEqual([]);
  }, 30_000);

  test("the helper button sits in the top bar on every page, a chat's too, over nothing", async () => {
    const opened = await open("light", `/c/${await chat({})}`);
    await opened.page.locator("textarea").first().waitFor();
    const helper = opened.page.getByRole("button", { name: "Helper" });
    expect(await helper.count()).toBe(1);
    // In the top bar (44 px high), not floating over the send box at the bottom.
    expect((await helper.boundingBox())?.y ?? 999).toBeLessThan(44);
    await opened.page.goto(`${server.url}/inbox`, { waitUntil: "networkidle" });
    expect(await opened.page.getByRole("button", { name: "Helper" }).count()).toBe(1);
    await opened.ctx.close();
  }, 30_000);

  test("two chats side by side, each with its own box; closing one side keeps the other", async () => {
    const left = await chat({});
    const { page, ctx, errors } = await open("light", `/c/${left}`);
    await page.getByRole("button", { name: "Full screen" }).waitFor();
    await page.getByRole("button", { name: "Open a chat beside this one" }).click();
    await page.getByRole("button", { name: "New chat in this project" }).click();
    await page.waitForURL(/\?with=/);
    // The second chat loads on its own; its box appears when it is ready.
    await page.locator("textarea").nth(1).waitFor();
    expect(await page.locator("textarea").count()).toBe(2);
    await page.locator("textarea").nth(1).fill("right side");
    expect(await page.locator("textarea").first().inputValue()).toBe("");
    await page.getByRole("button", { name: "Close this side (the chat stays open)" }).click();
    await page.waitForURL((url) => !url.search.includes("with="));
    await page.locator("textarea").nth(1).waitFor({ state: "detached" });
    expect(await page.locator("textarea").count()).toBe(1);
    await ctx.close();
    expect(errors).toEqual([]);
  }, 30_000);

  test("the Experts tab offers to ask them all and says what it costs before starting", async () => {
    const { page, ctx, errors } = await open("light", `/p/${project}?tab=experts`);
    await page.getByRole("button", { name: "Ask all experts" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Each look is one model call").waitFor();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // Nothing was started: no expert is reading the project.
    const state = (await (await server.call(`/api/projects/${project}/experts`)).json()) as { running: string[] };
    expect(state.running).toEqual([]);
    await ctx.close();
    expect(errors).toEqual([]);
  }, 30_000);
});
