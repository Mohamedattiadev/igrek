import en from "../locales/en.json";
import tr from "../locales/tr.json";

export type Messages = typeof en;

/** Hand-checked language packs that ship with the app. */
export const bundledResources = { en, tr } satisfies Record<string, Messages>;

export interface LanguageOption {
  code: string;
  /** Name in the language itself, so people can find their own language. */
  native: string;
  english: string;
  bundled: boolean;
}

// Other languages get an AI-generated pack on first selection (plan.md, section 7.4).
const raw: [string, string, string][] = [
  ["en", "English", "English"],
  ["tr", "Türkçe", "Turkish"],
  ["ar", "العربية", "Arabic"],
  ["az", "Azərbaycanca", "Azerbaijani"],
  ["bn", "বাংলা", "Bengali"],
  ["bs", "Bosanski", "Bosnian"],
  ["cs", "Čeština", "Czech"],
  ["da", "Dansk", "Danish"],
  ["de", "Deutsch", "German"],
  ["el", "Ελληνικά", "Greek"],
  ["es", "Español", "Spanish"],
  ["fa", "فارسی", "Persian"],
  ["fi", "Suomi", "Finnish"],
  ["fr", "Français", "French"],
  ["he", "עברית", "Hebrew"],
  ["hi", "हिन्दी", "Hindi"],
  ["hu", "Magyar", "Hungarian"],
  ["id", "Bahasa Indonesia", "Indonesian"],
  ["it", "Italiano", "Italian"],
  ["ja", "日本語", "Japanese"],
  ["ka", "ქართული", "Georgian"],
  ["kk", "Қазақ", "Kazakh"],
  ["ko", "한국어", "Korean"],
  ["ku", "Kurdî", "Kurdish"],
  ["ms", "Bahasa Melayu", "Malay"],
  ["nl", "Nederlands", "Dutch"],
  ["no", "Norsk", "Norwegian"],
  ["pl", "Polski", "Polish"],
  ["pt", "Português", "Portuguese"],
  ["ro", "Română", "Romanian"],
  ["ru", "Русский", "Russian"],
  ["sq", "Shqip", "Albanian"],
  ["sv", "Svenska", "Swedish"],
  ["sw", "Kiswahili", "Swahili"],
  ["th", "ไทย", "Thai"],
  ["uk", "Українська", "Ukrainian"],
  ["ur", "اردو", "Urdu"],
  ["uz", "Oʻzbekcha", "Uzbek"],
  ["vi", "Tiếng Việt", "Vietnamese"],
  ["zh", "中文", "Chinese"],
];

export const languages: LanguageOption[] = raw.map(([code, native, english]) => ({
  code,
  native,
  english,
  bundled: code in bundledResources,
}));
