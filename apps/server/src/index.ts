import { APP_VERSION, type ClientMessage, type ServerMessage } from "@godeye/core";
import type { ServerWebSocket } from "bun";
import { parse } from "hono/utils/cookie";
import { createApp } from "./app";
import { Bus, StopRegistry } from "./bus";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { hasValidSession, isAllowedHost, isAllowedOrigin, loadSessionToken, SESSION_COOKIE } from "./security";

// Everything God Eye writes (database, keys) is readable only by you.
process.umask(0o077);

const config = loadConfig();
const { db } = openDb(config.dataDir);
const token = loadSessionToken(config.dataDir);
const bus = new Bus();
const stops = new StopRegistry();
const app = createApp({ config, db, token, bus, stops, startedAt: Date.now() });

type SocketData = { unsubscribe?: () => void };

function cookieFrom(req: Request): string | undefined {
  // Same parser Hono's getCookie uses, so WebSocket and HTTP auth agree.
  return parse(req.headers.get("cookie") ?? "", SESSION_COOKIE)[SESSION_COOKIE];
}

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  fetch(req, srv) {
    if (new URL(req.url).pathname === "/ws") {
      const ok =
        isAllowedHost(config, req.headers.get("host")) &&
        isAllowedOrigin(config, req.headers.get("origin")) &&
        hasValidSession(cookieFrom(req), token);
      if (!ok) return new Response("Forbidden", { status: 403 });
      return srv.upgrade(req, { data: {} }) ? undefined : new Response("Upgrade failed", { status: 400 });
    }
    return app.fetch(req, srv);
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      const send = (message: ServerMessage) => ws.send(JSON.stringify(message));
      send({ type: "hello", version: APP_VERSION });
      ws.data.unsubscribe = bus.subscribe(send);
    },
    message(ws, raw) {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (message.type === "ping") ws.send(JSON.stringify({ type: "pong", at: message.at } satisfies ServerMessage));
    },
    close(ws) {
      ws.data.unsubscribe?.();
    },
  },
});

console.log(`👁️  God Eye ${APP_VERSION} → http://localhost:${server.port}  (data: ${config.dataDir})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await stops.stopAll();
    server.stop();
    process.exit(0);
  });
}
