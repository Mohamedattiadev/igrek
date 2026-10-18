/**
 * The C4 model of God Eye (plan.md 15.2), drawn from the code: `bun scripts/c4.ts` writes
 * docs/architecture.md. The context level is written by hand (people and outside systems do not
 * show in imports); the container and component levels and every arrow between them come from
 * the import graph, so a test can tell when the picture no longer matches the code.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { graph, sourceFiles } from "./arch-check";

const ROOT = resolve(import.meta.dir, "..");
export const OUT = join(ROOT, "docs/architecture.md");

const CONTAINERS: Record<string, { label: string; tech: string; what: string }> = {
  "apps/web": { label: "Web app", tech: "React, Vite", what: "Everything the user sees, in the browser" },
  "apps/server": {
    label: "Server",
    tech: "Bun, SQLite",
    what: "Reads AI sessions, runs chats, terminals, checks and jobs",
  },
  "apps/hub": { label: "Team hub", tech: "Bun", what: "End-to-end encrypted relay for teams; deployed on its own" },
  "packages/core": { label: "core", tech: "TypeScript", what: "Shared types and rules" },
  "packages/i18n": { label: "i18n", tech: "TypeScript, JSON", what: "Interface texts in every language" },
  "packages/learn": { label: "learn", tech: "TypeScript, YAML", what: "Cheat sheets and roadmaps" },
  "packages/genui": { label: "genui", tech: "TypeScript, OpenUI", what: "The UI components the AI may use in reports" },
};

/** Server modules by area, matched on the file path; the first match wins. */
const AREAS: [string, string, RegExp][] = [
  [
    "foundation",
    "Foundation",
    /^\/(bus|db|config|names|settings|seal|jsonlines|env|files|localmodel|ydoc|sync\/scrub)\.ts$/,
  ],
  ["sync", "Team sync", /\/(sync\/|team-routes)/],
  ["preview", "Live preview", /\/(preview\/|preview-routes)/],
  [
    "insight",
    "Quality and insight",
    /\/(insight\/|insight-routes|testers?|tester-routes|crosscheck|security|perf|lessons?|lesson-routes|watchers?|watcher-routes|guards)/,
  ],
  [
    "sessions",
    "Session reading",
    /\/(adapters\/|indexer|store|summarizer|extract|embedder|embed-worker|imports|retention|timetrack|limits|accounts|health)/,
  ],
  [
    "chat",
    "Chats and terminals",
    /\/(chats?|chat-routes|terminals?|terminal-routes|worktrees|checkpoints|commands|trust|enhance|enhance-routes|assist|assist-routes|hooks|mcp)/,
  ],
  [
    "agents",
    "Personas, flows and jobs",
    /\/(personas?|persona-routes|flows?|flow-routes|flows-builtin|schedules?|schedule-routes|jobs|arena|meetings|archon|bridges|board|work|writeups|briefing)/,
  ],
  [
    "ops",
    "Servers and operations",
    /\/(costs|servers?|server-routes|deploy|docker|monitors|logs|backup|databases|data|incidents|environments|env|vault|ops|codehost|netlog|health|analytics|feedback|product|calendar|apperrors|system|update|plugins|extras)/,
  ],
  [
    "knowledge",
    "Learning and knowledge",
    /\/(learn|knowledge|library|docs|langpacks|translator|templates|examples|localmodel|i18n-routes)/,
  ],
  ["api", "HTTP API and app", /\//],
];

/**
 * The intended architecture of the server (docs/adr/0002-server-layers.md): which areas each
 * area may use. Lower layers never reach up; "api" is the composition root and may use all.
 */
export const INTENDED: Record<string, string[]> = {
  foundation: [],
  sessions: ["foundation"],
  knowledge: ["foundation", "sessions"],
  ops: ["foundation", "sessions"],
  insight: ["foundation", "sessions", "knowledge"],
  sync: ["foundation", "sessions"],
  chat: ["foundation", "sessions", "knowledge", "insight", "ops"],
  preview: ["foundation", "sessions", "ops", "chat"],
  agents: ["foundation", "sessions", "knowledge", "insight", "ops", "chat"],
  api: ["foundation", "sessions", "knowledge", "ops", "insight", "sync", "chat", "preview", "agents"],
};

export const DRIFT_BASELINE = join(ROOT, "scripts/c4-drift.json");

/** Imports (file -> file) that go where the intended architecture says they should not. */
export function drift(): string[] {
  const out: string[] = [];
  for (const [file, { all }] of graph(sourceFiles().filter((f) => !/\.test\.tsx?$/.test(f)))) {
    const from = areaOf(file);
    for (const to of all) {
      const target = areaOf(to);
      if (from && target && from !== target && !INTENDED[from]?.includes(target))
        out.push(`${file.replace("apps/server/src/", "")} -> ${to.replace("apps/server/src/", "")}`);
    }
  }
  return out.sort();
}

function containerOf(file: string): string | undefined {
  return Object.keys(CONTAINERS).find((c) => file.startsWith(`${c}/`));
}

function areaOf(file: string): string | undefined {
  if (!file.startsWith("apps/server/src/")) return undefined;
  // Route files are the HTTP layer: wiring areas together is their job.
  if (/-routes\.ts$/.test(file)) return "api";
  return AREAS.find(([, , re]) => re.test(file.slice("apps/server/src".length)))?.[0];
}

/**
 * Arrows between groups, from the imports of non-test files, in a fixed order. Only whether an
 * arrow exists is drawn, not how many imports it carries, so the picture changes when the
 * architecture does and not with every new import.
 */
function arrows(of: (file: string) => string | undefined): [string, string, number][] {
  const files = sourceFiles().filter((f) => !/\.test\.tsx?$/.test(f));
  const counts = new Map<string, number>();
  for (const [file, { all }] of graph(files)) {
    const from = of(file);
    for (const to of all) {
      const target = of(to);
      if (!from || !target || from === target) continue;
      const key = `${from}>${target}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([key, n]) => [...(key.split(">") as [string, string]), n] as [string, string, number])
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

const id = (s: string) => s.replace(/[^a-z0-9]/gi, "_");

export function render(): string {
  const containers = arrows(containerOf);
  const areas = arrows(areaOf);
  const drifting = (from: string, to: string) => !INTENDED[from]?.includes(to);
  const known = drift();
  const lines = [
    "# God Eye architecture (C4)",
    "",
    "<!-- Written by `bun scripts/c4.ts` from the code; do not edit by hand. A test fails when it is out of date. -->",
    "",
    "Three of the four C4 levels (Simon Brown, c4model.com). The fourth, code, is the source itself. The rules these",
    "pictures must keep are in `scripts/arch-check.ts` (`bun run lint:arch`).",
    "",
    "## 1. Context",
    "",
    "```mermaid",
    "C4Context",
    '  Person(user, "Developer", "Works with AI coding tools on their own projects")',
    '  System(godeye, "God Eye", "Runs on the developer\'s computer: sees, explains and steers their AI coding work")',
    '  System_Ext(ai, "AI coding CLIs", "Claude Code, Codex, Gemini: their session files and processes")',
    '  System_Ext(git, "Git hosts", "GitHub, GitLab, through the user\'s own gh and glab logins")',
    '  System_Ext(servers, "User\'s servers", "Reached over SSH for deploys and checks")',
    '  System_Ext(hub, "Team hub", "Optional, self-hosted, end-to-end encrypted")',
    '  Rel(user, godeye, "Uses", "Browser")',
    '  Rel(godeye, ai, "Reads sessions, starts chats")',
    '  Rel(godeye, git, "Issues, pull requests, CI")',
    '  Rel(godeye, servers, "Deploys, health", "SSH")',
    '  Rel(godeye, hub, "Shares chosen projects", "HTTPS")',
    "```",
    "",
    "## 2. Containers",
    "",
    "```mermaid",
    "C4Container",
    '  Person(user, "Developer")',
    '  System_Boundary(ge, "God Eye") {',
    ...Object.entries(CONTAINERS).map(
      ([key, c]) => `    Container(${id(key)}, "${c.label}", "${c.tech}", "${c.what}")`,
    ),
    "  }",
    '  Rel(user, apps_web, "Uses", "Browser")',
    '  Rel(apps_web, apps_server, "Calls", "HTTP, WebSocket")',
    ...containers.map(([from, to]) => `  Rel(${id(from)}, ${id(to)}, "imports")`),
    "```",
    "",
    "## 3. Components of the server",
    "",
    "Server modules grouped by area (matched on file names in `scripts/c4.ts`); an arrow means one area imports the other.",
    "",
    "```mermaid",
    "C4Component",
    '  Container_Boundary(server, "Server") {',
    ...AREAS.map(([key, label]) => `    Component(${key}, "${label}", "TypeScript")`),
    "  }",
    ...areas.map(([from, to]) => `  Rel(${from}, ${to}, "${drifting(from, to) ? "drift" : "uses"}")`),
    ...areas
      .filter(([from, to]) => drifting(from, to))
      .map(([from, to]) => `  UpdateRelStyle(${from}, ${to}, $textColor="red", $lineColor="red")`),
    "```",
    "",
    "## 4. Intended architecture and drift",
    "",
    "What each area may use, written down once in `docs/adr/0002-server-layers.md` and `INTENDED` in `scripts/c4.ts`.",
    'Red arrows above ("drift") go where the intended architecture says they should not. The imports behind them are',
    "listed in `scripts/c4-drift.json` with the reason; a new one fails the gate, and a fixed one must leave the list.",
    "",
    "| Area | May use |",
    "| --- | --- |",
    ...Object.entries(INTENDED).map(([area, may]) => `| ${area} | ${may.join(", ") || "nothing"} |`),
    "",
    `Imports that drift today: ${known.length}.`,
    "",
  ];
  return lines.join("\n");
}

if (import.meta.main) {
  writeFileSync(OUT, render());
  console.log(`wrote ${OUT}`);
}
