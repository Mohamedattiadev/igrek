import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app";
import { Bus, StopRegistry } from "./bus";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { ExtensionPairing, registerPairRoutes } from "./extension-pair";
import { ExtensionKeys, matchFields, registerExtensionRoutes } from "./extension-routes";
import { PrivateValues } from "./private-values";
import { Sealer } from "./seal";
import { loadSessionToken } from "./security";

const EXT = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "igrek-ext-"));
  const config = loadConfig({ IGREK_HOME: dataDir, IGREK_PORT: "7777", IGREK_WEB_DIST: join(dataDir, "none") });
  const { db, sqlite } = openDb(":memory:");
  const keys = new ExtensionKeys(sqlite);
  const values = new PrivateValues(sqlite, new Sealer(dataDir));
  await values.ready;
  await values.save({ name: "tc_kimlik", label: "T.C. kimlik", kind: "identity", value: "10000000146" });
  await values.save({ name: "iban", label: "IBAN", kind: "finance", value: "TR330006100519786457841326" });
  const prompts: string[] = [];
  const app = createApp({
    config,
    db,
    token: loadSessionToken(dataDir),
    bus: new Bus(),
    stops: new StopRegistry(),
    startedAt: Date.now(),
    extensionKey: (key) => keys.valid(key),
    extraRoutes: (hono) => {
      registerPairRoutes(hono, new ExtensionPairing(keys));
      registerExtensionRoutes(hono, {
        keys,
        values,
        write: async (prompt) => {
          prompts.push(prompt);
          return "My identity number is [[private:tc_kimlik]].";
        },
      });
    },
  });
  const call = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(`http://localhost:7777${path}`, { ...init, headers: { host: "localhost:7777", ...init.headers } });
  return { call, keys, prompts };
}

describe("the browser extension", () => {
  test("form fields find the private detail they ask for, by the words forms use", () => {
    const known = [
      { name: "tc_kimlik", label: "T.C. kimlik", kind: "identity" as const, createdAt: 0 },
      { name: "iban", label: "IBAN", kind: "finance" as const, createdAt: 0 },
      { name: "ogrenci_no", label: "Öğrenci numarası", kind: "student" as const, createdAt: 0 },
    ];
    expect(
      matchFields(
        [
          { id: "1", text: "TC Kimlik No tckn" },
          { id: "2", text: "IBAN numaranız" },
          { id: "3", text: "Öğrenci No" },
          { id: "4", text: "Adınız" },
        ],
        known,
      ),
    ).toEqual([
      { id: "1", name: "tc_kimlik" },
      { id: "2", name: "iban" },
      { id: "3", name: "ogrenci_no" },
    ]);
  });

  test("only an extension's origin with a paired key gets in, and only to /api/ext/", async () => {
    const { call, keys } = await setup();
    const key = keys.pair();
    expect((await call("/api/ext/hello", { headers: { origin: EXT } })).status).toBe(401);
    expect(
      (await call("/api/ext/hello", { headers: { origin: "https://evil.example", "x-igrek-ext-key": key } })).status,
    ).toBe(403);
    const ok = await call("/api/ext/hello", { headers: { origin: EXT, "x-igrek-ext-key": key } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(EXT);
    expect(JSON.stringify(await ok.json())).not.toContain("10000000146");
    // The key opens nothing else.
    expect((await call("/api/private", { headers: { origin: EXT, "x-igrek-ext-key": key } })).status).toBe(403);
    keys.forgetAll();
    expect((await call("/api/ext/hello", { headers: { origin: EXT, "x-igrek-ext-key": key } })).status).toBe(401);
  });

  test("pairing is asked from an extension only, and the key comes after the user allows it in Igrek", async () => {
    const { call } = await setup();
    expect((await call("/api/ext-pair", { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(
      403,
    );
    const asked = (await (await call("/api/ext-pair", { method: "POST", headers: { origin: EXT } })).json()) as {
      id: string;
      code: string;
    };
    expect(asked.code).toMatch(/^\d{6}$/);
    const poll = async () => (await call(`/api/ext-pair/${asked.id}`, { headers: { origin: EXT } })).json();
    expect(await poll()).toEqual({ status: "waiting" });
    // The extension cannot allow itself: that route is Igrek's own.
    expect(
      (await call(`/api/extension/requests/${asked.id}`, { method: "POST", headers: { origin: EXT }, body: "{}" }))
        .status,
    ).toBe(403);
  });

  test("a field's text is written from placeholders: the model never sees the value, the page gets it", async () => {
    const { call, keys, prompts } = await setup();
    const key = keys.pair();
    const res = await call("/api/ext/write", {
      method: "POST",
      headers: { origin: EXT, "x-igrek-ext-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        instruction: "Introduce me; my id is 10000000146",
        question: "Tell us about yourself",
        page: { title: "Burs başvurusu", url: "https://example.org/apply", text: "IBAN: TR330006100519786457841326" },
      }),
    });
    const body = (await res.json()) as { draft: string; text: string };
    expect(body.text).toBe("My identity number is 10000000146.");
    expect(prompts[0]).toContain("[[private:tc_kimlik]]");
    expect(prompts[0]).not.toContain("10000000146");
    expect(prompts[0]).not.toContain("TR330006100519786457841326");
  });
});
