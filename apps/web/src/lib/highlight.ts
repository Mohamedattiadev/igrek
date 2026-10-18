import type { HighlighterCore, LanguageInput } from "shiki/core";
import { Lru } from "./lru";

/**
 * Syntax highlighting like VS Code (its Light+ and Dark+ themes, TextMate grammars) for every
 * read-only code block: cheatsheets, roadmaps, chat answers, previews. Shiki and each language load
 * only when first needed; both themes are rendered at once and CSS picks one by data-theme.
 */
const LANGS: Record<string, () => Promise<{ default: LanguageInput }>> = {
  sh: () => import("shiki/langs/shellscript.mjs"),
  ts: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  js: () => import("shiki/langs/jsx.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  py: () => import("shiki/langs/python.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  cs: () => import("shiki/langs/csharp.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  nginx: () => import("shiki/langs/nginx.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  vim: () => import("shiki/langs/viml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  ini: () => import("shiki/langs/ini.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  md: () => import("shiki/langs/markdown.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  makefile: () => import("shiki/langs/makefile.mjs"),
  hcl: () => import("shiki/langs/hcl.mjs"),
  prisma: () => import("shiki/langs/prisma.mjs"),
  dotenv: () => import("shiki/langs/dotenv.mjs"),
};

/** Other names for the same languages (Markdown fences, file extensions). */
const ALIAS: Record<string, string> = {
  bash: "sh",
  shell: "sh",
  shellscript: "sh",
  zsh: "sh",
  console: "sh",
  terminal: "sh",
  typescript: "ts",
  mts: "ts",
  cts: "ts",
  javascript: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  python: "py",
  golang: "go",
  rs: "rust",
  csharp: "cs",
  "c#": "cs",
  yml: "yaml",
  jsonc: "json",
  json5: "json",
  docker: "dockerfile",
  containerfile: "dockerfile",
  htm: "html",
  svg: "xml",
  viml: "vim",
  markdown: "md",
  patch: "diff",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  h: "c",
  hpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  gql: "graphql",
  ps1: "powershell",
  make: "makefile",
  tf: "hcl",
  terraform: "hcl",
  env: "dotenv",
  psql: "sql",
  postgres: "sql",
  sqlite: "sql",
};

export function langKey(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  const key = lang.toLowerCase().trim();
  const name = ALIAS[key] ?? key;
  return LANGS[name] ? name : undefined;
}

/** The grammar's own name in Shiki for our short keys. */
const GRAMMAR: Record<string, string> = {
  sh: "shellscript",
  ts: "typescript",
  js: "jsx",
  py: "python",
  cs: "csharp",
  vim: "viml",
  md: "markdown",
};

let core: Promise<HighlighterCore> | undefined;
const loaded = new Map<string, Promise<void>>();
const cache = new Lru<string>(500);

function highlighter(): Promise<HighlighterCore> {
  core ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/light-plus.mjs"),
    import("shiki/themes/dark-plus.mjs"),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark]) =>
    createHighlighterCore({ themes: [light.default, dark.default], langs: [], engine: createJavaScriptRegexEngine() }),
  );
  return core;
}

/** HTML for the code with both themes as CSS variables; undefined for a language we don't color. */
export async function highlight(code: string, lang: string | undefined): Promise<string | undefined> {
  const name = langKey(lang);
  if (!name || code.length > 200_000) return undefined;
  const key = `${name}\u0000${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = await highlighter();
  const load = LANGS[name];
  if (load && !loaded.has(name))
    loaded.set(
      name,
      load().then((m) => h.loadLanguage(m.default)),
    );
  await loaded.get(name);
  const html = h.codeToHtml(code, {
    lang: GRAMMAR[name] ?? name,
    themes: { light: "light-plus", dark: "dark-plus" },
    defaultColor: false,
  });
  cache.set(key, html);
  return html;
}

/**
 * Loads Shiki and the most common grammars while the browser is idle, so the first code block
 * of a streaming answer does not stall the page.
 */
export function warmHighlighter(langs: string[] = ["ts", "sh", "py"]): void {
  const run = () => {
    // A real line, not an empty string: the grammar's patterns are only built when they run.
    for (const lang of langs) void highlight('const a = f("x", 1); // b\nif (a) { return [a]; }', lang);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 500);
}

/** The colors for code that was highlighted before, right away, so a redrawn block does not flash. */
export function highlightCached(code: string, lang: string | undefined): string | undefined {
  const name = langKey(lang);
  return name ? cache.get(`${name}\u0000${code}`) : undefined;
}
