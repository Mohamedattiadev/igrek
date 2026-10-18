import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundledResources, languages } from "@igrek/i18n";
import { type Bus, StopRegistry } from "./bus";
import { MODEL_FOR, runClaude } from "./summarizer";

type Flat = Record<string, string>;
type Ask = (prompt: string) => Promise<string>;

export interface PackStatus {
  code: string;
  bundled: boolean;
  state: "bundled" | "none" | "ready" | "partial" | "generating" | "failed";
  /** Keys with a translation, and the keys there are. */
  done: number;
  total: number;
  error?: string;
}

const CHUNK = 150;
const PARALLEL = 3;

export function flatten(value: unknown, prefix = "", out: Flat = {}): Flat {
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child && typeof child === "object") flatten(child, `${prefix}${key}.`, out);
    else if (typeof child === "string") out[`${prefix}${key}`] = child;
  }
  return out;
}

export function unflatten(flat: Flat): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts.at(-1) as string] = value;
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

/**
 * Language packs for languages that don't ship with the app (plan.md 7.4): made once with
 * the user's own Claude login (Haiku), kept in ~/.godeye/i18n, then they work offline.
 * Corrections ("this translation is wrong") are stored separately and win over both.
 */
export class LanguagePacks {
  private readonly source = flatten(bundledResources.en);
  private running = new Map<string, { done: number; total: number }>();
  private failures = new Map<string, string>();

  constructor(
    private readonly dir: string,
    private readonly bus: Bus,
    runnerDir: string,
    private readonly ask: Ask = (prompt) => runClaude(prompt, runnerDir, new StopRegistry(), MODEL_FOR.summary),
  ) {
    mkdirSync(dir, { recursive: true });
  }

  static known(code: string): boolean {
    return languages.some((l) => l.code === code);
  }

  private read(file: string): Flat {
    try {
      return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Flat) : {};
    } catch {
      return {};
    }
  }

  private generated(code: string): Flat {
    return this.read(join(this.dir, `${code}.json`));
  }

  overrides(code: string): Flat {
    return this.read(join(this.dir, `${code}.overrides.json`));
  }

  /** What to add on top of the app's bundled texts: the generated pack (if any) and corrections. */
  messages(code: string): Record<string, unknown> {
    const bundled = code in bundledResources;
    return unflatten({ ...(bundled ? {} : this.generated(code)), ...this.overrides(code) });
  }

  status(code: string): PackStatus {
    const total = Object.keys(this.source).length;
    if (code in bundledResources) return { code, bundled: true, state: "bundled", done: total, total };
    const running = this.running.get(code);
    if (running) return { code, bundled: false, state: "generating", ...running };
    const pack = this.generated(code);
    const done = Object.keys(this.source).filter((k) => k in pack || this.isPluralSibling(k, pack)).length;
    const error = this.failures.get(code);
    const state = done === 0 ? (error ? "failed" : "none") : done < total ? "partial" : "ready";
    return { code, bundled: false, state, done, total, error };
  }

  /** Languages without a "one" form (e.g. Japanese) only need key_other; every language has "other". */
  private isPluralSibling(key: string, pack: Flat): boolean {
    return key.endsWith("_one") && `${key.slice(0, -4)}_other` in pack;
  }

  /** Every key, its English source and the text shown now (for the correction screen). */
  rows(code: string): { key: string; en: string; text: string; corrected: boolean }[] {
    const bundled = (bundledResources as Record<string, unknown>)[code];
    const current = bundled ? flatten(bundled) : this.generated(code);
    const fixes = this.overrides(code);
    return Object.entries(this.source).map(([key, en]) => ({
      key,
      en,
      text: fixes[key] ?? current[key] ?? en,
      corrected: key in fixes,
    }));
  }

  setOverride(code: string, key: string, text: string | null): void {
    if (!(key in this.source) && !/_(zero|two|few|many)$/.test(key)) throw new Error("Unknown text");
    if (text !== null && placeholders(text) !== placeholders(this.source[key] ?? text))
      throw new Error("Keep the {{…}} parts exactly as they are");
    const fixes = this.overrides(code);
    if (text === null || !text.trim()) delete fixes[key];
    else fixes[key] = text.slice(0, 2000);
    writeFileSync(join(this.dir, `${code}.overrides.json`), JSON.stringify(fixes, null, 1));
  }

  /** Translates what's missing (all of it the first time, only new texts after an update). */
  generate(code: string): PackStatus {
    if (code in bundledResources || this.running.has(code)) return this.status(code);
    void this.run(code);
    return this.status(code);
  }

  private async run(code: string): Promise<void> {
    const pack = this.generated(code);
    const missing = Object.keys(this.source).filter((k) => !(k in pack) && !this.isPluralSibling(k, pack));
    const total = Object.keys(this.source).length;
    const progress = { done: total - missing.length, total };
    this.running.set(code, progress);
    this.failures.delete(code);
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));
    const name = languages.find((l) => l.code === code)?.english ?? code;
    let plural: string[] = ["one", "other"];
    try {
      plural = new Intl.PluralRules(code).resolvedOptions().pluralCategories as string[];
    } catch {
      // Unknown to Intl: one/other.
    }
    const file = join(this.dir, `${code}.json`);
    let failed = 0;
    const work = async () => {
      for (let chunk = chunks.shift(); chunk; chunk = chunks.shift()) {
        const input = Object.fromEntries(chunk.map((k) => [k, this.source[k] as string]));
        try {
          const reply = await this.ask(packPrompt(name, code, input, plural));
          const parsed = parseJson(reply);
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== "string" || !value.trim()) continue;
            const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
            const source = this.source[key] ?? this.source[`${base}_other`] ?? this.source[`${base}_one`];
            // Only keys we asked for (or extra plural forms of them), with the same {{placeholders}}.
            if (!source || !(key in input || `${base}_other` in input || `${base}_one` in input)) continue;
            if (placeholders(value) !== placeholders(source)) continue;
            pack[key] = value.slice(0, 2000);
          }
          writeFileSync(file, JSON.stringify(pack, null, 1));
        } catch {
          failed++;
        }
        progress.done = Object.keys(this.source).filter((k) => k in pack || this.isPluralSibling(k, pack)).length;
        this.bus.publish({ type: "i18n-progress", code });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));
    this.running.delete(code);
    if (failed) this.failures.set(code, `${failed} part(s) couldn't be translated; try again to fill them in`);
    this.bus.publish({ type: "i18n-progress", code });
  }
}

function packPrompt(language: string, code: string, input: Flat, plural: string[]): string {
  const extra = plural.filter((p) => p !== "one" && p !== "other");
  return [
    `Translate these user-interface texts of the app "God Eye" from English to ${language} (language code "${code}").`,
    "Rules:",
    "- Keep every key exactly as it is.",
    "- Keep {{placeholders}} exactly as they are (same names, same braces).",
    "- Don't translate product and tool names (God Eye, Claude, Codex, Gemini, Git, GitHub, SSH, Docker, Haiku, Opus), code, file names or keyboard shortcuts.",
    "- Plain, friendly, short words a non-technical person understands. Same tone as the English.",
    extra.length
      ? `- ${language} has more plural forms. For every key ending in _one or _other, also add the forms ${extra.map((p) => `_${p}`).join(", ")} with the same base key.`
      : "",
    "Reply with one JSON object only (key → translated text), nothing else.",
    "",
    JSON.stringify(input, null, 1),
  ]
    .filter(Boolean)
    .join("\n");
}

function parseJson(reply: string): Record<string, unknown> {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in the reply");
  return JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
}
