import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_VERSION, type ClientMessage, citation, lessonLines, type ServerMessage } from "@godeye/core";
import type { ServerWebSocket } from "bun";
import { parse } from "hono/utils/cookie";
import { Accounts } from "./accounts";
import { registerAccountRoutes } from "./accounts-routes";
import { claudeAdapter } from "./adapters/claude";
import { codexAdapter } from "./adapters/codex";
import { geminiAdapter } from "./adapters/gemini";
import { createApp } from "./app";
import { Assist } from "./assist";
import { registerAssistRoutes } from "./assist-routes";
import { Board } from "./board";
import { Bus, StopRegistry } from "./bus";
import { handleChatMessage, registerChatRoutes } from "./chat-routes";
import { Chats } from "./chats";
import { createCheckpoint } from "./checkpoints";
import { loadConfig } from "./config";
import { CrossCheck } from "./crosscheck";
import { openDb } from "./db";
import { registerDeployRoutes } from "./deploy-routes";
import { Embedder } from "./embedder";
import { Enhancer } from "./enhance";
import { registerEnhanceRoutes } from "./enhance-routes";
import { registerEnvRoutes } from "./env-routes";
import { EnvFiles } from "./envfiles";
import { Environments } from "./environments";
import { syncExamples } from "./examples";
import { registerFileRoutes } from "./file-routes";
import { Files } from "./files";
import { registerFlowRoutes } from "./flow-routes";
import { Flows } from "./flows";
import { installHooks, writeHookScript } from "./hooks";
import { registerHttpRoutes } from "./http-routes";
import { registerI18nRoutes } from "./i18n-routes";
import { Indexer } from "./indexer";
import { Insight } from "./insight";
import { HistoryImport } from "./insight/history";
import { registerInsightRoutes } from "./insight-routes";
import { Jobs } from "./jobs";
import { Knowledge } from "./knowledge";
import { registerKnowledgeRoutes } from "./knowledge-routes";
import { LanguagePacks } from "./langpacks";
import { registerLessonRoutes } from "./lesson-routes";
import { Lessons } from "./lessons";
import { Library } from "./library";
import { registerLibraryRoutes } from "./library-routes";
import { Meetings } from "./meetings";
import { connectPersonaChats, registerPersonaRoutes } from "./persona-routes";
import { Personas } from "./personas";
import { registerScheduleRoutes } from "./schedule-routes";
import { Schedules } from "./schedules";
import { hasValidSession, isAllowedHost, isAllowedOrigin, loadSessionToken, SESSION_COOKIE } from "./security";
import { registerServerRoutes } from "./server-routes";
import { Servers } from "./servers";
import { readSettings } from "./settings";
import { Store } from "./store";
import { claudeAccount, runClaude, Summarizer } from "./summarizer";
import { Sync } from "./sync/client";
import { registerTeamRoutes } from "./team-routes";
import { registerTerminalRoutes } from "./terminal-routes";
import { Terminals } from "./terminals";
import { registerTesterRoutes } from "./tester-routes";
import { Testers } from "./testers";
import { Translator } from "./translator";

// Everything God Eye writes (database, keys) is readable only by you.
process.umask(0o077);

const config = loadConfig();
const { db, sqlite } = openDb(config.dataDir);
const token = loadSessionToken(config.dataDir);
const bus = new Bus();
const stops = new StopRegistry();
const store = new Store(sqlite);
const accounts = new Accounts(sqlite, bus, join(config.dataDir, "accounts"));
accounts.ensureDefault("claude");
accounts.ensureDefault("codex");
// Background AI calls run as the active Claude account; every limit report it sends is kept.
claudeAccount.env = (accountId) => {
  const account = (accountId && accounts.get(accountId)) || accounts.active("claude");
  return { env: accounts.env(account), accountId: account?.id };
};
claudeAccount.onRateLimit = (accountId, info) => {
  if (accountId) accounts.recordLimit(accountId, info);
};
// Watch every account's session folder, re-evaluated each scan so new accounts appear.
const indexer = new Indexer(store, bus, () => {
  const claudeDirs = accounts.claudeProjectDirs();
  const codex = accounts.list().filter((a) => a.provider === "codex");
  return [
    ...(claudeDirs.length ? claudeDirs.map(({ accountId, dir }) => claudeAdapter(dir, accountId)) : [claudeAdapter()]),
    ...(codex.length ? codex.map((a) => codexAdapter(join(a.configDir, "sessions"), a.id)) : [codexAdapter()]),
    geminiAdapter(undefined, () => store.allProjectRows().map((p) => p.path)),
  ];
});
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
// Projects that already have God Eye's hooks get the newer ones too (the prompt hook for lessons).
for (const project of store.allProjectRows())
  if (project.hooks_installed && existsSync(project.path))
    try {
      installHooks(project.path, hookScript);
    } catch {
      // unreadable settings file: left as it is
    }
