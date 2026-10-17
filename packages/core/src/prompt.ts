/** Prompt enhancer (plan.md Faz 4.5): shared between server and UI. */

export type EnhanceIntent = "fix" | "add" | "refactor" | "explain" | "test" | "review" | "deploy" | "other";

export type EnhanceContextKind = "memory" | "session" | "git" | "file" | "error" | "log" | "team";

export interface EnhanceContextItem {
  kind: EnhanceContextKind;
  /** Short label for the chip, e.g. "3 decisions" or "auth.ts:12-30". */
  label: string;
}

export interface EnhanceQuestion {
  question: string;
  options: string[];
}

export interface EnhancedParts {
  goal: string;
  context: string[];
  constraints: string[];
  done: string[];
  /** Guesses, kept apart so the user can drop them. */
  assumptions: string[];
}

export interface EnhanceResult {
  original: string;
  /** The text after the user's shorthands were expanded, when any were. */
  expanded?: string;
  intent: EnhanceIntent;
  /** Set when the request is too vague to improve without guessing. */
  questions?: EnhanceQuestion[];
  parts?: EnhancedParts;
  /** One or two sentences in the user's language: what was added and why. */
  explanation?: string;
  size: "small" | "medium" | "large";
  /** Big jobs: suggest Plan mode or splitting into steps. */
  suggestPlan: boolean;
  context: EnhanceContextItem[];
  /** "ai" = rewritten by the small model; "template" = no AI (limit reached or offline). */
  mode: "ai" | "template";
}

