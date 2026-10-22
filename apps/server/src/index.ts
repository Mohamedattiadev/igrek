import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  APP_VERSION,
  type ClientMessage,
  citation,
  HELP_TOPICS,
  historyEvents,
  lessonLines,
  type ServerMessage,
} from "@igrek/core";
import { reportUiHint } from "@igrek/genui";
import { bundledResources } from "@igrek/i18n";
import type { ServerWebSocket } from "bun";
import { parse } from "hono/utils/cookie";
import { Accounts } from "./accounts";
import { registerAccountRoutes } from "./accounts-routes";
import { claudeAdapter } from "./adapters/claude";
import { codexAdapter } from "./adapters/codex";
import { geminiAdapter } from "./adapters/gemini";
import { opencodeAdapter } from "./adapters/opencode";
import { piAdapter } from "./adapters/pi";
import { AgentRequests, registerAgentRequestRoutes } from "./agent-requests";
import { AiComments } from "./aicomments";
import { Analytics } from "./analytics";
import { createApp } from "./app";
import { AppErrors } from "./apperrors";
import { Arena } from "./arena";
import { Assist } from "./assist";
import { registerAssistRoutes } from "./assist-routes";
import { Backups } from "./backup";
import { BackupJobs } from "./backup-jobs";
import { applyMovedIn, exportDataFolder, movedInWaiting, stageDataFolder } from "./backup-move";
import { Board } from "./board";
import { Bridges } from "./bridges";
import { Briefings } from "./briefing";
import { Bus, StopRegistry } from "./bus";
import { Calendar } from "./calendar";
import { handleChatMessage, registerChatRoutes } from "./chat-routes";
import { ChatStream } from "./chat-stream";
import { Chats } from "./chats";
import { createCheckpoint } from "./checkpoints";
import { Chief, registerChiefRoutes } from "./chief";
import { CodeHost } from "./codehost";
import { registerCommitHookRoutes } from "./commit-hook";
import { loadConfig } from "./config";
import { Costs } from "./costs";
import { CrossCheck } from "./crosscheck";
import { registerDataRoutes } from "./data-routes";
import { Databases } from "./databases";
import { openDb } from "./db";
import { createDemo } from "./demo";
import { registerDeployRoutes } from "./deploy-routes";
import { Docker } from "./docker";
import { Docs } from "./docs";
import { registerDocsRoutes } from "./docs-routes";
import { Embedder } from "./embedder";
import { Enhancer } from "./enhance";
import { registerEnhanceRoutes } from "./enhance-routes";
import { setAiGateway } from "./env";
import { registerEnvRoutes } from "./env-routes";
import { EnvFiles } from "./envfiles";
import { Environments } from "./environments";
import { syncExamples } from "./examples";
import { ExtensionKeys, registerExtensionRoutes } from "./extension-routes";
import { registerExtrasRoutes } from "./extras-routes";
import { FeedbackBox } from "./feedback";
import { registerFileRoutes } from "./file-routes";
import { Files } from "./files";
import { registerArenaRoutes, registerFlowRoutes, registerImportRoutes } from "./flow-routes";
import { Flows } from "./flows";
import { startGateway } from "./gateway";
import { installHooks, writeHookScript } from "./hooks";
import { registerHttpRoutes } from "./http-routes";
import { registerI18nRoutes } from "./i18n-routes";
import { Incidents } from "./incidents";
import { Indexer } from "./indexer";
import { Insight } from "./insight";
import { HistoryImport } from "./insight/history";
import { runChecks } from "./insight/tools";
import { registerInsightRoutes } from "./insight-routes";
import { Jobs } from "./jobs";
import { Knowledge } from "./knowledge";
import { registerKnowledgeRoutes } from "./knowledge-routes";
import { LanguagePacks } from "./langpacks";
import { Learn } from "./learn";
import { registerLearnRoutes } from "./learn-routes";
import { registerLessonRoutes } from "./lesson-routes";
import { Lessons } from "./lessons";
import { Library } from "./library";
import { registerLibraryRoutes } from "./library-routes";
import { ollamaModels } from "./localmodel";
import { Logs } from "./logs";
import { McpServers } from "./mcpservers";
import { Meetings } from "./meetings";
import { Monitors } from "./monitors";
import { relocateStoredPaths } from "./names";
import { HOST_PURPOSE, netLog, watchFetch } from "./netlog";
import {
  registerAnalyticsRoutes,
  registerBridgeRoutes,
  registerCalendarRoutes,
  registerCodeHostRoutes,
  registerCostRoutes,
  registerFeedbackRoutes,
  registerIncidentRoutes,
  registerMcpRoutes,
  registerOpsRoutes,
  registerPerfRoutes,
  registerPluginRoutes,
  registerProductRoutes,
  registerTimeRoutes,
  registerVaultRoutes,
  registerWriteupRoutes,
} from "./ops-routes";
import { Perf } from "./perf";
import { Experts, expertsHint } from "./persona-experts";
import { PersonaPacks } from "./persona-packs";
import { TurnReviews } from "./persona-review";
import { connectPersonaChats, registerExpertRoutes, registerPersonaRoutes } from "./persona-routes";
import { Personas, personaLabel } from "./personas";
import { Phone, registerPhoneRoutes } from "./phone";
import { Plugins } from "./plugins";
import { DevServers } from "./preview/devservers";
import { Services } from "./preview/services";
import { UiAudits } from "./preview/ui-audit";
import { registerPreviewRoutes } from "./preview-routes";
import { PrivateValues, registerPrivateRoutes } from "./private-values";
import { isoWeek, Product } from "./product";
import { registerReaRoutes } from "./rea";
import { Retention } from "./retention";
import { Routines } from "./routines";
import { registerScheduleRoutes } from "./schedule-routes";
import { Schedules } from "./schedules";
import { Sealer } from "./seal";
import {
  hasValidSession,
  isAllowedHost,
  isAllowedOrigin,
  loadSessionToken,
  OLD_SESSION_COOKIE,
  SESSION_COOKIE,
} from "./security";
import { registerServerRoutes } from "./server-routes";
import { Servers } from "./servers";
import { readSettings } from "./settings";
import { registerSkillRoutes, Skills } from "./skills";
import { registerSpeechRoutes, Speech } from "./speech";
import { Store } from "./store";
import { claudeAccount, localModel, runClaude, Summarizer } from "./summarizer";
import { Sync } from "./sync/client";
import { registerTeamRoutes } from "./team-routes";
import { registerTelegramRoutes, Telegram } from "./telegram";
import { registerTerminalRoutes } from "./terminal-routes";
import { Terminals } from "./terminals";
import { registerTesterRoutes } from "./tester-routes";
import { Testers } from "./testers";
import { Translator } from "./translator";
import { TurnGate } from "./turn-gate";
import { Updater } from "./update";
import { Vault } from "./vault";
import { registerWatcherRoutes } from "./watcher-routes";
import { DependencyWatcher, SecretScanner } from "./watchers";
import { Writeups } from "./writeups";

