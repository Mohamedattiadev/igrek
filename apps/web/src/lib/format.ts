import i18n from "./i18n";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.round((at - now) / 1000);
  if (Math.abs(seconds) < 60) return i18n.t("time.justNow");
  const format = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds / 60), "minute");
}

export function dateTime(at: number): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(at);
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** "claude-sonnet-5-20260101" → "Sonnet 5" */
export function modelName(model: string): string {
  const match = model.match(/claude-([a-z]+)(?:-([\d-]+))?/);
  if (!match) return model;
  const family = (match[1] ?? "").replace(/^./, (c) => c.toUpperCase());
  const version = (match[2] ?? "")
    .split("-")
    .filter((part) => part.length <= 2)
    .join(".");
  return `${family} ${version}`.trim();
}

export function mainModel(models: Record<string, number>): string | undefined {
  return Object.entries(models).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * One whole sentence for a card: a summary cut off in the middle ("... toplam 142 gün....") said
 * little. The full text is in the tooltip and on the project page.
 */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const end = flat.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? flat.slice(0, end + 1) : flat;
  if (sentence.length <= 160) return sentence;
  const cut = sentence.slice(0, 157);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100))}...`;
}