const INTENT_WORDS: [EnhanceIntent, RegExp][] = [
  [
    "fix",
    /\b(fix|bug|broken|error|crash|fails?|not working|doesn'?t work|düzelt|bozuk|hata|çalışmıyor|calismiyor|patlıyor|patliyor)/i,
  ],
  ["test", /\b(tests?|spec|test yaz|testle)/i],
  ["explain", /\b(explain|what does|how does|why|açıkla|acikla|nedir|nasıl çalışıyor|neden)/i],
  ["review", /\b(review|audit|check|incele|gözden geçir|kontrol et)/i],
  ["deploy", /\b(deploy|release|ship|yayınla|yayinla|canlıya)/i],
  ["refactor", /\b(refactor|clean ?up|simplify|rename|reorgani[sz]e|toparla|temizle|sadeleştir|yeniden düzenle)/i],
  ["add", /\b(add|create|implement|build|make|new|ekle|oluştur|olustur|yap|yaz)\b/i],
];

export function detectIntent(text: string): EnhanceIntent {
  for (const [intent, pattern] of INTENT_WORDS) if (pattern.test(text)) return intent;
  return "other";
}

const VAGUE =
  /\b(this|that|it|thing|stuff|properly|correctly|the right way|bunu|şunu|sunu|onu|şu|bu|şey|doğrusunu|dogrusunu|düzgün|duzgun|bak|hallet)\b/i;
const SPECIFIC = /([\w-]+\/[\w./-]+|\.\w{1,5}\b|`[^`]+`|\b[a-z]+[A-Z]\w*\b|\b\w+\(\)|:\d+)/;

/**
 * 0 = clear, 1 = very weak. Short, vague requests without any file, symbol or
 * error in them are the ones worth enhancing.
 */
export function promptWeakness(text: string): number {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return 0; // empty or a slash command
  const words = trimmed.split(/\s+/).length;
  let score = words < 4 ? 0.6 : words < 10 ? 0.4 : words < 25 ? 0.15 : 0;
  if (VAGUE.test(trimmed)) score += 0.3;
  if (SPECIFIC.test(trimmed)) score -= 0.3;
  if (trimmed.includes("\n")) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

/** Replaces the user's shorthands as whole words ("dyy" → "doğrusunu yap"). */
export function expandShortcuts(text: string, shortcuts: Record<string, string>): string {
  let out = text;
  for (const [short, long] of Object.entries(shortcuts)) {
    if (!short.trim() || !long.trim()) continue;
    const escaped = short.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`(^|[\\s,.;:!?(])${escaped}(?=$|[\\s,.;:!?)])`, "giu"),
      (_m, before: string) => `${before}${long.trim()}`,
    );
  }
  return out;
}

export interface EnhanceStats {
  /** Last 7 days. */
  week: { total: number; enhanced: number; edited: number; original: number };
  /** Average errors in the 30 minutes after sending, enhanced vs. as written (null without data). */
  errorsEnhanced: number | null;
  errorsOriginal: number | null;
  /** What the user's own prompts most often lacked this week. */
  missing: { part: "files" | "done" | "limits"; count: number }[];
  /** Short words the user keeps using that might be shorthands worth defining. */
  suggestions: string[];
}

export const isWeakPrompt = (text: string) => promptWeakness(text) >= 0.5;

/** The final prompt text. Headings stay in English: that is what the AI tools read best. */
export function renderEnhanced(parts: EnhancedParts, dropAssumptions: number[] = []): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  const assumptions = parts.assumptions.filter((_, i) => !dropAssumptions.includes(i));
  return [
    `## Goal\n${parts.goal}`,
    parts.context.length ? `## Context\n${list(parts.context)}` : "",
    parts.constraints.length ? `## Constraints\n${list(parts.constraints)}` : "",
    parts.done.length ? `## Done when\n${list(parts.done)}` : "",
    assumptions.length ? `## Assumptions (correct me if wrong)\n${list(assumptions)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Model routing hint (plan.md 1.6): hard or wide work → Opus, tiny questions → Haiku,
 * everything else stays on the default. Only a suggestion; the user decides.
 */
export function suggestModel(text: string): "opus" | "haiku" | undefined {
  const t = text.trim();
  if (t.length < 3) return undefined;
  const hard =
    /\b(architect|architecture|design the|redesign|migrat|rewrite|from scratch|race condition|deadlock|memory leak|concurren|security audit|performance|optimi[sz]e|mimari|tasarla|yeniden yaz|sıfırdan|baştan|bellek sızıntısı|performans|güvenlik denetimi|karmaşık|zor bir)/i;
  if (hard.test(t) || (t.length > 600 && /\n/.test(t))) return "opus";
  const tiny = /^(what|why|how|is|does|can|ne|neden|nasıl|nedir|mı|mi)\b.{0,80}\??$/i;
  if (t.length < 90 && !t.includes("\n") && (tiny.test(t) || /\b(typo|rename|yazım hatası|adını değiştir)\b/i.test(t)))
    return "haiku";
  return undefined;
}

/** A concrete thing the prompt is missing (plan.md 13.1 "Prompt koçu"). Keys are translated in the UI. */
export type CoachTip = "where" | "error" | "done" | "which" | "keep" | "target" | "env" | "split";

const HAS_ERROR = /(error|exception|traceback|fail(ed|s)?|crash|\b[45]\d\d\b|hata|çöküyor|patlıyor|undefined|null)/i;
const HAS_DONE =
  /(should|must|so that|until|when .* then|expect|test|geçmeli|olmalı|görünmeli|bitmiş|tamam olunca|kabul)/i;
const HAS_ENV = /\b(staging|prod|production|test env|canlı|canli|üretim)\b/i;
const HAS_KEEP = /(without|keep|don't change|do not change|same behaviou?r|değiştirmeden|bozmadan|aynı kalsın)/i;

/**
 * What would make this prompt work better, checked locally while typing (no AI, no cost).
 * At most three tips, the most useful first.
 */
export function coachPrompt(text: string): CoachTip[] {
  const t = text.trim();
  if (t.length < 8 || t.startsWith("/")) return [];
  const intent = detectIntent(t);
  const specific = SPECIFIC.test(t) || /@[\w./-]+/.test(t);
  const tips: CoachTip[] = [];
  if (VAGUE.test(t) && !specific) tips.push("which");
  if (intent === "fix" && !HAS_ERROR.test(t)) tips.push("error");
  if (!specific && t.split(/\s+/).length >= 3 && intent !== "explain") tips.push("where");
  if ((intent === "add" || intent === "fix") && !HAS_DONE.test(t)) tips.push("done");
  if (intent === "refactor" && !HAS_KEEP.test(t)) tips.push("keep");
  if (intent === "test" && !specific) tips.push("target");
  if (intent === "deploy" && !HAS_ENV.test(t)) tips.push("env");
  if (
    (t.match(/\b(and then|then|also|ayrıca|sonra|ve de)\b/gi) ?? []).length >= 2 ||
    t.split(/\n/).filter((l) => /^\s*([-*]|\d+\.)\s/.test(l)).length >= 4
  )
    tips.push("split");
  return [...new Set(tips)].slice(0, 3);
}