// A restart from inside Igrek waits here until the old process has let go of the port and the data.
const startDelay = Number(process.env.IGREK_START_DELAY_MS ?? 0);
if (startDelay > 0) await Bun.sleep(Math.min(startDelay, 10_000));
delete process.env.IGREK_START_DELAY_MS;

// Everything Igrek writes (database, keys) is readable only by you.
process.umask(0o077);

// Every address the server opens on the internet is listed in Settings (plan.md 13.6).
watchFetch();
const startedAt = Date.now();
const config = loadConfig();
// A data folder brought from another computer replaces this one before the database opens.
const movedIn = applyMovedIn(config.dataDir);
if (movedIn) console.log(`Igrek: moved-in data in place; the previous folder is kept at ${movedIn}`);
const { db, sqlite } = openDb(config.dataDir);
// Paths stored before the data folder moved (the rename to Igrek, or a manual move) point at it again.
const movedFrom = relocateStoredPaths(sqlite, config.dataDir);
if (movedFrom) console.log(`Data folder moved from ${movedFrom}: stored paths now point at ${config.dataDir}`);
const token = loadSessionToken(config.dataDir);
const bus = new Bus();
const stops = new StopRegistry();
const store = new Store(sqlite);
store.autoProjects = () => readSettings(db).autoProjects;
// Projects are only the folders the user adds: while that holds, a folder Igrek found on its own (one
// from before the setting too) waits under found folders, and never shows on the list unasked.
if (!readSettings(db).autoProjects) store.hideFound();
bus.subscribe((m) => {
  if (m.type !== "settings") return;
  if (m.settings.autoProjects) {
    if (store.showFound()) bus.publish({ type: "sessions-changed", projectIds: [], sessionIds: [] });
  } else store.hideFound();
});
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
    piAdapter(),
    opencodeAdapter(),
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
// Projects that already have Igrek's hooks get the newer ones too (the prompt hook for lessons).
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
const turnGate = new TurnGate(
  () => readSettings(db).turnGate,
  chats,
  (root) => runChecks(root, (stop) => stops.register(`gate-${root}`, { label: "checks", stop })),
);
chats.onStart = (cwd) => void turnGate.baseline(cwd).catch(() => undefined);
chats.onTurnEnd = (id, cwd, edited) => void turnGate.turnEnded(id, cwd, edited).catch(() => undefined);
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
const experts = new Experts(sqlite, personas, store, stops);
// Turns that touch auth, payment or database code get the matching expert's review (when turned on).
const reviews = new TurnReviews(
  () => readSettings(db).autoReview,
  chats,
  (projectId, personaId, question) => experts.ask(projectId, personaId, question),
);
const gateTurnEnd = chats.onTurnEnd;
chats.onTurnEnd = (id, cwd, edited) => {
  gateTurnEnd(id, cwd, edited);
  void reviews.turnEnded(id, edited).catch(() => undefined);
};
experts.onChange = (projectId) => bus.publish({ type: "experts-changed", projectId });
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
setInterval(() => testers.tick(), 60_000);
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
    env: { IGREK_PORT: String(config.publicPort), IGREK_HOME: config.dataDir },
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
  (id) => {
    const persona = personas.get(id);
    return persona && { name: personaLabel(persona).role, checklist: persona.profile.checklist };
  },
);
const flows = new Flows(sqlite, store, bus, stops, personas, join(config.dataDir, "worktrees"));
flows.marketDir = join(config.dataDir, "flows");
// "Raise to 100" measures the run's copy with the same checks as the Sections page.
flows.measure = (root, projectId, category) => insight.measure(root, projectId, category);
const board = new Board(sqlite, bus, flows);
const devServers = new DevServers(store, bus, stops, personas, join(config.dataDir, "preview"));
flows.recover();
// Team runs waiting for a full limit go on by themselves once it resets (plan.md 13.1).
setInterval(() => flows.resumeWaiting(), 60_000);
const schedules = new Schedules(
  sqlite,
  store,
  bus,
  flows,
  () => readSettings(db),
  (prompt) => runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku"),
);
const secretScanner = new SecretScanner(sqlite, store);
const depWatcher = new DependencyWatcher(sqlite, store);
// New commits are read for secrets every 10 minutes; dependencies are checked once a day.
setTimeout(() => secretScanner.scanAll(), 60_000);
setInterval(() => secretScanner.scanAll(), 10 * 60_000);
setTimeout(() => void depWatcher.daily(), 3 * 60_000);
setInterval(() => void depWatcher.daily(), 60 * 60_000);
const updater = new Updater();
// New versions of Igrek: checked shortly after start, then every 6 hours (git fetch with your own credentials).
setTimeout(() => updater.check(), 2 * 60_000);
setInterval(() => updater.check(), 6 * 60 * 60_000);
// Small jobs can use a local Ollama model: always, or only while Claude's limit is full (plan.md 13.1).
localModel.pick = (limited) => {
  const s = readSettings(db);
  if (s.localModel === "off" || !s.localModelName) return undefined;
  return s.localModel === "always" || limited ? { url: s.localModelUrl, model: s.localModelName } : undefined;
};
const writeups = new Writeups(sqlite, store, flows, (prompt) =>
  runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku"),
);
// The evening recap ("what did we do today") is written by itself after 21:00 when the day had work in it.
setInterval(() => {
  const now = new Date();
  if (now.getHours() < 21 || !readSettings(db).autoSummarize) return;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (writeups.cachedRecap(day) || !writeups.dayStats(day).projects.length) return;
  void writeups.recap(day, readSettings(db).language).catch(() => undefined);
}, 15 * 60_000);
const environments = new Environments(
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
);
const retention = new Retention(sqlite, config.dataDir, flows);
// Old transcript copies and leftovers are cleaned once a day when a keep period is set (plan.md 13.6).
setInterval(
  () => {
    const days = readSettings(db).transcriptDays;
    if (days > 0) retention.prune(days);
  },
  24 * 60 * 60_000,
);
const monitors = new Monitors(sqlite, store, bus);
monitors.start();
const docker = new Docker(servers);
const logs = new Logs(sqlite, store, files, docker, servers);
const appErrors = new AppErrors(sqlite, store, bus);
const learn = new Learn(sqlite, (prompt) => runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku"));
// Newest versions of the technologies the cheatsheets cover, once a day.
setTimeout(() => void learn.checkLatest().catch(() => undefined), 90_000);
setInterval(() => void learn.checkLatest().catch(() => undefined), 6 * 3_600_000);
const sealer = new Sealer(config.dataDir);
const envFiles = new EnvFiles(join(config.dataDir, "env-backups"));
const databases = new Databases(sqlite, store, sealer, envFiles);
const vault = new Vault(sqlite, store, envFiles, sealer);
// Private details stay on this computer: chats hide them before a message leaves (core/private.ts).
const privateValues = new PrivateValues(sqlite, sealer);
chats.privacy = privateValues;
// The privacy gateway: what the AI tools send leaves with private details and .env secrets hidden.
let envSecrets = { at: 0, values: [] as { name: string; value: string }[] };
const gatewayValues = () => {
  if (Date.now() - envSecrets.at > 60_000) envSecrets = { at: Date.now(), values: vault.secretValues() };
  return [...privateValues.values(), ...envSecrets.values];
};
const gatewayStats = { hidden: 0 };
const gateway = startGateway(gatewayValues, undefined, (n) => {
  gatewayStats.hidden += n;
});
// Codex's own gateway: ChatGPT's Codex backend for a ChatGPT sign-in, OpenAI's API for a key.
const codexGateway = startGateway(
  gatewayValues,
  (path) => (path.startsWith("/backend-api/") ? "https://chatgpt.com" : "https://api.openai.com"),
  (n) => {
    gatewayStats.hidden += n;
  },
);
setAiGateway(readSettings(db).privacyGateway ? gateway.url : undefined, codexGateway.url);
bus.subscribe((m) => {
  if (m.type === "settings") setAiGateway(m.settings.privacyGateway ? gateway.url : undefined, codexGateway.url);
});
const mcpServers = new McpServers(sqlite, sealer);
const bridges = new Bridges(sqlite, sealer, fetch, `http://localhost:${config.publicPort}`);
void bridges.load().catch(() => undefined);
// What goes out over the bridges (plan.md 13.3): short notices only, never code or secrets.
const runStatus = new Map<string, string>();
let pendingApprovals = 0;
bus.subscribe((m) => {
  if (m.type === "alert") void bridges.send({ event: m.kind, title: m.title, link: m.link });
  else if (m.type === "approvals") {
    if (m.approvals.length > pendingApprovals)
      void bridges.send({ event: "approval", title: m.approvals[0]?.command.slice(0, 120) ?? "", link: "/inbox" });
    pendingApprovals = m.approvals.length;
  } else if (m.type === "flows-changed" && m.runId) {
    const run = flows.get(m.runId);
    if (!run) return;
    const before = runStatus.get(run.id);
    runStatus.set(run.id, run.status);
    if (before && before !== run.status && ["needs_you", "ready", "failed"].includes(run.status))
      void bridges.send({
        event: "run",
        title: `${run.status === "failed" ? "Failed" : run.status === "ready" ? "Ready for your OK" : "Waiting for you"}: ${run.request.split("\n")[0]?.slice(0, 100)}`,
        link: `/runs/${run.id}`,
      });
  }
});
void mcpServers.load().catch(() => undefined);
const backupJobs = new BackupJobs(sqlite, store, bus, databases, servers, join(config.dataDir, "backups"));
setInterval(() => void backupJobs.tick(), 60_000);
// Before a deploy, the project's databases are backed up (plan.md 13.4); a failed backup stops it.
const dbJobs = (projectId: string) =>
  backupJobs
    .list()
    .filter(
      (j) =>
        j.source.kind === "database" &&
        (j.projectId === projectId ||
          databases
            .list()
            .some((c) => c.projectId === projectId && j.source.kind === "database" && j.source.connectionId === c.id)),
    );
environments.hasDbBackup = (projectId) => dbJobs(projectId).length > 0;
environments.beforeDeploy = async (projectId) => {
  const done: string[] = [];
  for (const job of dbJobs(projectId)) {
    const run = await backupJobs.run(job.id);
    if (run.status !== "ok") throw new Error(`The backup before the deploy failed (${job.name}): ${run.error ?? ""}`);
    done.push(job.name);
  }
  return done;
};
const docs = new Docs(
  sqlite,
  store,
  bus,
  databases,
  (prompt, images) => runClaude(prompt, join(config.dataDir, "runner"), stops, "sonnet", [], undefined, images),
  () => sync.identity().name,
);
sync.docs = docs;
sync.board = board;
sync.lessons = lessons;
const product = new Product(
  sqlite,
  store,
  docs,
  flows,
  writeups,
  (prompt, system) =>
    runClaude(
      prompt,
      join(config.dataDir, "runner"),
      stops,
      "sonnet",
      system ? ["--append-system-prompt", system] : [],
    ),
  join(config.dataDir, "launch-shots"),
  (id, projectId) => {
    const persona = personas.get(id);
    return persona ? personas.systemPrompt(persona, projectId, { notebook: false }) : undefined;
  },
);
// The weekly CEO report is written by itself on Monday mornings (with background summaries on).
setInterval(() => {
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() < 8 || !readSettings(db).autoSummarize) return;
  if (product.weekly(isoWeek(now.getTime() - 86_400_000))) return;
  void product.writeWeekly(readSettings(db).language, now.getTime() - 3_600_000).catch(() => undefined);
}, 30 * 60_000);
const briefings = new Briefings(
  sqlite,
  store,
  flows,
  schedules,
  lessons,
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
// Secrets and pages agents ask for through Igrek's MCP server (plan.md 16.3).
const agentRequests = new AgentRequests(store, vault, envFiles, personas);
// "// ai: do this!" comments typed in the user's editor become inbox items (plan.md 16.4).
const aiComments = new AiComments(
  () => store.listProjects(),
  () => readSettings(db).language,
);
aiComments.start();
insight.extraNotices = () => [
  ...aiComments.notices(),
  ...agentRequests.notices(),
  ...sync.overlapNotices(),
  ...sync.mentionNotices(),
  ...knowledge.notices(),
  ...schedules.notices(),
  ...secretScanner.notices(),
  ...depWatcher.notices(),
  ...monitors.notices(),
  ...appErrors.notices(),
  ...backupJobs.notices(),
  ...testers.notices(),
  ...vault.notices(),
  ...environments.notices(),
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
const extensionKeys = new ExtensionKeys(sqlite);
// Speech from the microphone, recognised on this computer (downloaded once, when the user asks).
const speech = new Speech(join(config.dataDir, "models", "whisper-base"));
const app = createApp({
  config,
  db,
  token,
  bus,
  stops,
  startedAt: Date.now(),
  extensionKey: (key) => extensionKeys.valid(key),
  extraRoutes: (hono) => {
    registerAgentRequestRoutes(hono, agentRequests);
    registerTerminalRoutes(hono, {
      store,
      terminals,
      language: () => readSettings(db).language,
      servers,
      accounts,
      chat: (id) => chats.snapshot(id),
      privateValues: gatewayValues,
    });
    registerAccountRoutes(hono, { accounts, terminals, db: sqlite });
    registerServerRoutes(hono, servers);
    const igrekMcp = {
      // Read when a chat starts: Igrek's own tools plus the user's enabled MCP servers.
      get config() {
        return JSON.stringify({
          mcpServers: {
            ...mcpServers.config(),
            igrek: {
              command: process.execPath,
              args: [join(import.meta.dir, "mcp.ts")],
              env: { IGREK_PORT: String(config.publicPort), IGREK_HOME: config.dataDir },
            },
          },
        });
      },
      // Reading Igrek and proposing a schedule need no prompt; a proposal still waits for the user's OK in Igrek.
      // Experts only read the project, so asking one needs no prompt either (when the user allows it).
      get allow() {
        return [
          "mcp__igrek__igrek_project_memory",
          "mcp__igrek__igrek_search",
          "mcp__igrek__igrek_recent_sessions",
          "mcp__igrek__library_search",
          "mcp__igrek__igrek_lessons",
          "mcp__igrek__igrek_schedule",
          // The list of projects and of runs only reads; handing work over (igrek_delegate) asks.
          "mcp__igrek__igrek_projects",
          "mcp__igrek__igrek_runs",
          ...(readSettings(db).consultExperts ? ["mcp__igrek__igrek_ask_expert"] : []),
        ];
      },
      get hint() {
        return readSettings(db).consultExperts ? expertsHint(experts.roster()) : undefined;
      },
    };
    registerChatRoutes(hono, {
      chats,
      bus,
      store,
      accounts,
      worktreeDir: join(config.dataDir, "worktrees"),
      persona: personaChat,
      richUi: () => (readSettings(db).richAnswers ? reportUiHint() : undefined),
      igrekMcp,
      subagents: (projectId) =>
        readSettings(db).consultExperts ? experts.writeSubagents(projectId, join(config.dataDir, "agents")) : undefined,
    });
    // The chief: one chat about everything, which hands work to the projects (chief.ts).
    const chief = new Chief(
      join(config.dataDir, "chief"),
      chats,
      (cwd, resume, projectId) => {
        const account = accounts.active("claude");
        const project = projectId ? store.projectRow(projectId) : undefined;
        if (projectId && !project) throw new Error("Project not found");
        return chats.start({
          projectId: "chief",
          cwd,
          title: project ? project.name : "Chief",
          // A project's thread stays on that project; the general one is for everything else.
          ...(project
            ? {
                note: `This thread is only about the project "${project.name}" (folder ${project.path}, id ${project.id}). Hand its work to it with igrek_delegate; for other projects the user has the general thread.`,
              }
            : {}),
          mode: "normal",
          focus: "chief",
          resume,
          history: resume ? historyEvents(store.sessionDetail(resume, 120)?.messages ?? []) : undefined,
          igrekMcp,
          richUi: readSettings(db).richAnswers ? reportUiHint() : undefined,
          accountId: account?.id,
          env: accounts.env(account),
        });
      },
      (projectId) => store.projectRow(projectId)?.name ?? projectId,
    );
    flows.onChange = (run) => {
      board.followRun(run);
      chief.onRun(run);
    };
    // The chief from a phone (telegram.ts); it starts only once the user connected a bot.
    const telegram = new Telegram(config.dataDir, sealer, chief, gatewayValues);
    registerTelegramRoutes(hono, telegram);
    void telegram.start();
    registerChiefRoutes(hono, chief, (project, request, persona) => {
      const wanted = project.trim().toLowerCase();
      const found = store
        .listProjects()
        .find((p) => p.id === project || p.path === project || p.name.toLowerCase() === wanted);
      if (!found) throw new Error(`No project "${project}"; igrek_projects lists them`);
      return flows.start({ projectId: found.id, flow: "task", request, persona, by: "chief" });
    });
    registerTesterRoutes(hono, testers);
    registerLibraryRoutes(hono, {
      library,
      embedder,
      projects: () => store.listProjects().map((p) => ({ name: p.name, path: p.path })),
    });
    registerKnowledgeRoutes(hono, knowledge);
    registerFlowRoutes(hono, {
      flows,
      board,
      store,
      me: () => {
        const { id, name } = sync.identity();
        return id ? { id, name: name ?? id } : undefined;
      },
    });
    registerArenaRoutes(hono, new Arena(sqlite, flows));
    registerImportRoutes(hono, board, store);
    hono.post("/api/help", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { question?: string };
      const question = String(body.question ?? "")
        .trim()
        .slice(0, 500);
      if (!question) return c.json({ error: "Write a question" }, 400);
      const language = readSettings(db).language;
      const guide = HELP_TOPICS.map((t) => {
        const help = (bundledResources.en as unknown as { help: Record<string, string> }).help;
        return `[${t.id}] ${help[`t_${t.id}`]} (open: ${t.path}): ${help[`d_${t.id}`]}`;
      }).join("\n");
      try {
        const answer = await runClaude(
          [
            `You are the in-app guide of Igrek. Answer the user's question in the language with code "${language}", only from the guide below: where to click and what happens, in two to five short sentences. Name the page or tab by its name; never write web paths like /personas, because the app shows buttons for the pages under your answer. If the guide doesn't cover it, say so plainly. End with one line "TOPICS: id, id" listing the guide entries you used.`,
            "Guide:",
            guide,
            // The experts change (own ones can be added), so the guide gets the real list, not a number.
            `The experts on the Personas page, each can be chatted with (open its page, then Chat):\n${experts.roster()}`,
            `Question: ${question}`,
          ].join("\n\n"),
          join(config.dataDir, "runner"),
          stops,
          "haiku",
        );
        const topics = (answer.match(/TOPICS:\s*(.+)$/m)?.[1] ?? "")
          .split(/[,\s]+/)
          .filter((id) => HELP_TOPICS.some((t) => t.id === id));
        return c.json({ answer: answer.replace(/\n?TOPICS:.*$/m, "").trim(), topics });
      } catch (err) {
        return c.json({ error: (err as Error).message }, 400);
      }
    });
    hono.post("/api/demo", async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { parent?: string };
      try {
        const out = createDemo(
          {
            store,
            docs,
            board,
            addMilestone: (projectId, title, at) =>
              sqlite
                .query(
                  "INSERT INTO calendar_events (id, kind, title, at, project_id, created_at) VALUES (?, 'milestone', ?, ?, ?, ?)",
                )
                .run(`ev-${crypto.randomUUID().slice(0, 10)}`, title, at, projectId, Date.now()),
          },
          body.parent,
          readSettings(db).language,
        );
        bus.publish({ type: "sessions-changed", projectIds: [out.projectId], sessionIds: [] });
        return c.json(out);
      } catch (err) {
        return c.json({ error: (err as Error).message }, 400);
      }
    });
    registerScheduleRoutes(hono, { schedules, store });
    registerPreviewRoutes(hono, {
      devServers,
      stops,
      uiAudits: new UiAudits(sqlite),
      rescan: (projectId) => void insight.scan(projectId).catch(() => undefined),
      services: new Services(),
      rootOf: (projectId) => {
        const row = store.projectRow(projectId);
        return row && !row.path.startsWith("team:") && existsSync(row.path) ? row.path : undefined;
      },
    });
    registerExtrasRoutes(hono, {
      backups: new Backups(sqlite),
      updater,
      store,
      flows,
      lessons,
      library,
      move: {
        export: (password) => exportDataFolder(config.dataDir, sqlite, password),
        stage: (file, password) => stageDataFolder(config.dataDir, file, password),
        waiting: () => movedInWaiting(config.dataDir),
      },
    });
    const codeHost = new CodeHost(store, board);
    registerCodeHostRoutes(hono, codeHost);
    // Routines that start when something happens: CI fails, an issue is opened, the site or app breaks.
    const routines = new Routines(
      {
        fire: (event, projectId, happened) => schedules.fire(event, projectId, happened),
        watching: (event) => schedules.watching(event),
      },
      { runs: (projectId) => codeHost.runs(projectId), issues: (projectId) => codeHost.issues(projectId) },
    );
    bus.subscribe((m) => routines.onMessage(m));
    routines.start();
    registerVaultRoutes(hono, vault);
    registerPrivateRoutes(hono, privateValues);
    hono.get("/api/private/gateway", (c) =>
      c.json({ on: readSettings(db).privacyGateway, hidden: gatewayStats.hidden, values: gatewayValues().length }),
    );
    registerSpeechRoutes(hono, speech);
    registerPhoneRoutes(hono, new Phone(), (projectId) => {
      const row = store.projectRow(projectId);
      return row && !row.path.startsWith("team:") && existsSync(row.path) ? row.path : undefined;
    });
    registerReaRoutes(hono, terminals);
    // Skills go where the active Claude account reads them, so every chat can use them.
    registerSkillRoutes(
      hono,
      new Skills(() => {
        const account = accounts.active("claude");
        return join(account?.configDir || join(homedir(), ".claude"), "skills");
      }),
    );
    registerExtensionRoutes(hono, {
      keys: extensionKeys,
      values: privateValues,
      // A form field's text: the stronger model, no tools, in an empty folder.
      write: (prompt) => runClaude(prompt, join(config.dataDir, "runner"), stops, "sonnet"),
    });
    registerMcpRoutes(hono, mcpServers);
    hono.get("/api/disk", (c) => c.json(retention.usage(readSettings(db).transcriptDays)));
    hono.post("/api/disk/prune", (c) => c.json(retention.prune(readSettings(db).transcriptDays)));
    hono.get("/api/network", (c) =>
      c.json({
        since: startedAt,
        hosts: [...netLog.values()]
          .sort((a, b) => b.count - a.count)
          .map((e) => ({ ...e, purpose: HOST_PURPOSE[e.host] })),
      }),
    );
    registerBridgeRoutes(hono, bridges, () => readSettings(db).language);
    registerPerfRoutes(hono, new Perf(sqlite, appErrors));
    registerProductRoutes(hono, product, () => readSettings(db).language);
    registerFeedbackRoutes(
      hono,
      new FeedbackBox(sqlite, appErrors, board, bus, (prompt) =>
        runClaude(prompt, join(config.dataDir, "runner"), stops, "haiku"),
      ),
    );
    registerIncidentRoutes(
      hono,
      new Incidents(sqlite, store, bus, { monitors, errors: appErrors, logs, docs, personas }, (prompt, system) =>
        runClaude(
          prompt,
          join(config.dataDir, "runner"),
          stops,
          "sonnet",
          system ? ["--append-system-prompt", system] : [],
        ),
      ),
      () => readSettings(db).language,
    );
    registerTimeRoutes(hono, store);
    registerLearnRoutes(hono, {
      learn,
      store,
      insight,
      environments,
      monitors,
      errors: appErrors,
      flows,
      language: () => readSettings(db).language,
    });
    registerWriteupRoutes(hono, {
      writeups,
      store,
      team: sync,
    });
    hono.get("/api/local-model", async (c) => {
      const s = readSettings(db);
      return c.json({ ...(await ollamaModels(s.localModelUrl)), limitedUntil: localModel.limitedUntil });
    });
    registerPluginRoutes(hono, { plugins: new Plugins(sqlite, join(config.dataDir, "plugins")), terminals, store });
    registerAnalyticsRoutes(hono, { analytics: new Analytics(sqlite, appErrors, databases), store });
    registerCostRoutes(hono, new Costs(sqlite, { accounts, servers, monitors }));
    registerCalendarRoutes(hono, new Calendar(sqlite, schedules, backupJobs, monitors));
    registerDocsRoutes(hono, docs, (cwd) => store.projectForCwd(cwd) ?? undefined);
    registerDataRoutes(hono, { databases, backups: backupJobs });
    registerOpsRoutes(hono, { monitors, docker, logs, errors: appErrors, flows, port: config.publicPort });
    registerWatcherRoutes(hono, {
      secrets: secretScanner,
      deps: depWatcher,
      store,
      dataDir: config.dataDir,
      port: config.publicPort,
    });
    hono.get("/api/briefing", async (c) => {
      try {
        // Without background AI only an already written briefing is shown, unless the user asks.
        const refresh = c.req.query("refresh") === "1";
        if (!refresh && !readSettings(db).autoSummarize) return c.json(briefings.cached() ?? null);
        return c.json(await briefings.get(refresh));
      } catch (err) {
        return c.json({ error: (err as Error).message }, 502);
      }
    });
    registerPersonaRoutes(hono, {
      personas,
      meetings,
      accounts,
      ideas: () => ({
        list: assist.listIdeas(),
        projects: new Map(store.listProjects().map((p) => [p.id, p.name])),
      }),
      packs: new PersonaPacks(personas, flows.marketDir ?? join(config.dataDir, "flows")),
    });
    registerExpertRoutes(hono, experts, (cwd) => store.projectForCwd(cwd));
    registerCommitHookRoutes(hono, store);
    registerFileRoutes(hono, {
      files,
      store,
      db: sqlite,
      onRestore: (projectId, checkpointId, changed) =>
        lessons.checkpointRestored(projectId, checkpointId, "an AI turn", changed),
      busy: (projectId) => chats.list().some((chat) => chat.projectId === projectId && chat.status === "working"),
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
      envs: environments,
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
      return top.length ? `## Lessons learned (Igrek lessons book)\n${lessonLines(top)}` : undefined;
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

type SocketData = { unsubscribe?: () => void; terminal?: string; chat?: string; stream?: ChatStream };

function cookieFrom(req: Request): string | undefined {
  // Same parser Hono's getCookie uses, so WebSocket and HTTP auth agree.
  const cookies = parse(req.headers.get("cookie") ?? "");
  return cookies[SESSION_COOKIE] ?? cookies[OLD_SESSION_COOKIE];
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
        const id = ws.data.chat;
        const stream = new ChatStream(
          (data) => ws.send(data),
          () => ws.getBufferedAmount(),
          () => chats.snapshot(id),
        );
        const attached = chats.attach(id, (op) => stream.push(op));
        if (attached) {
          stream.start(attached);
          ws.data.stream = stream;
          ws.data.unsubscribe = () => {
            attached.detach();
            stream.close();
          };
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
    drain(ws) {
      ws.data.stream?.drain();
    },
    close(ws) {
      ws.data.unsubscribe?.();
    },
  },
});

console.log(`Igrek ${APP_VERSION} → http://localhost:${server.port}  (data: ${config.dataDir})`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    indexer.stop();
    summarizer.stop();
    jobs.stop();
    terminals.stopAll();
    chats.stopAll();
    devServers.stopAll();
    await stops.stopAll();
    server.stop();
    process.exit(0);
  });
}
