import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Settings } from "@godeye/core";
import { createApp } from "./app";
import { Bus, StopRegistry } from "./bus";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { loadSessionToken, SESSION_COOKIE } from "./security";

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "godeye-test-"));
  const config = loadConfig({ GODEYE_HOME: dataDir, GODEYE_PORT: "7777", GODEYE_WEB_DIST: join(dataDir, "none") });
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

  test("rejects requests from other websites", async () => {
    const { call, authed } = setup();
    const res = await call("/api/settings", { headers: { ...authed, origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("API requires the session cookie", async () => {
    const { call } = setup();
    expect((await call("/api/settings")).status).toBe(401);
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
