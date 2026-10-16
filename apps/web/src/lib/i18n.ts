import { RTL_LANGUAGES } from "@godeye/core";
import { bundledResources } from "@godeye/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = Object.fromEntries(
  Object.entries(bundledResources).map(([code, messages]) => [code, { translation: messages }]),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function isBundled(code: string): boolean {
  return code in bundledResources;
}

/** Switches UI language; languages without a pack yet fall back to English text. */
export function applyLanguage(code: string): void {
  void i18n.changeLanguage(code);
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code.split("-")[0] ?? code) ? "rtl" : "ltr";
}

export default i18n;
