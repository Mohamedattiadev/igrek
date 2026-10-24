import { RTL_LANGUAGES } from "@igrek/core";
import en from "@igrek/i18n/locales/en.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * English is the fallback for every language, so it ships with the first screen; the other
 * hand-checked languages load when they are chosen (plan.md 15.4: about 190 KB less for everyone else).
 */
const BUNDLED: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  tr: () => import("@igrek/i18n/locales/tr.json"),
};

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`),
  );
}

/**
 * The Simple view's plainer words (plan.md 7.2): the "plain" part of a language's texts holds, under
 * the same keys, what replaces a text there ("branch" becomes "line of work"). Swapping them in the
 * loaded texts changes every screen at once without each component knowing about the view; the
 * texts they replaced are kept, per language, for the Developer view.
 */
const replaced = new Map<string, Map<string, string>>();
let plainWords = false;

function swapIn(code: string): void {
  const tree = i18n.getResource(code, "translation", "plain") as Tree | undefined;
  if (!tree || typeof tree !== "object") return;
  const saved = replaced.get(code) ?? new Map<string, string>();
  for (const [key, text] of leaves(tree)) {
    const current = i18n.getResource(code, "translation", key);
    // A text the language does not have falls back to English, which has its own plain word.
    if (typeof current !== "string") continue;
    if (current !== text) saved.set(key, current);
    i18n.addResource(code, "translation", key, text);
  }
  replaced.set(code, saved);
}

function swapOut(code: string): void {
  for (const [key, text] of replaced.get(code) ?? []) i18n.addResource(code, "translation", key, text);
  replaced.delete(code);
}

/** Texts loaded after the view was chosen (a language, a pack) get the plain words too. */
function refreshPlain(code: string): void {
  if (!plainWords) return;
  // A newly loaded bundle wrote its own texts over the swapped ones: those are the originals now.
  replaced.delete(code);
  swapIn(code);
}

/** Switches between the Simple view's plain words and the usual ones, for the shown language and English. */
export function setPlainWords(on: boolean): void {
  if (on === plainWords) return;
  plainWords = on;
  for (const code of new Set(["en", i18n.language])) {
    if (on) swapIn(code);
    else swapOut(code);
  }
  void i18n.changeLanguage(i18n.language);
}

export function isBundled(code: string): boolean {
  return code === "en" || code in BUNDLED;
}

/** Loads a hand-checked language before it is shown, so the page never flashes in English. */
export async function loadBundled(code: string): Promise<void> {
  const load = BUNDLED[code];
  if (!load || i18n.hasResourceBundle(code, "translation")) return;
  i18n.addResourceBundle(code, "translation", (await load()).default, true, true);
  refreshPlain(code);
}

/**
 * Adds the AI-made pack (other languages) and the user's corrections (any language) on top of
 * the bundled texts. Anything still missing falls back to English.
 */
export async function loadPack(code: string): Promise<void> {
  const { api } = await import("./api");
  const { messages } = await api.languagePack(code).catch(() => ({ messages: {} }));
  if (Object.keys(messages).length) {
    i18n.addResourceBundle(code, "translation", messages, true, true);
    refreshPlain(code);
    if (i18n.language === code) await i18n.changeLanguage(code);
  }
}

/** Switches UI language; languages without a pack yet fall back to English text. */
export function applyLanguage(code: string): void {
  void loadBundled(code)
    .then(() => {
      // Chosen while another language was shown: this one's plain words are not in yet.
      if (plainWords && !replaced.has(code)) swapIn(code);
      return i18n.changeLanguage(code);
    })
    .then(() => loadPack(code));
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code.split("-")[0] ?? code) ? "rtl" : "ltr";
}

export default i18n;
