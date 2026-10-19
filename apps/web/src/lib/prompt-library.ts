/**
 * Ready-made prompts that work well with coding agents, grouped by what people ask for most. The
 * texts are interface texts (prompts.lib_<id>_title and _body in every language); blanks like {file}
 * are filled before use.
 */
export const PROMPT_CATEGORIES = [
  "review",
  "debug",
  "tests",
  "refactor",
  "docs",
  "security",
  "performance",
  "planning",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const PROMPT_LIBRARY: { id: string; category: PromptCategory }[] = [
  { id: "code_review", category: "review" },
  { id: "pr_summary", category: "review" },
  { id: "bug_hunt", category: "debug" },
  { id: "error_explain", category: "debug" },
  { id: "tests_write", category: "tests" },
  { id: "tests_missing", category: "tests" },
  { id: "refactor_safe", category: "refactor" },
  { id: "simplify", category: "refactor" },
  { id: "readme", category: "docs" },
  { id: "explain_project", category: "docs" },
  { id: "security_review", category: "security" },
  { id: "secrets_check", category: "security" },
  { id: "perf_check", category: "performance" },
  { id: "slow_query", category: "performance" },
  { id: "plan_feature", category: "planning" },
  { id: "break_down", category: "planning" },
];

/** The blanks a prompt asks for: "{file}" → "file". */
export function variables(body: string): string[] {
  return [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string))];
}

/** The prompt with its blanks filled; blanks left empty stay visible so nothing is lost. */
export function fill(body: string, values: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (match, name: string) => values[name] || match);
}

/** Prompts saved more than once with the same title and text: all but the most used one. */
export function duplicates<T extends { id: string; title: string; body: string; uses: number }>(prompts: T[]): T[] {
  const best = new Map<string, T>();
  for (const p of prompts) {
    const key = `${p.title.trim()}\n${p.body.trim()}`;
    const kept = best.get(key);
    if (!kept || p.uses > kept.uses) best.set(key, p);
  }
  const keep = new Set([...best.values()].map((p) => p.id));
  return prompts.filter((p) => !keep.has(p.id));
}
