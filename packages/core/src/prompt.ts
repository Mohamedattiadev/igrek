/** Prompt enhancer (plan.md Faz 4.5): shared between server and UI. */

export type EnhanceIntent = "fix" | "add" | "refactor" | "explain" | "test" | "review" | "deploy" | "other";

export type EnhanceContextKind = "memory" | "session" | "git" | "file" | "error" | "team";

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
