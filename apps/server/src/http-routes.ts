import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HttpResponse } from "@igrek/core";
import type { Hono } from "hono";
import type { Store } from "./store";

const MAX_BODY = 200 * 1024;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Where this project's own API most likely listens, from its non-secret settings. */
function guessBaseUrl(root: string): string {
  for (const name of [".env.local", ".env", ".env.development"]) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    // Only these address-like keys are read; nothing else in the file is touched.
    const url = text.match(/^\s*(?:API_URL|BASE_URL|APP_URL|PUBLIC_URL)\s*=\s*["']?(https?:\/\/[^\s"']+)/m)?.[1];
    if (url) return url.replace(/\/+$/, "");
    const port = text.match(/^\s*PORT\s*=\s*["']?(\d{2,5})/m)?.[1];
    if (port) return `http://localhost:${port}`;
  }
  return "http://localhost:3000";
}

/**
 * The built-in API tester (plan.md 5.5). Requests go through this local
 * server so browser CORS rules don't get in the way; only the signed-in
 * user of this computer can use it.
 */
export function registerHttpRoutes(app: Hono, store: Store): void {
  app.get("/api/projects/:id/http-base", (c) => {
    const project = store.projectRow(c.req.param("id"));
    return c.json({
      base: project && !project.path.startsWith("team:") ? guessBaseUrl(project.path) : "http://localhost:3000",
    });
  });

  app.post("/api/http", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      method?: string;
      url?: string;
      headers?: Record<string, string>;
      body?: string;
    };
    const method = METHODS.find((m) => m === body.method?.toUpperCase());
    let url: URL;
    try {
      url = new URL(String(body.url ?? ""));
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      return c.json({ error: "Enter a full http(s) address" }, 400);
    }
    if (!method) return c.json({ error: "Unknown method" }, 400);
    const headers = Object.fromEntries(
      Object.entries(body.headers ?? {}).filter(([k, v]) => typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(k)),
    );
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : body.body,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const buffer = new Uint8Array(await res.arrayBuffer());
      const text = new TextDecoder().decode(buffer.slice(0, MAX_BODY));
      const result: HttpResponse = {
        status: res.status,
        statusText: res.statusText,
        ms: Math.round(performance.now() - started),
        headers: Object.fromEntries(res.headers.entries()),
        body: text,
        size: buffer.length,
        truncated: buffer.length > MAX_BODY,
      };
      return c.json(result);
    } catch (err) {
      const message = (err as Error).name === "TimeoutError" ? "No answer within 30 seconds" : (err as Error).message;
      return c.json({ error: message, ms: Math.round(performance.now() - started) }, 502);
    }
  });
}
