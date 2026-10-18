import type { ProjectListItem } from "@igrek/core";

/** Plain word matching for the helper (no AI): intents and project names in TR and EN. */
const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i" };
/** Lower case, Turkish letters folded, punctuation dropped: "Kaldığım yer" → "kaldigim yer". */
export function fold(s: string): string {
  return s
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[ışğüöçâî]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const has = (text: string, words: string[]) => words.some((w) => ` ${text} `.includes(` ${w}`));

export const LAST = [
  "son",
  "last",
  "latest",
  "recent",
  "devam",
  "kaldig",
  "resume",
  "continue",
  "en son",
  "onceki",
  "az once",
  "previous",
  "geri don",
  "donerim",
  "donmek",
  "back to",
];
export const CHAT = ["sohbet", "chat", "konusma", "session", "oturum", "mesaj"];
export const NEW = ["yeni", "new", "baslat", "start", "ac "];
export const TERMINAL = ["terminal", "shell", "konsol"];
export const TOUR = ["tur", "tour", "gezdir", "tanit", "onboarding"];
export const GUIDE = ["kilavuz", "guide", "nasil kullan", "how to use", "kullanim", "manual"];
export const WHERE_TYPE = ["prompt", "nereye yaz", "where do i write", "where to type", "nereye soru", "yazacag"];

/** The project a question names, by its folded name or a long enough part of it. */
export function findProject(text: string, projects: ProjectListItem[]): ProjectListItem | undefined {
  const words = text.split(" ").filter((w) => w.length > 2);
  let best: { p: ProjectListItem; score: number } | undefined;
  for (const p of projects) {
    const name = fold(p.name);
    const parts = name.split(" ");
    let score = 0;
    if (text.includes(name)) score = 100 + name.length;
    else
      for (const w of words)
        if (parts.some((part) => part === w || (w.length > 3 && part.startsWith(w)))) score = Math.max(score, w.length);
    if (score && (!best || score > best.score || (score === best.score && p.lastActivity > best.p.lastActivity)))
      best = { p, score };
  }
  return best?.p;
}
