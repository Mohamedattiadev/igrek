/**
 * Code quality rules as code (plan.md 15.1): too complex or too long functions, too many
 * parameters, swallowed errors (empty blocks), promises nobody waits for, copy-pasted blocks, and
 * React effects that leak or race. Biome measures most of it with the rules in
 * scripts/biome-quality.json; copies and effects are found here.
 * Counts per rule and file that exist today are in code-baseline.json with the reason; a count
 * may only go down (the "ratchet"), and when it does the baseline must follow.
 *
 *   bun scripts/code-check.ts             check
 *   bun scripts/code-check.ts --baseline  rewrite the counts (keeps the reasons)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
export const BASELINE = join(import.meta.dir, "code-baseline.json");
/** A copy is this many meaningful lines in a row, the same in two places. */
const WINDOW = 12;

export const RULES: Record<string, string> = {
  noExcessiveCognitiveComplexity:
    "Code that is hard to follow hides bugs; split it with Extract Method or Decompose Conditional (https://refactoring.guru/smells/long-method).",
  noExcessiveLinesPerFunction:
    "Long Method smell: split it into named steps with Extract Method (https://refactoring.guru/smells/long-method).",
  useMaxParams:
    "Long Parameter List smell: pass one typed object (Introduce Parameter Object, https://refactoring.guru/smells/long-parameter-list).",
  noEmptyBlockStatements:
    "An empty block swallows an error or hides unfinished code; say why in a comment or handle it.",
  noFloatingPromises: "A promise nobody waits for loses its error; await it, catch it, or mark it with void.",
  noMisusedPromises: "A promise used where a boolean or a plain callback is expected.",
  duplicate:
    "Duplicate Code smell: the same lines in two places drift apart; extract them once (https://refactoring.guru/smells/duplicate-code).",
  effectLeak:
    "An effect starts a timer, listener, socket or observer and never stops it: it keeps running after the page is gone (react.dev: synchronizing with effects, cleanup).",
  serverLeak:
    "A server module starts a repeating timer it never stops: tests, restarts and stop() leave it running. Keep the handle and clear it (only index.ts, the process root, may run timers for the whole life of the process).",
  effectRace:
    "An effect writes a fetched answer to state with no guard: when its inputs change quickly an older answer can land last and show the wrong data (react.dev: fetching data, ignore flag).",
};

