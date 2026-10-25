/**
 * Ways of working for the usual kinds of task (after pstack's playbooks): a bug is reproduced before
 * it is fixed, a slowness is measured before and after, a refactor keeps the behaviour, a feature
 * starts small. Each starts with the goal said back (pstack's in-your-own-words) and ends with the
 * decisions made (show-me-your-work). Igrek adds them to a task started from the box, visibly; the
 * user can leave them out.
 */
export type PlaybookKind = "bug" | "perf" | "refactor" | "feature";

/** Asking to be told something is not a task to change code. */
const QUESTION =
  /^(what|why|how does|how do|how is|explain|tell me|describe|is there|are there|can you explain|ne\b|neden\b|niye\b|nasıl çalış|nedir|açıkla|anlat|bana anlat|söyle|var mı)|(?<!\p{L})(nedir|ne demek|nasıl çalışıyor|açıklar mısın|anlatır mısın|anlat|açıkla)[.!?]?$/iu;

const KINDS: [PlaybookKind, RegExp][] = [
  [
    "perf",
    /\b(slow|slower|sluggish|speed (it )?up|faster|performance|latency|laggy|lags|memory leak|takes (too|so) long|optimi[sz]e|high cpu|n\+1)\b|(?<!\p{L})(yavaş\w*|hızlandır\w*|performans\w*|gecikme\w*|takılıyor|kasıyor|bellek sızıntısı|uzun sürüyor|optimize et\w*|çok bekletiyor)/iu,
  ],
  [
    "bug",
    /\b(bug|bugs|fix|fixes|broken|crash(es|ed|ing)?|error|errors|exception|fails?|failing|doesn'?t work|does not work|not working|regression|wrong (result|total|value|output)|is wrong|blank page|404)\b|(?<!\p{L})(hata\w*|düzelt\w*|bozuk\w*|bozul\w*|çöküyor|çöktü|çalışmıyor|patlıyor|patladı|sorun\w*|yanlış (gösteriyor|hesaplıyor|çıkıyor)|açılmıyor|kayboluyor|gözükmüyor|görünmüyor|hatalı)/iu,
  ],
  [
    "refactor",
    /\b(refactor\w*|clean ?up|tidy( up)?|restructure|reorgani[sz]e|simplify|extract (a |the )?(function|component|hook|module)|split (this|the|it)|rename|dedupe|remove duplication)\b|(?<!\p{L})(yeniden düzenle\w*|kodu temizle|temizle kodu|sadeleştir\w*|yeniden adlandır\w*|parçalara ayır|tekrarı kaldır|ayrı (dosyaya|fonksiyona|bileşene) (al|taşı))/iu,
  ],
  [
    "feature",
    /\b(add|build|create|implement|make (a|an|the)|new (page|feature|screen|button|endpoint|form|field|option)|support for|let users|allow users|introduce)\b|(?<!\p{L})(ekle\w*|oluştur\w*|yap(?!\p{L})|yapalım|yeni (sayfa|özellik|ekran|düğme|buton|form|alan|seçenek)|geliştir\w*|desteği|kullanıcılar\w* .*(sağla|izin ver))/iu,
  ],
];

/** The kind of task a request is, if it is one of these; a question gets none. */
export function playbookFor(text: string): PlaybookKind | undefined {
  const t = text.trim();
  if (!t || QUESTION.test(t)) return undefined;
  return KINDS.find(([, pattern]) => pattern.test(t))?.[0];
}

const STEPS: Record<PlaybookKind, string[]> = {
  bug: [
    "Reproduce it first: a failing test, or the exact steps and what you saw. Do not change code before that.",
    "Find the root cause, not only where it shows; say what it is in one sentence.",
    "Fix that, with as small a change as does it. The failing test now passes and the others still do.",
  ],
  perf: [
    "Measure first: the number (time, memory, queries) and how you measured it, so it can be repeated.",
    "Find what takes the time (profile or count), then change one thing at a time.",
    "Measure again the same way; keep a change only if the number got better, and give before and after.",
  ],
  refactor: [
    "The behaviour stays exactly the same: run the tests before you start and after every step.",
    "Work in small steps that each leave the code working; no new features on the way.",
    "If something has no test and could break, add one before you move it.",
  ],
  feature: [
    "Write down the data it needs and where that lives before writing code.",
    "Build the smallest version that does the job first; leave nice-to-haves for later and say which.",
    "Add tests for the behaviour and run the project's own checks before you say it is done.",
  ],
};

/** The section added to the request: the goal said back, the kind's steps, the decisions at the end. */
export function playbookText(kind: PlaybookKind): string {
  const steps = [
    "Before changing anything, say the goal back in one or two sentences, and what done means.",
    ...STEPS[kind],
    "End with a short list of the decisions you made and why, so they can be checked.",
  ];
  return `## How to work\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}
