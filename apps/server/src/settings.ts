import { DEFAULT_SETTINGS, type Settings } from "@igrek/core";
import { type Db, settingsTable } from "./db";

const THEMES = ["system", "light", "dark", "darcula", "notion"];
const DENSITIES = ["comfortable", "compact"];
const MODES = ["simple", "pro"];
const KEYMAPS = ["default", "vim"];
const TONES = ["plain", "technical"];

/**
 * The user's private file patterns: plain glob patterns, one per entry. Brackets are refused, as a
 * pattern ends up inside Claude Code's rule Read(...), where ")" would end it early.
 */
function privateFilesPatch(value: unknown): { error: string } | { files: string[] } {
  if (!Array.isArray(value) || !value.every((f) => typeof f === "string")) return { error: "List the files as text" };
  const files = [...new Set(value.map((f: string) => f.trim()).filter(Boolean))];
  if (files.some((f) => f.length > 200 || /[()\n]/.test(f))) return { error: "A file pattern may not hold brackets" };
  return { files: files.slice(0, 50) };
}

export function readSettings(db: Db): Settings {
  const rows = db.select().from(settingsTable).all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** Validates a partial update; returns an error message or the cleaned patch. */
export function validatePatch(input: unknown): { error: string } | { patch: Partial<Settings> } {
  if (typeof input !== "object" || input === null) return { error: "Body must be an object" };
  const body = input as Record<string, unknown>;
  const patch: Partial<Settings> = {};

  if ("language" in body) {
    if (typeof body.language !== "string" || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(body.language)) {
      return { error: "Invalid language code" };
    }
    patch.language = body.language;
  }
  const enums: [keyof Settings, string[]][] = [
    ["theme", THEMES],
    ["density", DENSITIES],
    ["textSize", ["normal", "large", "larger"]],
    ["mode", MODES],
    ["keymap", KEYMAPS],
    ["summaryTone", TONES],
    ["enhanceMode", ["off", "suggest", "auto"]],
    ["editorKeymap", ["vscode", "jetbrains", "vim", "emacs"]],
    ["enhanceLanguage", ["en", "user"]],
    ["knowledgeScan", ["off", "daily", "weekly"]],
    ["localModel", ["off", "limit", "always"]],
    ["turnGate", ["off", "check", "sendBack"]],
  ];
  for (const [key, allowed] of enums) {
    if (key in body) {
      if (!allowed.includes(body[key] as string)) return { error: `Invalid ${key}` };
      Object.assign(patch, { [key]: body[key] });
    }
  }
  if ("enhanceShortcuts" in body) {
    const value = body.enhanceShortcuts;
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Invalid enhanceShortcuts" };
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => typeof v === "string" && /^[\p{L}\p{N}_-]{1,16}$/u.test(k.trim()) && v.trim().length > 0)
      .slice(0, 100)
      .map(([k, v]) => [k.trim().toLowerCase(), String(v).trim().slice(0, 200)]);
    patch.enhanceShortcuts = Object.fromEntries(entries);
  }
  if ("transcriptDays" in body) {
    const days = Number(body.transcriptDays);
    if (![0, 30, 90, 180, 365].includes(days)) return { error: "Invalid transcriptDays" };
    patch.transcriptDays = days;
  }
  if ("localModelName" in body) {
    if (typeof body.localModelName !== "string" || !/^[\w.:/-]{0,80}$/.test(body.localModelName))
      return { error: "Invalid localModelName" };
    patch.localModelName = body.localModelName;
  }
  if ("localModelUrl" in body) {
    // Only this computer or the local network: the point is that nothing leaves.
    const url = String(body.localModelUrl ?? "");
    if (
      !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?\/?$/.test(
        url,
      )
    )
      return { error: "Ollama must run on this computer or your local network" };
    patch.localModelUrl = url.replace(/\/$/, "");
  }
  if ("allowedFolders" in body) {
    const folders = body.allowedFolders;
    if (!Array.isArray(folders) || !folders.every((f) => typeof f === "string" && f.startsWith("/"))) {
      return { error: "Folders must be full paths" };
    }
    patch.allowedFolders = [...new Set(folders.map((f) => f.replace(/\/+$/, "") || "/"))].slice(0, 50);
  }
  if ("privateFiles" in body) {
    const result = privateFilesPatch(body.privateFiles);
    if ("error" in result) return result;
    patch.privateFiles = result.files;
  }
  for (const key of [
    "onboarded",
    "autoSummarize",
    "richAnswers",
    "consultExperts",
    "privacyGateway",
    "autoReview",
    "autoProjects",
    "editorVim",
    "notifications",
  ] as const) {
    if (key in body) {
      if (typeof body[key] !== "boolean") return { error: `Invalid ${key}` };
      patch[key] = body[key] as boolean;
    }
  }
  return { patch };
}

export function writeSettings(db: Db, patch: Partial<Settings>): Settings {
  const now = Date.now();
  for (const [key, value] of Object.entries(patch)) {
    const serialized = JSON.stringify(value);
    db.insert(settingsTable)
      .values({ key, value: serialized, updatedAt: now })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: serialized, updatedAt: now } })
      .run();
  }
  return readSettings(db);
}
