import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Settings } from "@igrek/core";
import { createApp } from "./app";
import { Bus, StopRegistry } from "./bus";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { loadSessionToken, OLD_SESSION_COOKIE, SESSION_COOKIE } from "./security";

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "igrek-test-"));
  const config = loadConfig({ IGREK_HOME: dataDir, IGREK_PORT: "7777", IGREK_WEB_DIST: join(dataDir, "none") });
  const { db } = openDb(":memory:");
  const token = loadSessionToken(dataDir);
  const bus = new Bus();
  const stops = new StopRegistry();
  const app = createApp({ config, db, token, bus, stops, startedAt: Date.now() });
  const call = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(`http://localhost:7777${path}`, {
      ...init,
      headers: { host: "localhost:7777", ...init.headers },
    });
  const authed = { cookie: `${SESSION_COOKIE}=${token}` };
  return { call, authed, token, bus, stops, dataDir };
}

describe("security", () => {
  test("rejects unknown Host headers (DNS rebinding)", async () => {
    const { call } = setup();
    const res = await call("/api/health", { headers: { host: "evil.example:7777" } });
    expect(res.status).toBe(403);
  });

  test("an agent may read and propose, but not approve or change anything", async () => {
    const { call, authed } = setup();
    const agent = { ...authed, "x-igrek-caller": "agent", "content-type": "application/json" };
    expect((await call("/api/settings", { headers: agent })).status).toBe(200);
    const write = await call("/api/settings", {
      method: "PATCH",
      headers: agent,
      body: JSON.stringify({ language: "tr" }),
    });
    expect(write.status).toBe(403);
    expect((await call("/api/schedules/x/activate", { method: "POST", headers: agent })).status).toBe(403);
    expect((await call("/api/schedules/propose", { method: "POST", headers: agent, body: "{}" })).status).not.toBe(403);
    expect((await call("/api/agent/servers/run", { method: "POST", headers: agent, body: "{}" })).status).not.toBe(403);
  });

  test("rejects requests from other websites", async () => {
    const { call, authed } = setup();
    const res = await call("/api/settings", { headers: { ...authed, origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("API requires the session cookie", async () => {
    const { call } = setup();
    expect((await call("/api/settings")).status).toBe(401);
  });

  test("the cookie and agent header from before the rename still count", async () => {
    const { call, token } = setup();
    const legacy = { cookie: `${OLD_SESSION_COOKIE}=${token}` };
    expect((await call("/api/settings", { headers: legacy })).status).toBe(200);
    const agent = { ...legacy, "x-godeye-caller": "agent", "content-type": "application/json" };
    const write = await call("/api/settings", { method: "PATCH", headers: agent, body: "{}" });
    expect(write.status).toBe(403);
  });

  test("bootstrap endpoint hands out an HttpOnly, SameSite=Strict cookie", async () => {
    const { call, token } = setup();
    const res = await call("/api/session");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  test("health is public", async () => {
    const { call } = setup();
    expect((await call("/api/health")).status).toBe(200);
  });

  test("session key file is private to the user", async () => {
    const { dataDir } = setup();
    const mode = (await Bun.file(join(dataDir, "session.key")).stat()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("settings", () => {
  test("returns defaults, then persists a valid patch", async () => {
    const { call, authed } = setup();
    const initial = (await (await call("/api/settings", { headers: authed })).json()) as Settings;
    expect(initial.language).toBe("en");

    const res = await call("/api/settings", {
      method: "PATCH",
      headers: { ...authed, "content-type": "application/json", origin: "http://localhost:7777" },
      body: JSON.stringify({ language: "tr", keymap: "vim", density: "compact" }),
    });
    expect(res.status).toBe(200);
    const saved = (await (await call("/api/settings", { headers: authed })).json()) as Settings;
    expect(saved).toMatchObject({ language: "tr", keymap: "vim", density: "compact" });
  });

  test("rejects invalid values", async () => {
    const { call, authed } = setup();
    const res = await call("/api/settings", {
      method: "PATCH",
      headers: { ...authed, "content-type": "application/json" },
      body: JSON.stringify({ theme: "rainbow" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("emergency stop", () => {
  test("stops everything registered and tells every client", async () => {
    const { call, authed, stops, bus } = setup();
    let stopped = 0;
    stops.register("a", { label: "agent", stop: () => void stopped++ });
    stops.register("b", { label: "job", stop: () => void stopped++ });
    const messages: string[] = [];
    bus.subscribe((m) => messages.push(m.type));

    const res = await call("/api/emergency-stop", { method: "POST", headers: authed });
    expect(await res.json()).toMatchObject({ stopped: 2 });
    expect(stopped).toBe(2);
    expect(messages).toContain("emergency-stop");
  });
});

describe("serving the web build", () => {
  test("text files go out compressed and immutable; an unchanged page costs a 304", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const dataDir = mkdtempSync(join(tmpdir(), "igrek-web-"));
    const dist = join(dataDir, "dist");
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), `<!doctype html><title>x</title>${" ".repeat(2000)}`);
    writeFileSync(join(dist, "assets/app-BkX9_2Qa.js"), `console.log(${JSON.stringify("x".repeat(5000))});`);
    const config = loadConfig({ IGREK_HOME: dataDir, IGREK_PORT: "7777", IGREK_WEB_DIST: dist });
    const { db } = openDb(":memory:");
    const app = createApp({
      config,
      db,
      token: loadSessionToken(dataDir),
      bus: new Bus(),
      stops: new StopRegistry(),
      startedAt: Date.now(),
    });
    const get = (path: string, headers: Record<string, string> = {}) =>
      app.request(`http://localhost:7777${path}`, { headers: { host: "localhost:7777", ...headers } });
    const js = await get("/assets/app-BkX9_2Qa.js", { "accept-encoding": "gzip, br" });
    expect(js.headers.get("content-encoding")).toBe("br");
    expect(js.headers.get("cache-control")).toContain("immutable");
    expect(js.headers.get("vary")).toBe("accept-encoding");
    const plain = await get("/assets/app-BkX9_2Qa.js");
    expect(plain.headers.get("content-encoding")).toBeNull();
    expect((await plain.text()).length).toBeGreaterThan(5000);
    const page = await get("/some/route", { "accept-encoding": "gzip" });
    expect(page.headers.get("content-encoding")).toBe("gzip");
    expect(page.headers.get("content-type")).toContain("text/html");
    const again = await get("/", { "if-none-match": page.headers.get("etag") ?? "" });
    expect(again.status).toBe(304);
  });
});
