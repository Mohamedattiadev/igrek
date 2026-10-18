import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { RenderAdvice, RenderMode } from "@igrek/core";

/**
 * Render strategy per page for Next.js projects (plan.md 15.4): how each page renders today,
 * read from the code, and a suggestion when another strategy fits better, with the evidence.
 * The rules follow the Next.js docs: static by default, ISR when data changes on a schedule,
 * dynamic when the page reads the request (cookies, headers, the signed-in user), and data
 * fetched in the browser only when nothing needs it in the first HTML.
 */

const PAGE = /^(page|index|\[\[?\.\.\.[^\]]+\]\]?|\[[^\]]+\]|[\w-]+)\.(tsx|jsx|ts|js)$/;
const SKIP = /^(node_modules|\.next|dist|build|out|\.git|api)$/;

interface Signals {
  client: boolean;
  /** Reads who is asking: cookies, headers, draft mode. */
  requestApis: boolean;
  /** Reads the query string: dynamic, but the same for everyone with the same URL. */
  searchParams: boolean;
  signedIn: boolean;
  noStore: boolean;
  forceDynamic: boolean;
  forceStatic: boolean;
  revalidate: boolean;
  staticParams: boolean;
  dynamicSegment: boolean;
  effectFetch: boolean;
  serverProps: boolean;
  staticProps: boolean;
  serverFetch: boolean;
  loading: boolean;
}

function signalsOf(code: string, extra: { dynamicSegment: boolean; loading: boolean }): Signals {
  return {
    client: /^\s*["']use client["']/.test(code),
    requestApis: /\b(cookies|headers|draftMode)\s*\(\s*\)/.test(code),
    searchParams: /\bsearchParams\b/.test(code),
    signedIn: /\b(auth|getServerSession|currentUser|getSession|getUser)\s*\(/.test(code),
    noStore: /cache:\s*["']no-store["']|\bnoStore\s*\(|unstable_noStore/.test(code),
    forceDynamic: /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(code),
    forceStatic: /export\s+const\s+dynamic\s*=\s*["']force-static["']/.test(code),
    revalidate: /export\s+const\s+revalidate\s*=\s*\d+|next:\s*\{\s*revalidate:\s*\d+/.test(code),
    staticParams: /export\s+(async\s+)?function\s+generateStaticParams|getStaticPaths/.test(code),
    dynamicSegment: extra.dynamicSegment,
    effectFetch: /useEffect\s*\([\s\S]{0,400}?\b(fetch|axios|useQuery)\b/.test(code) || /\buseSWR\s*\(/.test(code),
    serverProps: /export\s+(async\s+)?function\s+getServerSideProps|export\s+const\s+getServerSideProps/.test(code),
    staticProps: /export\s+(async\s+)?function\s+getStaticProps|export\s+const\s+getStaticProps/.test(code),
    serverFetch: !/^\s*["']use client["']/.test(code) && /\bawait\s+(fetch|db\.|prisma\.|sql`|query\()/.test(code),
    loading: extra.loading,
  };
}

/** How the page renders today. */
function currentOf(s: Signals): RenderMode {
  if (s.serverProps || s.forceDynamic || s.requestApis || s.searchParams || s.noStore || s.signedIn) return "ssr";
  if (s.revalidate) return "isr";
  if (s.client && s.effectFetch) return "csr";
  return "ssg";
}

/** A better fit, if there is one, and why (each reason is an i18n key). */
function suggestionOf(s: Signals, current: RenderMode): { suggested?: RenderMode; reasons: string[] } {
  const personal = s.signedIn || s.requestApis;
  if (current === "csr" && !personal)
    return { suggested: s.revalidate ? "isr" : "ssg", reasons: ["browserFetchPublic"] };
  if (current === "ssr" && !personal && s.noStore && !s.forceDynamic && !s.serverProps)
    return { suggested: "isr", reasons: ["dynamicNotPersonal"] };
  if (current === "ssr" && s.serverProps && !personal) return { suggested: "isr", reasons: ["serverPropsPublic"] };
  if (current === "ssr" && personal && !s.loading && !s.serverProps) return { reasons: ["streamWithLoading"] };
  if ((current === "ssg" || current === "isr") && s.dynamicSegment && !s.staticParams && s.serverFetch)
    return { reasons: ["preRenderParams"] };
  if (current === "ssg" && s.serverFetch && !s.revalidate && !s.forceStatic)
    return { suggested: "isr", reasons: ["staticDataGoesStale"] };
  return { reasons: [] };
}

function routeOf(file: string, router: "app" | "pages"): string {
  const parts = file.split(sep).slice(0, router === "app" ? -1 : undefined);
  const segs = parts
    .map((p) => p.replace(/\.(tsx|jsx|ts|js)$/, ""))
    .filter((p) => !/^\(.*\)$/.test(p) && !(router === "pages" && p === "index"))
    .map((p) => p.replace(/^\[\[?\.\.\.([^\]]+)\]\]?$/, ":$1*").replace(/^\[([^\]]+)\]$/, ":$1"));
  return `/${segs.join("/")}`;
}

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 12) return out;
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (SKIP.test(name) || name.startsWith("_")) continue;
    const path = join(dir, name);
    try {
      if (statSync(path).isDirectory()) walk(path, out, depth + 1);
      else out.push(path);
    } catch {
      // Gone.
    }
  }
  return out;
}

/** A loading.tsx in the page's folder or a parent (a streaming boundary for the page). */
function hasLoading(folder: string, top: string): boolean {
  for (let dir = folder; dir.startsWith(top); dir = dirname(dir)) {
    if (["tsx", "jsx", "js"].some((ext) => existsSync(join(dir, `loading.${ext}`)))) return true;
    if (dir === top) break;
  }
  return false;
}

/** One page's advice, or nothing when the file is not a page. */
function adviceFor(path: string, dir: string, router: "app" | "pages"): RenderAdvice | undefined {
  const rel = relative(dir, path);
  const name = rel.split(sep).pop() ?? "";
  if (router === "app" ? !/^page\.(tsx|jsx|ts|js)$/.test(name) : !PAGE.test(name)) return undefined;
  let code = "";
  try {
    code = readFileSync(path, "utf8").slice(0, 200_000);
  } catch {
    return undefined;
  }
  const loading = router === "app" && hasLoading(dirname(path), dir);
  const signals = signalsOf(code, { dynamicSegment: /\[[^\]]+\]/.test(rel), loading });
  const current = currentOf(signals);
  const { suggested, reasons } = suggestionOf(signals, current);
  return {
    route: routeOf(rel, router),
    file: path,
    current,
    ...(suggested && suggested !== current ? { suggested } : {}),
    reasons,
    evidence: Object.entries(signals)
      .filter(([, on]) => on)
      .map(([k]) => k),
  };
}

/** Pages of a Next.js project (app and pages routers), with their render strategy. */
export function renderAdvice(root: string, limit = 80): RenderAdvice[] {
  const out: RenderAdvice[] = [];
  for (const [router, base] of [
    ["app", "app"],
    ["app", "src/app"],
    ["pages", "pages"],
    ["pages", "src/pages"],
  ] as const) {
    const dir = join(root, base);
    for (const path of walk(dir)) {
      const advice = adviceFor(path, dir, router);
      if (advice) out.push({ ...advice, file: relative(root, path) });
      if (out.length >= limit) break;
    }
  }
  const actionable = (a: RenderAdvice) => Number(!!a.suggested || a.reasons.length > 0);
  return out.sort((a, b) => actionable(b) - actionable(a));
}
