import { APP_VERSION, type ClientMessage, type ServerMessage } from "@godeye/core";
import type { ServerWebSocket } from "bun";
import { parse } from "hono/utils/cookie";
import { createApp } from "./app";
import { Bus, StopRegistry } from "./bus";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { writeHookScript } from "./hooks";
import { Indexer } from "./indexer";
import { hasValidSession, isAllowedHost, isAllowedOrigin, loadSessionToken, SESSION_COOKIE } from "./security";
import { readSettings } from "./settings";
import { Store } from "./store";
import { Summarizer } from "./summarizer";

// Everything God Eye writes (database, keys) is readable only by you.
process.umask(0o077);

const config = loadConfig();
const { db, sqlite } = openDb(config.dataDir);
const token = loadSessionToken(config.dataDir);
const bus = new Bus();
const stops = new StopRegistry();
const store = new Store(sqlite);
const indexer = new Indexer(store, bus);
const summarizer = new Summarizer(
  store,
  bus,
  stops,
  () => readSettings(db),
  config.dataDir,
  (summarizing, error) => {
    indexer.status.summarizing = summarizing;
    if (error) indexer.status.lastError = error;
    bus.publish({ type: "index", status: { ...indexer.status } });
  },
);
const hookScript = writeHookScript(config.dataDir, config.publicPort);
const app = createApp({
  config,
  db,
  token,
  bus,
  stops,
  startedAt: Date.now(),
  work: { store, indexer, summarizer, hookScript },
});
indexer.start();
summarizer.start();

type SocketData = { unsubscribe?: () => void };

function cookieFrom(req: Request): string | undefined {
  // Same parser Hono's getCookie uses, so WebSocket and HTTP auth agree.
  return parse(req.headers.get("cookie") ?? "", SESSION_COOKIE)[SESSION_COOKIE];
}

const server = Bun.serve<SocketData>({
  hostname: config.host,
  port: config.port,
  // Summaries wait on the model for a while; Bun's 10 s default would cut them off.
  idleTimeout: 180,
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
    indexer.stop();
    summarizer.stop();
    await stops.stopAll();
    server.stop();
    process.exit(0);
  });
}
