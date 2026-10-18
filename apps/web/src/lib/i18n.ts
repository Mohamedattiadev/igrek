import { RTL_LANGUAGES } from "@godeye/core";
import en from "@godeye/i18n/locales/en.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * English is the fallback for every language, so it ships with the first screen; the other
 * hand-checked languages load when they are chosen (plan.md 15.4: about 190 KB less for everyone else).
 */
const BUNDLED: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  tr: () => import("@godeye/i18n/locales/tr.json"),
};

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function isBundled(code: string): boolean {
  return code === "en" || code in BUNDLED;
}

/** Loads a hand-checked language before it is shown, so the page never flashes in English. */
export async function loadBundled(code: string): Promise<void> {
  const load = BUNDLED[code];
  if (!load || i18n.hasResourceBundle(code, "translation")) return;
  i18n.addResourceBundle(code, "translation", (await load()).default, true, true);
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
    if (i18n.language === code) await i18n.changeLanguage(code);
  }
}

/** Switches UI language; languages without a pack yet fall back to English text. */
export function applyLanguage(code: string): void {
  void loadBundled(code)
    .then(() => i18n.changeLanguage(code))
    .then(() => loadPack(code));
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code.split("-")[0] ?? code) ? "rtl" : "ltr";
}

export default i18n;