/** What an effect starts, and what stops it. */
const EFFECT_PAIRS: [RegExp, RegExp][] = [
  [/\bsetInterval\(/, /\bclearInterval\(/],
  [/\baddEventListener\(/, /\bremoveEventListener\(/],
  [
    /\bnew (WebSocket|EventSource|ResizeObserver|IntersectionObserver|MutationObserver|PerformanceObserver)\(/,
    /\.(close|disconnect)\(/,
  ],
];
/** Words that show a stale answer is dropped (an ignore flag, an abort signal, a sequence number). */
const EFFECT_GUARD =
  /(cancel|closed|alive|active|ignore|stale|abort|mounted|current\b|signal|\blive\b|latest|\bseq\b|token)/i;

/** Every `useEffect(() => { ... }, [deps])` in a file: its line, body and dependency list. */
function effects(text: string): { line: number; body: string; deps?: string }[] {
  const out: { line: number; body: string; deps?: string }[] = [];
  for (const m of text.matchAll(/useEffect\(\s*(?:async\s*)?\(\)\s*=>\s*\{/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < text.length && depth; i++) depth += text[i] === "{" ? 1 : text[i] === "}" ? -1 : 0;
    const deps = text.slice(i, i + 300).match(/^\s*,\s*\[([^\]]*)\]/)?.[1];
    out.push({ line: text.slice(0, m.index).split("\n").length, body: text.slice(start, i - 1), deps });
  }
  return out;
}

/** Server and hub modules with a repeating timer and no clearInterval anywhere in the file. */
export function serverLeaks(list: string[], read = (f: string) => readFileSync(join(ROOT, f), "utf8")): string[] {
  return list
    .filter((f) => /^apps\/(server|hub)\/src\//.test(f) && !/\/index\.ts$/.test(f))
    .filter((f) => {
      const text = read(f);
      return /\bsetInterval\(/.test(text) && !/\bclearInterval\(/.test(text);
    })
    .map((f) => `serverLeak:${f}`);
}

/** Leaking and racing effects in the web app, one finding per effect. */
export function effectFindings(list: string[], read = (f: string) => readFileSync(join(ROOT, f), "utf8")): string[] {
  const out: string[] = [];
  for (const file of list.filter((f) => f.startsWith("apps/web/"))) {
    for (const { body, deps } of effects(read(file))) {
      if (EFFECT_PAIRS.some(([start, stop]) => start.test(body) && !stop.test(body))) out.push(`effectLeak:${file}`);
      // An empty dependency list runs once, so nothing can overtake it.
      const reruns = deps !== undefined && deps.trim() !== "";
      if (reruns && /(\.then\(|await )/.test(body) && /\bset[A-Z]\w*\(/.test(body) && !EFFECT_GUARD.test(body))
        out.push(`effectRace:${file}`);
    }
  }
  return out;
}

type Baseline = { reasons: Record<string, string>; counts: Record<string, number> };

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (/(^|\/)(node_modules|dist|fixtures)$/.test(path)) continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

export function files(): string[] {
  const out: string[] = [];
  for (const group of ["apps", "packages"])
    for (const pkg of readdirSync(join(ROOT, group))) {
      const src = join(ROOT, group, pkg, "src");
      if (statSync(join(ROOT, group, pkg)).isDirectory() && readdirSync(join(ROOT, group, pkg)).includes("src"))
        sources(src, out);
    }
  return out;
}

/** Copy-pasted blocks: the same WINDOW meaningful lines in two places, counted once per place. */
export function duplicates(list: string[], read = (f: string) => readFileSync(join(ROOT, f), "utf8")): string[] {
  const seen = new Map<string, { file: string; line: number }[]>();
  for (const file of list) {
    const lines = read(file)
      .split("\n")
      .map((text, i) => ({ text: text.trim().replace(/\s+/g, " "), line: i + 1 }))
      // Lines that say nothing on their own: braces, imports, comments, a lone name in a list, blank.
      .filter((l) => l.text.length > 3 && !/^(import |export \{|\/\/|\/\*|\*|[)}\]];?,?$|[\w$]+,$)/.test(l.text));
    for (let i = 0; i + WINDOW <= lines.length; i++) {
      const key = createHash("sha1")
        .update(
          lines
            .slice(i, i + WINDOW)
            .map((l) => l.text)
            .join("\n"),
        )
        .digest("hex");
      const at = seen.get(key) ?? [];
      at.push({ file, line: lines[i]?.line ?? 0 });
      seen.set(key, at);
    }
  }
  // Windows that overlap in the same place belong to one copied block.
  const blocks = new Set<string>();
  const last = new Map<string, number>();
  for (const places of seen.values()) {
    if (places.length < 2) continue;
    for (const p of places) {
      const prev = last.get(p.file);
      if (prev === undefined || p.line - prev > WINDOW) blocks.add(`${p.file}:${p.line}`);
      last.set(p.file, Math.max(prev ?? 0, p.line));
    }
  }
  return [...blocks].map((b) => b.slice(0, b.lastIndexOf(":")));
}

function biomeCounts(): Map<string, number> {
  const proc = Bun.spawnSync(
    [
      join(ROOT, "node_modules/.bin/biome"),
      "lint",
      "--config-path=scripts/biome-quality.json",
      "--reporter=json",
      "--max-diagnostics=none",
      "apps",
      "packages",
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const report = JSON.parse(proc.stdout.toString()) as {
    diagnostics: { category: string; location: { path: string } }[];
  };
  const counts = new Map<string, number>();
  for (const d of report.diagnostics) {
    const rule = d.category.split("/").pop() ?? "";
    if (!RULES[rule]) continue;
    const key = `${rule}:${d.location.path}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function measure(): Record<string, number> {
  const counts = biomeCounts();
  const list = files();
  for (const key of [...duplicates(list).map((f) => `duplicate:${f}`), ...effectFindings(list), ...serverLeaks(list)])
    counts.set(key, (counts.get(key) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
}

export function check(now = measure()): { worse: string[]; better: string[] } {
  const base = readBaseline().counts;
  const keys = new Set([...Object.keys(base), ...Object.keys(now)]);
  const worse: string[] = [];
  const better: string[] = [];
  for (const k of keys) {
    const was = base[k] ?? 0;
    const is = now[k] ?? 0;
    if (is > was) worse.push(`${k} ${was} -> ${is}`);
    if (is < was) better.push(`${k} ${was} -> ${is}`);
  }
  return { worse, better };
}

if (import.meta.main) {
  const now = measure();
  if (process.argv.includes("--baseline")) {
    const base = readBaseline();
    base.counts = now;
    writeFileSync(BASELINE, `${JSON.stringify(base, null, 2)}\n`);
    console.log(`wrote ${relative(ROOT, BASELINE)}: ${Object.values(now).reduce((a, b) => a + b, 0)} known findings`);
    process.exit(0);
  }
  const { worse, better } = check(now);
  for (const w of worse) console.log(`x more: ${w} (${RULES[w.split(":")[0] ?? ""]})`);
  for (const b of better) console.log(`x fewer than the baseline, run bun scripts/code-check.ts --baseline: ${b}`);
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  console.log(
    `${total} known findings, ${worse.length + better.length ? `${worse.length + better.length} changes` : "nothing new"}`,
  );
  process.exit(worse.length + better.length ? 1 : 0);
}
