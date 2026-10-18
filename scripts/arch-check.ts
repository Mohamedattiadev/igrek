/**
 * Architecture rules as code (plan.md 15.2): who may import whom, and no import cycles. Runs with
 * `bun run lint:arch` and in CI. It reads imports with Bun's own transpiler, so it needs no
 * TypeScript compiler (God Eye is on TypeScript 7, which has no JS API for tools to use).
 *
 * The rules follow the layered pattern (Mark Richards, "Software Architecture Patterns", ch. 1):
 * shared packages are the bottom layer, the apps sit on top, and the web UI talks to the server
 * only over HTTP. Each rule says why it exists.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
const SKIP = /(^|\/)(node_modules|dist|fixtures)(\/|$)/;
const TEST = /\.test\.tsx?$/;

interface Rule {
  name: string;
  why: string;
  from: RegExp;
  to: RegExp;
}

export const RULES: Rule[] = [
  {
    name: "packages-stay-below-apps",
    why: "Shared packages are the bottom layer: they must not know about any app.",
    from: /^packages\//,
    to: /^apps\//,
  },
  {
    name: "ui-not-into-server",
    why: "The web UI reaches the server only over HTTP and WebSocket, never by importing its code.",
    from: /^apps\/web\//,
    to: /^apps\/(server|hub)\//,
  },
  {
    name: "server-not-into-ui",
    why: "The server must run without the UI's or the hub's code; shared types live in packages/core.",
    from: /^apps\/server\//,
    to: /^apps\/(web|hub)\//,
  },
  {
    name: "hub-on-its-own",
    why: "The team hub is deployed alone; it may use shared packages only.",
    from: /^apps\/hub\//,
    to: /^apps\/(web|server)\//,
  },
  {
    name: "no-database-in-ui",
    why: "Only the server opens the database.",
    from: /^apps\/web\//,
    to: /^(bun:sqlite|drizzle-orm)/,
  },
];

/** Workspace packages by name, with their entry files ("@igrek/learn/load" → its load.ts). */
function workspaces(): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of ["apps", "packages"])
    for (const dir of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, dir, "package.json");
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, "utf8")) as { name: string; exports?: Record<string, string> };
      for (const [sub, target] of Object.entries(pkg.exports ?? {}))
        map.set(sub === "." ? pkg.name : `${pkg.name}/${sub.slice(2)}`, join(group, dir, target));
    }
  return map;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.test(relative(ROOT, path))) continue;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (SOURCE.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

/** Every source file of the apps and packages, relative to the repo. */
export function sourceFiles(): string[] {
  return ["apps", "packages"].flatMap((d) => walk(join(ROOT, d)));
}

function resolveFile(from: string, spec: string): string | undefined {
  const base = join(dirname(from), spec);
  for (const candidate of [base, ...[".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"].map((e) => base + e)])
    if (existsSync(join(ROOT, candidate)) && statSync(join(ROOT, candidate)).isFile()) return candidate;
  return undefined;
}

/**
 * Each file's imports. Static runtime imports can form cycles; a lazy `import()` cannot (the
 * module is loaded after both are ready), and type-only imports vanish at runtime. All of them
 * count for the layer rules.
 */
export function graph(files: string[]): Map<string, { runtime: Set<string>; all: Set<string> }> {
  const packages = workspaces();
  const transpiler = new Bun.Transpiler({ loader: "tsx" });
  const out = new Map<string, { runtime: Set<string>; all: Set<string> }>();
  for (const file of files) {
    const code = readFileSync(join(ROOT, file), "utf8");
    const runtime = new Set<string>();
    const all = new Set<string>();
    const target = (spec: string) =>
      spec.startsWith(".") ? resolveFile(file, spec) : (packages.get(spec) ?? spec.replace(/^node:/, "node:"));
    let imports: { path: string; kind: string }[] = [];
    try {
      imports = transpiler.scanImports(code);
    } catch {
      // Not parseable as TS/JS (a template file): no imports to follow.
    }
    for (const { path, kind } of imports) {
      const to = target(path);
      if (!to) continue;
      if (kind !== "dynamic-import") runtime.add(to);
      all.add(to);
    }
    for (const m of code.matchAll(/^\s*(?:import|export)\s+type\s[^;]*?from\s+["']([^"']+)["']/gm)) {
      const to = target(m[1] ?? "");
      if (to) all.add(to);
    }
    out.set(file, { runtime, all });
  }
  return out;
}

/** Import cycles (Tarjan's strongly connected components), each as a list of files. */
export function cycles(edges: Map<string, Set<string>>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const on = new Set<string>();
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const found: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!edges.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v) ?? 0, idx.get(w) ?? 0));
    }
    if (low.get(v) === idx.get(v)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          on.delete(w);
          scc.push(w);
        }
      } while (w && w !== v);
      if (scc.length > 1 || (edges.get(v)?.has(v) ?? false)) found.push(scc.sort());
    }
  };
  for (const v of edges.keys()) if (!idx.has(v)) visit(v);
  return found;
}

export function check(files: string[]): { violations: string[]; cycles: string[][] } {
  const g = graph(files);
  const violations: string[] = [];
  for (const [file, { all }] of g) {
    // Tests may cross layers on purpose: the sync tests start a real hub next to the server.
    if (TEST.test(file)) continue;
    for (const to of all)
      for (const rule of RULES)
        if (rule.from.test(file) && rule.to.test(to)) violations.push(`${rule.name}: ${file} -> ${to} (${rule.why})`);
  }
  const runtime = new Map([...g].map(([file, e]) => [file, e.runtime]));
  return { violations, cycles: cycles(runtime) };
}

if (import.meta.main) {
  const files = sourceFiles();
  const { violations, cycles: loops } = check(files);
  for (const v of violations) console.log(`x ${v}`);
  for (const loop of loops) console.log(`x no-circular: ${loop.join(" -> ")}`);
  console.log(
    `${files.length} files, ${violations.length} layer violations, ${loops.length} import cycles` +
      (violations.length + loops.length ? "" : ": all rules hold"),
  );
  process.exit(violations.length + loops.length ? 1 : 0);
}
