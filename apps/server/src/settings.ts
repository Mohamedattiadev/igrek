import { DEFAULT_SETTINGS, type Settings } from "@godeye/core";
import { type Db, settingsTable } from "./db";

const THEMES = ["system", "light", "dark"];
const DENSITIES = ["comfortable", "compact"];
const MODES = ["simple", "pro"];
const KEYMAPS = ["default", "vim"];
const TONES = ["plain", "technical"];

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
    ["mode", MODES],
    ["keymap", KEYMAPS],
    ["summaryTone", TONES],
    ["enhanceMode", ["off", "suggest", "auto"]],
    ["enhanceLanguage", ["en", "user"]],
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
  if ("allowedFolders" in body) {
    const folders = body.allowedFolders;
    if (!Array.isArray(folders) || !folders.every((f) => typeof f === "string" && f.startsWith("/"))) {
      return { error: "Folders must be full paths" };
    }
    patch.allowedFolders = [...new Set(folders.map((f) => f.replace(/\/+$/, "") || "/"))].slice(0, 50);
  }
  for (const key of ["onboarded", "autoSummarize", "editorVim"] as const) {
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
