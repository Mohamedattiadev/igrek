/**
 * Code quality rules as code (plan.md 15.1): too complex or too long functions, too many
 * parameters, swallowed errors (empty blocks), promises nobody waits for, and copy-pasted blocks.
 * Biome measures most of it with the rules in scripts/biome-quality.json; copies are found here.
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
    "Code that is hard to follow hides bugs; split it (refactoring.guru: Extract Method, Decompose Conditional).",
  noExcessiveLinesPerFunction: "Long Method smell (refactoring.guru): split it into named steps.",
  useMaxParams: "Long Parameter List smell (refactoring.guru): pass an object (Introduce Parameter Object).",
  noEmptyBlockStatements:
    "An empty block swallows an error or hides unfinished code; say why in a comment or handle it.",
  noFloatingPromises: "A promise nobody waits for loses its error; await it, catch it, or mark it with void.",
  noMisusedPromises: "A promise used where a boolean or a plain callback is expected.",
  duplicate: "Duplicate Code smell (refactoring.guru): the same lines in two places drift apart; extract them once.",
};

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
  for (const file of duplicates(files())) counts.set(`duplicate:${file}`, (counts.get(`duplicate:${file}`) ?? 0) + 1);
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
