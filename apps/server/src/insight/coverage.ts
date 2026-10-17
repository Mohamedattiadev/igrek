import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import type { CoverageMap } from "@godeye/core";
import { CODE, isGenerated, TEST_FILE } from "./checks";
import type { Snapshot } from "./snapshot";

const REPORTS = ["coverage/lcov.info", "coverage/coverage-summary.json", "lcov.info", "coverage.json"];
const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".py", "/index.ts", "/index.tsx", "/index.js"];

/** Folder a file is counted under: the first three levels (apps/server/src). */
function folderOf(path: string): string {
  const parts = path.split("/").slice(0, -1);
  return parts.slice(0, 3).join("/") || ".";
}

type FileCov = { lines: number; covered: number };

/** lcov.info: SF (file), LF (lines found), LH (lines hit). */
export function parseLcov(text: string, root: string): Map<string, FileCov> {
  const out = new Map<string, FileCov>();
  let file: string | undefined;
  let found = 0;
  let hit = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      const raw = line.slice(3).trim();
      file = raw.startsWith("/") ? relative(root, raw) : normalize(raw);
      found = 0;
      hit = 0;
    } else if (line.startsWith("LF:")) found = Number(line.slice(3)) || 0;
    else if (line.startsWith("LH:")) hit = Number(line.slice(3)) || 0;
    else if (line.startsWith("end_of_record") && file) {
      out.set(file, { lines: found, covered: hit });
      file = undefined;
    }
  }
  return out;
}

/** istanbul coverage-summary.json: { "<file>": { lines: { total, covered } } }. */
export function parseSummary(text: string, root: string): Map<string, FileCov> {
  const out = new Map<string, FileCov>();
  const json = JSON.parse(text) as Record<string, { lines?: { total?: number; covered?: number } }>;
  for (const [key, value] of Object.entries(json)) {
    if (key === "total" || !value?.lines) continue;
    out.set(key.startsWith("/") ? relative(root, key) : normalize(key), {
      lines: value.lines.total ?? 0,
      covered: value.lines.covered ?? 0,
    });
  }
  return out;
}

/** Where a test points: its relative imports, and the file it is named after. */
function testTargets(test: { path: string; text?: string }, known: Set<string>): string[] {
  const out = new Set<string>();
  const dir = dirname(test.path);
  for (const m of (test.text ?? "").matchAll(
    /(?:from\s+|require\(\s*|import\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g,
  )) {
    const base = normalize(join(dir, m[1] as string));
    for (const ext of RESOLVE_EXT) if (known.has(base + ext)) out.add(base + ext);
  }
  for (const m of (test.text ?? "").matchAll(/^\s*from\s+([\w.]+)\s+import|^\s*import\s+([\w.]+)/gm)) {
    const mod = (m[1] ?? m[2] ?? "").replace(/\./g, "/");
    for (const candidate of [`${mod}.py`, `${mod}/__init__.py`, join(dirname(dir), `${mod}.py`)])
      if (known.has(candidate)) out.add(candidate);
  }
  // foo.test.ts → foo.ts (same folder or the folder above a tests/ folder); test_foo.py → foo.py; foo_test.go → foo.go
  const name = test.path.split("/").pop() ?? "";
  const stem = name
    .replace(/\.(test|spec)(\.[a-z]+)$/i, "$2")
    .replace(/^test_(.+\.py)$/i, "$1")
    .replace(/_test\.(go|py)$/i, ".$1");
  if (stem !== name)
    for (const folder of [dir, dirname(dir), dir.replace(/(^|\/)(__tests__|tests?|spec)$/, "")]) {
      const candidate = folder && folder !== "." ? `${folder}/${stem}` : stem;
      if (known.has(candidate)) out.add(candidate);
    }
  return [...out];
}

/**
 * Which code has tests. The project's own coverage report is used when there is one
 * (exact line numbers); otherwise a file counts as tested when a test imports it or is named after it.
 */
export function coverageMap(snap: Snapshot): CoverageMap {
  const code = snap.files.filter((f) => CODE.test(f.path) && !TEST_FILE.test(f.path) && !isGenerated(f));
  const known = new Set(code.map((f) => f.path));
  const report = REPORTS.find((r) => existsSync(join(snap.root, r)));
  if (report) {
    try {
      const text = readFileSync(join(snap.root, report), "utf8");
      const cov = report.endsWith(".json") ? parseSummary(text, snap.root) : parseLcov(text, snap.root);
      if (cov.size) return fromReport(code, cov, report);
    } catch {
      // unreadable report: fall back to the static map
    }
  }
  const tested = new Set<string>();
  for (const test of snap.files.filter((f) => TEST_FILE.test(f.path) && CODE.test(f.path)))
    for (const target of testTargets(test, known)) tested.add(target);
  const folders = new Map<string, { files: number; tested: number }>();
  for (const f of code) {
    const entry = folders.get(folderOf(f.path)) ?? { files: 0, tested: 0 };
    entry.files++;
    if (tested.has(f.path)) entry.tested++;
    folders.set(folderOf(f.path), entry);
  }
  return {
    source: "static",
    files: code.length,
    tested: code.filter((f) => tested.has(f.path)).length,
    folders: [...folders.entries()]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 40),
    untested: code
      .filter((f) => !tested.has(f.path))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 15)
      .map((f) => ({ path: f.path, lines: f.lines })),
    at: Date.now(),
  };
}

function fromReport(code: { path: string; lines: number }[], cov: Map<string, FileCov>, report: string): CoverageMap {
  const folders = new Map<string, { files: number; tested: number; lines: number; covered: number }>();
  let lines = 0;
  let covered = 0;
  for (const f of code) {
    const c = cov.get(f.path);
    const entry = folders.get(folderOf(f.path)) ?? { files: 0, tested: 0, lines: 0, covered: 0 };
    entry.files++;
    if (c && c.covered > 0) entry.tested++;
    // A file the report never loaded counts as fully uncovered.
    const fileLines = c?.lines ?? f.lines;
    entry.lines += fileLines;
    entry.covered += c?.covered ?? 0;
    lines += fileLines;
    covered += c?.covered ?? 0;
    folders.set(folderOf(f.path), entry);
  }
  return {
    source: "report",
    report,
    files: code.length,
    tested: code.filter((f) => (cov.get(f.path)?.covered ?? 0) > 0).length,
    percent: lines ? Math.round((covered / lines) * 100) : 0,
    folders: [...folders.entries()]
      .map(([path, v]) => ({
        path,
        files: v.files,
        tested: v.tested,
        percent: v.lines ? Math.round((v.covered / v.lines) * 100) : 0,
      }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 40),
    untested: code
      .filter((f) => !(cov.get(f.path)?.covered ?? 0))
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 15)
      .map((f) => ({ path: f.path, lines: f.lines })),
    at: Date.now(),
  };
}
