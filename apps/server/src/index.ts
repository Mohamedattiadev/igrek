import { join } from "node:path";
import { APP_VERSION, type ClientMessage, type ServerMessage } from "@godeye/core";
import type { ServerWebSocket } from "bun";
import { parse } from "hono/utils/cookie";
import { createApp } from "./app";
import { Assist } from "./assist";
import { registerAssistRoutes } from "./assist-routes";
import { Bus, StopRegistry } from "./bus";
import { handleChatMessage, registerChatRoutes } from "./chat-routes";
import { Chats } from "./chats";
import { createCheckpoint } from "./checkpoints";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { registerFileRoutes } from "./file-routes";
import { Files } from "./files";
import { writeHookScript } from "./hooks";
import { Indexer } from "./indexer";
import { Jobs } from "./jobs";
import { hasValidSession, isAllowedHost, isAllowedOrigin, loadSessionToken, SESSION_COOKIE } from "./security";
import { registerServerRoutes } from "./server-routes";
import { Servers } from "./servers";
import { readSettings } from "./settings";
import { Store } from "./store";
import { Summarizer } from "./summarizer";
import { registerTerminalRoutes } from "./terminal-routes";
import { Terminals } from "./terminals";

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
const jobs = new Jobs(store, bus, summarizer, () => readSettings(db));
const terminals = new Terminals(bus, stops);
const servers = new Servers(sqlite, bus, stops);
const chats = new Chats(bus, stops, undefined, (cwd, label) => createCheckpoint(cwd, label)?.id);
const assist = new Assist(sqlite, store, stops, () => readSettings(db), join(config.dataDir, "runner"));
const files = new Files(
  () => [...store.allProjectRows().map((p) => p.path), ...readSettings(db).allowedFolders],
  join(config.dataDir, "trash"),
);
const app = createApp({
  config,
  db,
  token,
  bus,
  stops,
  startedAt: Date.now(),
  extraRoutes: (hono) => {
    registerTerminalRoutes(hono, { store, terminals, language: () => readSettings(db).language, servers });
    registerServerRoutes(hono, servers);
    registerChatRoutes(hono, { chats, store });
    registerFileRoutes(hono, { files, store });
    registerAssistRoutes(hono, assist);
  },
  work: {
    store,
    indexer,
    summarizer,
    hookScript,
    publicPort: config.publicPort,
    dataDir: config.dataDir,
    syncCommits: () => jobs.syncCommits(),
  },
});
indexer.start();
summarizer.start();
jobs.start();
// Light health probe of saved servers every 5 minutes (read-only, nothing installed there).
setTimeout(() => void servers.checkAll(), 15_000);
setInterval(() => void servers.checkAll(), 5 * 60_000);

type SocketData = { unsubscribe?: () => void; terminal?: string; chat?: string };

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
    const path = new URL(req.url).pathname;
    if (path === "/ws" || path.startsWith("/ws/term/") || path.startsWith("/ws/chat/")) {
      const ok =
        isAllowedHost(config, req.headers.get("host")) &&
        isAllowedOrigin(config, req.headers.get("origin")) &&
        hasValidSession(cookieFrom(req), token);
      if (!ok) return new Response("Forbidden", { status: 403 });
      const terminal = path.startsWith("/ws/term/") ? path.slice("/ws/term/".length) : undefined;
      if (terminal && !terminals.get(terminal)) return new Response("No such terminal", { status: 404 });
      const chat = path.startsWith("/ws/chat/") ? path.slice("/ws/chat/".length) : undefined;
      if (chat && !chats.get(chat)) return new Response("No such chat", { status: 404 });
      return srv.upgrade(req, { data: { terminal, chat } })
        ? undefined
        : new Response("Upgrade failed", { status: 400 });
    }
    return app.fetch(req, srv);
  },
  websocket: {
    open(ws: ServerWebSocket<SocketData>) {
      if (ws.data.chat) {
        const attached = chats.attach(ws.data.chat, (op) => ws.send(JSON.stringify(op)));
        if (attached) {
          ws.send(JSON.stringify({ op: "init", info: attached.info, events: attached.events }));
          ws.data.unsubscribe = attached.detach;
        }
        return;
      }
      if (ws.data.terminal) {
        // Terminal sockets carry raw output to the browser and keystrokes back.
        ws.data.unsubscribe = terminals.attach(ws.data.terminal, (data) => ws.send(data));
        return;
      }
      const send = (message: ServerMessage) => ws.send(JSON.stringify(message));
      send({ type: "hello", version: APP_VERSION });
      ws.data.unsubscribe = bus.subscribe(send);
    },
    message(ws, raw) {
      if (ws.data.chat) {
        const error = handleChatMessage(chats, ws.data.chat, String(raw));
        if (error) ws.send(JSON.stringify({ op: "error", error }));
        return;
      }
      if (ws.data.terminal) {
        try {
          const msg = JSON.parse(String(raw)) as { t: "i"; d: string } | { t: "r"; c: number; r: number };
          if (msg.t === "i" && typeof msg.d === "string") terminals.input(ws.data.terminal, msg.d);
          else if (msg.t === "r") terminals.resize(ws.data.terminal, Number(msg.c), Number(msg.r));
        } catch {
          // Ignore malformed frames.
        }
        return;
      }
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
    jobs.stop();
    terminals.stopAll();
    chats.stopAll();
    await stops.stopAll();
    server.stop();
    process.exit(0);
  });
}
