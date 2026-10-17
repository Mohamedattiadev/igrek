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

/** Every ISO 639-1 language (plan.md 7.4: "all the world's languages"); names for the rest come from Intl. */
const ISO_639_1 =
  "aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
    " ",
  );

function displayName(code: string, inLanguage: string): string | undefined {
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: "language", fallback: "none" }).of(code);
    return name && name !== code ? name.charAt(0).toLocaleUpperCase(inLanguage) + name.slice(1) : undefined;
  } catch {
    return undefined;
  }
}

const curated = new Set(raw.map(([code]) => code));
const rest: [string, string, string][] = ISO_639_1.filter((code) => !curated.has(code)).flatMap((code) => {
  const english = displayName(code, "en");
  return english ? [[code, displayName(code, code) ?? english, english] as [string, string, string]] : [];
});

export const languages: LanguageOption[] = [...raw, ...rest.sort((a, b) => a[2].localeCompare(b[2], "en"))].map(
  ([code, native, english]) => ({
    code,
    native,
    english,
    bundled: code in bundledResources,
  }),
);
