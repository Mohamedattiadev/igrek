import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";

// Bundled locally: no CDN, works offline (plan.md principle 1).
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

/** Monaco only accepts #rrggbb(aa); expand short hex and drop anything else. */
function cssVar(name: string): string | undefined {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase();
  const short = raw.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(raw) ? raw : undefined;
}

/** Editor themes built from the app's color tokens, so it matches light and dark mode. */
export function applyMonacoTheme(): void {
  const dark = document.documentElement.dataset.theme === "dark";
  monaco.editor.defineTheme("igrek", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: Object.fromEntries(
      Object.entries({
        "editor.background": cssVar("--bg"),
        "editor.foreground": cssVar("--fg"),
        "editorLineNumber.foreground": cssVar("--fg-subtle"),
        "editorLineNumber.activeForeground": cssVar("--fg-muted"),
        "editor.lineHighlightBackground": cssVar("--bg-subtle"),
        "editorCursor.foreground": cssVar("--accent"),
        "editorGutter.background": cssVar("--bg"),
        "editorWidget.background": cssVar("--bg-subtle"),
        "editorWidget.border": cssVar("--border"),
        "minimap.background": cssVar("--bg"),
      }).filter((entry): entry is [string, string] => !!entry[1]),
    ),
  });
  monaco.editor.setTheme("igrek");
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  xml: "xml",
  svg: "xml",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  lua: "lua",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
  env: "ini",
  graphql: "graphql",
  gql: "graphql",
  dart: "dart",
  r: "r",
  scala: "scala",
  tf: "hcl",
};

export function languageFor(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name === "makefile") return "plaintext";
  return LANGUAGES[name.split(".").pop() ?? ""] ?? "plaintext";
}

export { monaco };