const jobs = new Jobs(store, bus, summarizer, () => readSettings(db));
const terminals = new Terminals(bus, stops);
const servers = new Servers(sqlite, bus, stops);
const chats = new Chats(bus, stops, undefined, (cwd, label) => createCheckpoint(cwd, label)?.id);
chats.onRateLimit = (accountId, info) => {
  const id = accountId ?? accounts.active("claude")?.id;
  if (id) accounts.recordLimit(id, info);
};
const assist = new Assist(sqlite, store, stops, () => readSettings(db), join(config.dataDir, "runner"));
const files = new Files(
  () => [...store.allProjectRows().map((p) => p.path), ...readSettings(db).allowedFolders],
  join(config.dataDir, "trash"),
);
// Team hub: only active once the user connects from the Team page.
const sync = new Sync(sqlite, bus, join(config.dataDir, "sync.json"));
const translator = new Translator(sqlite, () => readSettings(db), join(config.dataDir, "runner"));
const languagePacks = new LanguagePacks(join(config.dataDir, "i18n"), bus, join(config.dataDir, "runner"));
const crossCheck = new CrossCheck(sqlite, bus, () => readSettings(db), join(config.dataDir, "runner"));
sync.onTeammateDecision = (projectId, itemId) => crossCheck.add(projectId, itemId);
const insight = new Insight(sqlite, store, bus, stops, () => readSettings(db), join(config.dataDir, "runner"));
insight.watch();
insight.onToolFailed = (projectId, result) =>
  lessons.toolFailed(projectId, result.kind, result.command, result.output, result.at);
const embedder = new Embedder(join(config.dataDir, "models", "multilingual-e5-small"), () =>
  bus.publish({ type: "library-changed" }),
);
const library = new Library(sqlite, bus, join(config.dataDir, "library"), embedder);
library.resume();
// Projects as examples for the personas: shortly after start, then once a day.
setTimeout(() => syncExamples(store, library), 90_000);
setInterval(() => syncExamples(store, library), 24 * 60 * 60_000);
const lessons = new Lessons(
  sqlite,
  store,
  bus,
  stops,
  () => readSettings(db),
  join(config.dataDir, "runner"),
  library,
  embedder,
);
/** Looks for new mistakes and writes them up (background AI must be on: it uses the small model). */
const scanLessons = async () => {
  lessons.scanSessions();
  lessons.scanCommits();
  return lessons.processCandidates(5);
};
setInterval(() => {
  if (readSettings(db).autoSummarize) void scanLessons().catch(() => undefined);
}, 10 * 60_000);
const personas = new Personas(
  sqlite,
  store,
  bus,
  stops,
  () => readSettings(db),
  join(config.dataDir, "runner"),
  (id, cats) => insight.categorySummary(id, cats),
);
const meetings = new Meetings(
  sqlite,
  personas,
  store,
  bus,
  stops,
  () => readSettings(db),
  join(config.dataDir, "runner"),
);
meetings.recover();
const testers = new Testers(
  sqlite,
  store,
  bus,
  stops,
  () => readSettings(db),
  join(config.dataDir, "testers"),
  join(config.dataDir, "runner"),
);
testers.recover();
personas.lessonsFor = (projectId) => {
  const top = lessons.forContext(projectId, 6);
  return top.length ? `Lessons learned in this project (avoid repeating these):\n${lessonLines(top)}` : undefined;
};
meetings.searchLibrary = async (question, personaId) =>
  (await library.search(question, { personaId, limit: 4, markUsed: true })).map((h) => ({
    citation: citation(h),
    text: h.text,
  }));
