import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { APP_VERSION, type SystemStatus } from "@igrek/core";
import { languages } from "@igrek/i18n";
import { Hono } from "hono";
import type { Bus, StopRegistry } from "./bus";
import type { Config } from "./config";
import type { Db } from "./db";
import { registerWorkRoutes, type WorkDeps } from "./routes";
import { securityMiddleware } from "./security";
import { readSettings, validatePatch, writeSettings } from "./settings";
import { checkTools } from "./system";

export interface AppDeps {
  config: Config;
  db: Db;
  token: string;
  bus: Bus;
  stops: StopRegistry;
  startedAt: number;
  /** Projects, sessions and memory; left out in tests that only cover the shell. */
  work?: WorkDeps;
  /** More API routes registered before the 404 fallback. */
  extraRoutes?: (app: Hono) => void;
}

/**
 * The only writes an agent may make, both waiting for the user: a schedule proposal, and a server
 * command (read-only ones run at once, anything that changes something waits for approval).
 */
const AGENT_WRITES = new Set([
  "/api/schedules/propose",
  "/api/agent/servers/run",
  // A secret the user types in God Eye (the agent never sees it), and a page to show.
  "/api/agent/secrets",
  "/api/agent/reports",
  // A form the user fills in God Eye; the agent gets the answers.
  "/api/agent/forms",
]);

/** Text files worth compressing; images and fonts are compressed already. */
const COMPRESSIBLE = /\.(js|mjs|css|html|json|svg|map|txt)$/;
const packed = new Map<string, { mtime: number; br: Uint8Array<ArrayBuffer>; gz: Uint8Array<ArrayBuffer> }>();

/**
 * A file of the web build, compressed with brotli or gzip when the browser takes it (once per
 * file version, kept in memory: the build is a few MB). Files that may change get an ETag so an
 * unchanged one costs a 304 instead of the whole file.
 */
function serveBuilt(
  file: string,
  acceptEncoding: string,
  ifNoneMatch: string | undefined,
  headers: Record<string, string>,
) {
  const stat = statSync(file);
  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  if (ifNoneMatch === etag) return new Response(null, { status: 304, headers: { etag, ...headers } });
  const type = Bun.file(file).type;
  const base = { "content-type": type, etag, vary: "accept-encoding", ...headers };
  const wantsBr = /\bbr\b/.test(acceptEncoding);
  const wantsGz = /\bgzip\b/.test(acceptEncoding);
  if (!COMPRESSIBLE.test(file) || stat.size < 1024 || (!wantsBr && !wantsGz))
    return new Response(Bun.file(file), { headers: base });
  let entry = packed.get(file);
  if (!entry || entry.mtime !== stat.mtimeMs) {
    const bytes = readFileSync(file);
    entry = {
      mtime: stat.mtimeMs,
      br: new Uint8Array(brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } })),
      gz: new Uint8Array(Bun.gzipSync(bytes)),
    };
    packed.set(file, entry);
  }
  return new Response(wantsBr ? entry.br : entry.gz, {
    headers: { ...base, "content-encoding": wantsBr ? "br" : "gzip" },
  });
}

export function createApp({ config, db, token, bus, stops, startedAt, work, extraRoutes }: AppDeps) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
  });
  app.use("*", securityMiddleware(config, token));
  // What an AI agent may change through God Eye's own channels: it proposes, the user approves
  // (plan.md 16.4). Requests from God Eye's MCP server say they come from an agent.
  app.use("/api/*", async (c, next) => {
    if (c.req.header("x-godeye-caller") === "agent" && c.req.method !== "GET" && !AGENT_WRITES.has(c.req.path))
      return c.json({ error: "Agents may propose, not approve or change this" }, 403);
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, version: APP_VERSION }));
  app.get("/api/session", (c) => c.json({ ok: true }));

  app.get("/api/settings", (c) => c.json(readSettings(db)));
  app.patch("/api/settings", async (c) => {
    const result = validatePatch(await c.req.json().catch(() => null));
    if ("error" in result) return c.json({ error: result.error }, 400);
    const settings = writeSettings(db, result.patch);
    bus.publish({ type: "settings", settings });
    return c.json(settings);
  });

  app.get("/api/languages", (c) => c.json(languages));

  app.get("/api/system", async (c) => {
    const status: SystemStatus = {
      version: APP_VERSION,
      dataDir: config.dataDir,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      tools: await checkTools(),
    };
    return c.json(status);
  });

  app.post("/api/emergency-stop", async (c) => {
    const stopped = await stops.stopAll();
    const stoppedAt = new Date().toISOString();
    bus.publish({ type: "emergency-stop", stoppedAt, stopped });
    return c.json({ stopped, stoppedAt });
  });

  if (work) registerWorkRoutes(app, work);
  extraRoutes?.(app);

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // Built web UI; every unknown path falls back to index.html for client-side routing.
  if (existsSync(config.webDist)) {
    const root = normalize(config.webDist) + sep;
    const indexHtml = join(root, "index.html");
    const isFile = (path: string) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    };
    app.get("*", (c) => {
      let candidate: string;
      try {
        candidate = normalize(join(root, decodeURIComponent(c.req.path)));
      } catch {
        return c.text("Bad request", 400);
      }
      // Never serve anything outside the web build folder.
      const file = candidate.startsWith(root) && isFile(candidate) ? candidate : indexHtml;
      const immutable = file.startsWith(join(root, "assets") + sep);
      return serveBuilt(file, c.req.header("accept-encoding") ?? "", c.req.header("if-none-match"), {
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
        ...(file === indexHtml ? { "content-type": "text/html; charset=utf-8" } : {}),
      });
    });
  } else {
    app.get("*", (c) => c.text("God Eye API is running. Build the web UI with `bun run build`.", 200));
  }

  return app;
}
