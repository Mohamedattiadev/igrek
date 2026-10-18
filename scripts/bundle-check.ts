/**
 * Bundle budget (plan.md 15.4): what the first screen downloads, gzipped, read from the built
 * index.html (its script and the modules it preloads). Run after `bun run build`; fails when the
 * budget in bundle-budget.json is exceeded, and asks for a lower budget when there is room
 * (the "ratchet": the first screen may only get lighter).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dir, "..");
const DIST = join(ROOT, "apps/web/dist");
export const BUDGET = join(import.meta.dir, "bundle-budget.json");
/** Room to grow before the budget must come down: small changes should not need an edit each. */
const SLACK = 0.05;

export function firstScreen(html = readFileSync(join(DIST, "index.html"), "utf8")): { js: number; css: number } {
  const size = (path: string) => gzipSync(readFileSync(join(DIST, path))).length;
  const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(js|css))"/g)].map((m) => m[1] ?? "");
  return {
    js: files.filter((f) => f.endsWith(".js")).reduce((n, f) => n + size(f), 0),
    css: files.filter((f) => f.endsWith(".css")).reduce((n, f) => n + size(f), 0),
  };
}

if (import.meta.main) {
  const now = firstScreen();
  const kb = (n: number) => Math.ceil(n / 1024);
  if (process.argv.includes("--set")) {
    const budget = { jsGzipKb: Math.ceil(kb(now.js) * (1 + SLACK)), cssGzipKb: Math.ceil(kb(now.css) * (1 + SLACK)) };
    writeFileSync(BUDGET, `${JSON.stringify(budget, null, 2)}\n`);
    console.log(`budget set: ${budget.jsGzipKb} KB JS, ${budget.cssGzipKb} KB CSS (gzip)`);
    process.exit(0);
  }
  const budget = JSON.parse(readFileSync(BUDGET, "utf8")) as { jsGzipKb: number; cssGzipKb: number };
  const problems: string[] = [];
  for (const [what, size, limit] of [
    ["JS", kb(now.js), budget.jsGzipKb],
    ["CSS", kb(now.css), budget.cssGzipKb],
  ] as const) {
    if (size > limit) problems.push(`x first-screen ${what} is ${size} KB gzip, over the ${limit} KB budget`);
    else if (size < limit / (1 + SLACK) ** 2)
      problems.push(
        `x first-screen ${what} is ${size} KB, well under ${limit} KB: run bun scripts/bundle-check.ts --set`,
      );
  }
  for (const p of problems) console.log(p);
  console.log(
    `first screen: ${kb(now.js)} KB JS, ${kb(now.css)} KB CSS (gzip)${problems.length ? "" : ", within budget"}`,
  );
  process.exit(problems.length ? 1 : 0);
}
