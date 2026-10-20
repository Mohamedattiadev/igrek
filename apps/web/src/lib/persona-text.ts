import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A built-in expert's profile stays in English (it is what the model reads); these are the same
 * sentences for the screen in another language, keyed by the English text. A sentence the user
 * changed, or one added after the translation, has no entry and is shown as it is.
 */
const PACKS: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  tr: () => import("@igrek/i18n/personas/tr.json"),
};

const loaded: Record<string, Record<string, string>> = {};

/** `show(text)`: the profile sentence in the interface's language when there is one. */
export function usePersonaText(): (text: string) => string {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [pack, setPack] = useState(() => loaded[lang]);
  useEffect(() => {
    const load = PACKS[lang];
    if (!load) return setPack(undefined);
    if (loaded[lang]) return setPack(loaded[lang]);
    let current = true;
    void load().then((mod) => {
      loaded[lang] = mod.default;
      if (current) setPack(mod.default);
    });
    return () => {
      current = false;
    };
  }, [lang]);
  return (text) => pack?.[text] ?? text;
}