const personaChat = connectPersonaChats(
  chats,
  personas,
  (sessionId, personaId) => personas.linkSession(sessionId, personaId),
  {
    command: process.execPath,
    args: [join(import.meta.dir, "mcp.ts")],
    env: { GODEYE_PORT: String(config.publicPort), GODEYE_HOME: config.dataDir },
  },
);
const enhancer = new Enhancer(
  sqlite,
  store,
  stops,
  () => readSettings(db),
  join(config.dataDir, "runner"),
  (id) => sync.presenceList(id),
  (id) => terminals.recentErrors(id),
);
const flows = new Flows(sqlite, store, bus, stops, personas, join(config.dataDir, "worktrees"));
const board = new Board(sqlite, bus, flows);
flows.onChange = (run) => board.followRun(run);
flows.recover();
const schedules = new Schedules(
  sqlite,
  store,
  bus,
  flows,
  () => readSettings(db),
  (prompt) => runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku"),
);
// Scheduled work: checked every minute; times missed while the computer was off are asked about, not run.
setInterval(() => schedules.tick(), 60_000);
setTimeout(() => schedules.tick(), 20_000);
const knowledge = new Knowledge(
  sqlite,
  store,
  bus,
  personas,
  library,
  () => readSettings(db),
  (prompt, system) =>
    runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku", system ? ["--append-system-prompt", system] : []),
);
// The news of each persona's field, on the schedule chosen on the Knowledge page (checked hourly).
setTimeout(() => void knowledge.tick().catch(() => undefined), 5 * 60_000);
setInterval(() => void knowledge.tick().catch(() => undefined), 60 * 60_000);
insight.extraNotices = () => [
  ...sync.overlapNotices(),
  ...sync.mentionNotices(),
  ...knowledge.notices(),
  ...schedules.notices(),
  // A lesson that keeps coming back: make it a rule?
  ...lessons
    .list()
    .filter((l) => l.repeats >= 2 && l.status === "active")
    .slice(0, 10)
    .map((l) => ({
      id: `lesson:${l.id}:${l.repeats}`,
      kind: "lesson" as const,
      projectId: l.projectId ?? "",
      projectName: l.projectId ? (store.projectRow(l.projectId)?.name ?? "") : "",
      detail: l.title,
      at: l.lastSeen,
      link: "/lessons",
    })),
];
const app = createApp({
  config,
  db,
  token,
  bus,
  stops,
  startedAt: Date.now(),
  extraRoutes: (hono) => {
    registerTerminalRoutes(hono, { store, terminals, language: () => readSettings(db).language, servers, accounts });
    registerAccountRoutes(hono, { accounts, terminals, db: sqlite });
    registerServerRoutes(hono, servers);
    registerChatRoutes(hono, {
      chats,
      store,
      accounts,
      worktreeDir: join(config.dataDir, "worktrees"),
      persona: personaChat,
    });
    registerTesterRoutes(hono, testers);
    registerLibraryRoutes(hono, { library, embedder });
    registerKnowledgeRoutes(hono, knowledge);
    registerFlowRoutes(hono, { flows, board, store });
    registerScheduleRoutes(hono, { schedules, store });
    registerPersonaRoutes(hono, {
      personas,
      meetings,
      accounts,
      ideas: () => ({
        list: assist.listIdeas(),
        projects: new Map(store.listProjects().map((p) => [p.id, p.name])),
      }),
    });
    registerFileRoutes(hono, {
      files,
      store,
      db: sqlite,
      onRestore: (projectId, checkpointId, changed) =>
        lessons.checkpointRestored(projectId, checkpointId, "an AI turn", changed),
    });
    registerLessonRoutes(hono, { lessons, personas, store, scan: scanLessons });
    registerAssistRoutes(hono, assist);
    registerTeamRoutes(hono, sync, store, {
      language: () => readSettings(db).language,
      runnerDir: join(config.dataDir, "runner"),
      stops,
    });
    registerEnhanceRoutes(hono, enhancer);
    registerHttpRoutes(hono, store);
    registerI18nRoutes(hono, languagePacks, translator, () => readSettings(db).language);
    registerDeployRoutes(hono, {
      servers,
      envs: new Environments(
        sqlite,
        store,
        servers,
        bus,
        (id) => {
          const latest = insight.latest(id);
          return "apis" in latest && latest.apis ? latest.apis.env : [];
        },
        (id) => {
          const test = insight.toolResults(id).find((r) => r.kind === "test");
          return test ? { ok: test.ok, at: test.at } : undefined;
        },
      ),
    });
    registerInsightRoutes(hono, insight, new HistoryImport(sqlite, bus, summarizer, insight));
    registerEnvRoutes(hono, {
      env: new EnvFiles(join(config.dataDir, "env-backups")),
      store,
      insight,
      servers,
      db: sqlite,
      onChange: (projectId, change) => void sync.envChanged(projectId, change),
    });
  },
  work: {
    store,
    indexer,
    summarizer,
    hookScript,
    publicPort: config.publicPort,
    dataDir: config.dataDir,
    syncCommits: () => jobs.syncCommits(),
    lessonsAtStart: (projectId) => {
      const top = lessons.forContext(projectId, 6);
      return top.length ? `## Lessons learned (God Eye lessons book)\n${lessonLines(top)}` : undefined;
    },
    lessonsForPrompt: (prompt, projectId) => lessons.promptContext(prompt, projectId),
  },
});
indexer.start();
void sync.start();
summarizer.start();
jobs.start();
// Who is logged in where: at start and every 30 minutes.
void accounts.refreshAll();
setInterval(() => void accounts.refreshAll(), 30 * 60_000);
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

console.log(`God Eye ${APP_VERSION} → http://localhost:${server.port}  (data: ${config.dataDir})`);

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
