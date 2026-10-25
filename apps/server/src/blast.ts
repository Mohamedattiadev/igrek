import { readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * What else a change could break (after pstack's blast-radius): the files that import a changed
 * file, read from their import lines (JavaScript and TypeScript), with the tests among them first.
 * Shown before a copy is merged, so the user knows which tests matter. No model is asked.
 */
export interface Affected {
  path: string;
  /** Which changed file it uses. */
  uses: string;
  test: boolean;
}

const CODE = /\.(m?[jt]sx?|cjs|cts|mts)$/;
const TEST = /(\.|_)(test|spec)\.[^.]+$|(^|\/)(__tests__|tests?)\//;
const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
const MAX_FILES = 6000;
const MAX_SIZE = 400_000;

/** "src/a/b.ts" -> "src/a/b" (and "src/a/index.ts" -> "src/a"), the forms an import can name it by. */
function names(path: string): string[] {
  const bare = path.replace(CODE, "");
  return bare.endsWith("/index") ? [bare, bare.slice(0, -"/index".length)] : [bare];
}

export function affectedBy(files: string[], changed: string[], read: (path: string) => string | undefined): Affected[] {
  const targets = new Map<string, string>();
  for (const c of changed.filter((p) => CODE.test(p))) for (const n of names(c)) targets.set(n, c);
  if (!targets.size) return [];
  const changedSet = new Set(changed);
  const out: Affected[] = [];
  for (const file of files.filter((f) => CODE.test(f) && !changedSet.has(f)).slice(0, MAX_FILES)) {
    const text = read(file);
    if (!text) continue;
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? "";
      const resolved = normalize(join(dirname(file), spec)).replace(CODE, "");
      const hit = targets.get(resolved);
      if (hit) {
        out.push({ path: file, uses: hit, test: TEST.test(file) });
        break;
      }
    }
  }
  return out.sort((a, b) => Number(b.test) - Number(a.test) || a.path.localeCompare(b.path));
}

/** The repo's tracked files, read from disk (skipping big ones). */
export function blastRadius(root: string, changed: string[]): Affected[] {
  const listed = Bun.spawnSync(["git", "-C", root, "ls-files"], { stdout: "pipe", stderr: "ignore" });
  const files = listed.exitCode === 0 ? listed.stdout.toString().split("\n").filter(Boolean) : [];
  return affectedBy(files, changed, (path) => {
    try {
      const full = join(root, path);
      return statSync(full).size > MAX_SIZE ? undefined : readFileSync(full, "utf8");
    } catch {
      return undefined;
    }
  });
}
