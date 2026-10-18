import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MemorySection, SessionSummaryData } from "@igrek/core";
import type { Store } from "./store";

const MARKER = "igrek-hook";
/** Hook commands installed before the rename; recognised and replaced with the new script. */
const OLD_MARKER = "godeye-hook";
const isOurs = (command: string) => command.includes(MARKER) || command.includes(OLD_MARKER);
const MAX_CONTEXT_CHARS = 6000;

/**
 * Small shell script Claude Code runs at session start/end. It forwards the hook
 * payload to Igrek and prints whatever comes back; if Igrek isn't running it
 * stays silent, so Claude Code is never blocked.
 */
export function writeHookScript(dataDir: string, port: number): string {
  const dir = join(dataDir, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${MARKER}.sh`);
  writeFileSync(
    path,
    `#!/bin/sh
# Igrek hook (installed by Igrek; safe to delete).
[ -n "$IGREK_INTERNAL" ] && exit 0
KEY=$(cat "${join(dataDir, "session.key")}" 2>/dev/null) || exit 0
command -v curl >/dev/null 2>&1 || exit 0
curl -s -m 3 -X POST -H "Host: localhost:${port}" -H "Cookie: igrek_session=$KEY" \\
  -H "content-type: application/json" --data-binary @- "http://127.0.0.1:${port}/api/hooks/$1" 2>/dev/null || true
`,
  );
  chmodSync(path, 0o700);
  return path;
}

type HookEntry = { matcher?: string; hooks: { type: string; command: string }[] };
type SettingsFile = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>;

function settingsPath(projectPath: string): string {
  return join(projectPath, ".claude", "settings.local.json");
}

function readSettingsFile(path: string): SettingsFile {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as SettingsFile;
}

/** Keeps the local settings file out of git without touching the repo's .gitignore (plan.md 1.3). */
function excludeFromGit(projectPath: string): void {
  const exclude = join(projectPath, ".git", "info", "exclude");
  if (!existsSync(join(projectPath, ".git"))) return;
  const line = ".claude/settings.local.json";
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!current.split("\n").includes(line)) {
    mkdirSync(join(projectPath, ".git", "info"), { recursive: true });
    appendFileSync(exclude, `${current.endsWith("\n") || !current ? "" : "\n"}${line}\n`);
  }
}

const EVENTS: [event: string, arg: string][] = [
  ["SessionStart", "session-start"],
  ["SessionEnd", "session-end"],
  // Lessons from earlier mistakes that fit what the user just asked (plan.md 7.2).
  ["UserPromptSubmit", "prompt"],
];
/** Installed means the session hooks are there; the prompt hook is added to older installs on start. */
const REQUIRED = EVENTS.slice(0, 2);

export function installHooks(projectPath: string, script: string): void {
  const path = settingsPath(projectPath);
  const settings = readSettingsFile(path);
  const hooks = settings.hooks ?? {};
  settings.hooks = hooks;
  for (const [event, arg] of EVENTS) {
    const entries = hooks[event] ?? [];
    hooks[event] = entries;
    for (const entry of entries)
      for (const hook of entry.hooks ?? []) if (hook.command.includes(OLD_MARKER)) hook.command = `${script} ${arg}`;
    const already = entries.some((e) => e.hooks?.some((h) => isOurs(h.command)));
    if (!already) entries.push({ hooks: [{ type: "command", command: `${script} ${arg}` }] });
  }
  mkdirSync(join(projectPath, ".claude"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  excludeFromGit(projectPath);
}

export function uninstallHooks(projectPath: string): void {
  const path = settingsPath(projectPath);
  if (!existsSync(path)) return;
  const settings = readSettingsFile(path);
  const hooks = settings.hooks;
  if (!hooks) return;
  for (const [event] of EVENTS) {
    const entries = hooks[event];
    if (!entries) continue;
    const kept = entries
      .map((e) => ({ ...e, hooks: e.hooks.filter((h) => !isOurs(h.command)) }))
      .filter((e) => e.hooks.length > 0);
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

export function hooksInstalled(projectPath: string): boolean {
  try {
    const settings = readSettingsFile(settingsPath(projectPath));
    return REQUIRED.every(([event]) => settings.hooks?.[event]?.some((e) => e.hooks?.some((h) => isOurs(h.command))));
  } catch {
    return false;
  }
}

const HEADINGS: Record<MemorySection, string> = {
  status: "Where the project stands",
  decision: "Decisions already made",
  convention: "Rules and conventions",
  failed: "Tried before and did not work",
  issue: "Open problems",
};

/**
 * The project memory that gets injected into every new session (plan.md 1.4),
 * kept short so it costs little context.
 */
export function buildContext(store: Store, projectId: string): string | undefined {
  const project = store.projectRow(projectId);
  if (!project) return undefined;
  // Unresolved conflicts stay out until the user picks a side.
  const memory = store.listMemory(projectId, false);
  const sessions = store.listSessions(projectId, 5).filter((s) => s.summary);
  if (memory.length === 0 && sessions.length === 0) return undefined;

  const parts = [
    `# Igrek: project memory for "${project.name}"`,
    "Notes collected automatically from earlier sessions. They can be out of date: verify before relying on them, and tell the user if something here looks wrong.",
  ];
  for (const section of Object.keys(HEADINGS) as MemorySection[]) {
    const items = memory.filter((m) => m.section === section).slice(0, section === "status" ? 2 : 8);
    if (items.length) parts.push(`## ${HEADINGS[section]}\n${items.map((m) => `- ${m.text}`).join("\n")}`);
  }
  if (sessions.length) {
    const lines = sessions.map((s) => {
      const summary = s.summary as SessionSummaryData;
      const text = summary.texts.en ?? Object.values(summary.texts)[0];
      const date = new Date(s.updatedAt).toISOString().slice(0, 10);
      return `- ${date} · ${summary.title || s.title}: ${text?.did.slice(0, 3).join("; ") ?? ""}`;
    });
    parts.push(`## Recent sessions\n${lines.join("\n")}`);
  }
  let context = parts.join("\n\n");
  if (context.length > MAX_CONTEXT_CHARS) context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n…`;
  return context;
}
