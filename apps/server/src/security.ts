import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Config } from "./config";

export const SESSION_COOKIE = "igrek_session";
/** The cookie name before the rename; git hooks installed back then still send it. */
export const OLD_SESSION_COOKIE = "godeye_session";

/** Loads the per-install session secret, creating it (mode 600) on first run. */
export function loadSessionToken(dataDir: string): string {
  const file = join(dataDir, "session.key");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, token, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hasValidSession(cookieValue: string | undefined, token: string): boolean {
  return cookieValue !== undefined && safeEqual(cookieValue, token);
}

export function isAllowedHost(config: Config, host: string | null | undefined): boolean {
  return !!host && config.allowedHosts.has(host);
}

/** A missing Origin is fine (curl, same-origin GET); a foreign one never is. */
export function isAllowedOrigin(config: Config, origin: string | null | undefined): boolean {
  return !origin || config.allowedOrigins.has(origin);
}

const PUBLIC_API = new Set(["/api/health", "/api/session"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Every request must use an allowed Host (blocks DNS rebinding) and Origin (blocks
 * other websites). API calls also need the session cookie, which is only handed out
 * to same-origin page loads and is HttpOnly + SameSite=Strict.
 */
/** A browser extension's own origin (Chrome, Brave, Edge; Firefox). */
const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\/[a-z0-9-]{8,64}$/i;

/** The extension's routes: its origin and pairing key checked, and the answer readable by the extension (CORS). */
async function extensionGate(
  c: Parameters<MiddlewareHandler>[0],
  next: Parameters<MiddlewareHandler>[1],
  extensionKey: ((key: string | undefined) => boolean) | undefined,
  needsKey = true,
): Promise<Response | undefined> {
  const origin = c.req.header("origin") ?? "";
  if (!extensionKey || !EXTENSION_ORIGIN.test(origin)) return c.text("Forbidden origin", 403);
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, x-igrek-ext-key",
    "access-control-allow-methods": "GET, POST",
    vary: "origin",
  };
  if (c.req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (needsKey && !extensionKey(c.req.header("x-igrek-ext-key")))
    return new Response(JSON.stringify({ error: "Not paired" }), {
      status: 401,
      headers: { ...cors, "content-type": "application/json" },
    });
  await next();
  for (const [k, v] of Object.entries(cors)) c.res.headers.set(k, v);
  return undefined;
}

/**
 * The browser extension's ways in, from an extension's origin only: /api/ext/ with its pairing key,
 * and /api/ext-pair without one yet (to ask; the user allows it in Igrek). Undefined: not the extension's.
 */
function extensionPath(path: string): boolean | undefined {
  if (path.startsWith("/api/ext/")) return true;
  if (path.startsWith("/api/ext-pair")) return false;
  return undefined;
}

export function securityMiddleware(
  config: Config,
  token: string,
  /** Whether a browser extension's pairing key is one of the user's (extension-routes.ts). */
  extensionKey?: (key: string | undefined) => boolean,
): MiddlewareHandler {
  return async (c, next) => {
    if (!isAllowedHost(config, c.req.header("host"))) {
      return c.text("Forbidden host", 403);
    }
    const path = c.req.path;
    // Your apps send their errors here from their own origin; the key in the path allows only that.
    if (path.startsWith("/ingest/")) return next();
    const needsKey = extensionPath(path);
    if (needsKey !== undefined) return extensionGate(c, next, extensionKey, needsKey);
    if (!isAllowedOrigin(config, c.req.header("origin"))) {
      return c.text("Forbidden origin", 403);
    }
    const isApi = path.startsWith("/api/");

    if (!isApi || path === "/api/session") {
      // Page loads and the bootstrap endpoint receive the session cookie.
      if (SAFE_METHODS.has(c.req.method)) {
        setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: "Strict", path: "/" });
      }
      return next();
    }
    if (PUBLIC_API.has(path)) return next();
    if (!hasValidSession(getCookie(c, SESSION_COOKIE) ?? getCookie(c, OLD_SESSION_COOKIE), token)) {
      return c.json({ error: "Not signed in" }, 401);
    }
    return next();
  };
}
