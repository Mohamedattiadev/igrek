import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import type { Settings } from "@igrek/core";
import { languages } from "@igrek/i18n";
import { StopRegistry } from "./bus";
import { MODEL_FOR, runClaude } from "./summarizer";

type Ask = (prompt: string) => Promise<string>;

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * "Everyone reads in their own language" (plan.md 7.4): a teammate's note, comment or title
 * is translated once (Haiku, your own login) and kept, so it never costs twice.
 */
export class Translator {
  constructor(
    private readonly db: Database,
    private readonly settings: () => Settings,
    runnerDir: string,
    private readonly ask: Ask = (prompt) => runClaude(prompt, runnerDir, new StopRegistry(), MODEL_FOR.ask),
  ) {}

  cached(texts: string[], lang: string): (string | undefined)[] {
    const get = this.db.query("SELECT text FROM translations WHERE hash = ? AND lang = ?");
    return texts.map((t) => (get.get(hash(t), lang) as { text: string } | null)?.text);
  }

  /** Translates what isn't cached yet. `force` runs even with background AI turned off (the user clicked). */
  async translate(texts: string[], lang: string, force = false): Promise<(string | undefined)[]> {
    const list = texts.slice(0, 40).map((t) => t.slice(0, 4000));
    const out = this.cached(list, lang);
    const todo = [...new Set(list.filter((_, i) => out[i] === undefined && list[i]?.trim()))];
    if (!todo.length || (!force && !this.settings().autoSummarize)) return out;
    const name = languages.find((l) => l.code === lang)?.english ?? lang;
    const reply = await this.ask(
      [
        `Translate each text in this JSON array into ${name}. Keep names, code, file paths and links unchanged; plain, natural wording.`,
        "If a text is already in that language, return it unchanged.",
        "Reply with a JSON array of strings only, same length and order.",
        "",
        JSON.stringify(todo),
      ].join("\n"),
    );
    const start = reply.indexOf("[");
    const end = reply.lastIndexOf("]");
    let parsed: unknown;
    try {
      parsed = JSON.parse(reply.slice(start, end + 1));
    } catch {
      return out;
    }
    if (!Array.isArray(parsed) || parsed.length !== todo.length) return out;
    const put = this.db.query("INSERT OR REPLACE INTO translations (hash, lang, text, at) VALUES (?, ?, ?, ?)");
    todo.forEach((text, i) => {
      const value = parsed[i];
      if (typeof value === "string" && value.trim()) put.run(hash(text), lang, value.slice(0, 8000), Date.now());
    });
    return this.cached(list, lang);
  }
}
