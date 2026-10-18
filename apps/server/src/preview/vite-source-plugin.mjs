/**
 * Igrek's source-mapping plugin for Vite (plan.md Faz 10). In development only, it adds
 * data-gd-src="file:line:column" to every DOM element written in JSX, so clicking an element in
 * the preview tells the AI exactly which file and line to change. It is loaded through Igrek's
 * own config wrapper; the project's vite config is not touched.
 *
 * Plain JavaScript on purpose: it runs inside the project's Vite (Node), not inside Igrek.
 */
import { relative } from "node:path";

const WORD_BEFORE_JSX = new Set(["return", "yield", "await", "default", "case", "else", "do", "in", "of", "typeof"]);
const PUNCT_BEFORE_JSX = "([{,;:?!&|=>+-*%^~";

/** Adds data-gd-src to JSX intrinsic elements. Lines are never added, so line numbers stay right. */
export function addSourceAttrs(code, file) {
  const n = code.length;
  const lineStarts = [0];
  for (let k = 0; k < n; k++) if (code[k] === "\n") lineStarts.push(k + 1);
  const where = (idx) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return `${lo + 1}:${idx - lineStarts[lo] + 1}`;
  };
  const safeFile = file.replace(/["\\]/g, "_");
  let out = "";
  let i = 0;
  const copy = (count) => {
    out += code.slice(i, i + count);
    i += count;
  };
  const skipString = (quote) => {
    copy(1);
    while (i < n && code[i] !== quote) {
      if (code[i] === "\\") copy(2);
      else if (code[i] === "\n" && quote !== "`") return;
      else copy(1);
    }
    copy(1);
  };
  const skipTemplate = () => {
    copy(1);
    while (i < n && code[i] !== "`") {
      if (code[i] === "\\") copy(2);
      else if (code[i] === "$" && code[i + 1] === "{") {
        copy(2);
        parseCode(true);
        copy(1);
      } else copy(1);
    }
    copy(1);
  };
  const prevSignificant = () => {
    let k = i - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    if (k < 0) return { ch: "", word: "" };
    let w = k;
    while (w >= 0 && /[\w$]/.test(code[w])) w--;
    return { ch: code[k], word: code.slice(w + 1, k + 1) };
  };
  const jsxStarts = () => {
    const next = code[i + 1];
    if (!next || !(next === ">" || /[A-Za-z]/.test(next))) return false;
    const prev = prevSignificant();
    const allowed = prev.ch === "" || PUNCT_BEFORE_JSX.includes(prev.ch) || WORD_BEFORE_JSX.has(prev.word);
    if (!allowed) return false;
    // TSX generic arrow functions: <T,>(x) => …  or  <T extends U>(…)
    const m = code.slice(i + 1, i + 80).match(/^([A-Za-z_$][\w$]*)\s*(,|extends\b)/);
    return !m;
  };
  const parseChildren = () => {
    while (i < n) {
      if (code[i] === "<" && code[i + 1] === "/") {
        while (i < n && code[i] !== ">") copy(1);
        copy(1);
        return;
      }
      if (code[i] === "{") {
        copy(1);
        parseCode(true);
        copy(1);
      } else if (code[i] === "<") parseElement();
      else copy(1);
    }
  };
  const parseElement = () => {
    const start = i;
    copy(1);
    if (code[i] === ">") {
      copy(1);
      parseChildren();
      return;
    }
    const name = code.slice(i).match(/^[A-Za-z][\w.:-]*/)?.[0] ?? "";
    copy(name.length);
    const intrinsic = /^[a-z]/.test(name) && !name.includes(".");
    if (intrinsic && !/^\s*[^>]*?data-gd-src=/.test(code.slice(i, i + 200).split(">")[0]))
      out += ` data-gd-src="${safeFile}:${where(start)}"`;
    while (i < n) {
      const ch = code[i];
      if (ch === "/" && code[i + 1] === ">") {
        copy(2);
        return;
      }
      if (ch === ">") {
        copy(1);
        parseChildren();
        return;
      }
      if (ch === "{") {
        copy(1);
        parseCode(true);
        copy(1);
      } else if (ch === '"' || ch === "'") skipString(ch);
      else copy(1);
    }
  };
  function parseCode(insideBraces) {
    let depth = 0;
    while (i < n) {
      const ch = code[i];
      if (insideBraces && ch === "}" && depth === 0) return;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (ch === '"' || ch === "'") skipString(ch);
      else if (ch === "`") skipTemplate();
      else if (ch === "/" && code[i + 1] === "/") {
        while (i < n && code[i] !== "\n") copy(1);
      } else if (ch === "/" && code[i + 1] === "*") {
        const end = code.indexOf("*/", i + 2);
        copy(end < 0 ? n - i : end + 2 - i);
      } else if (ch === "<" && jsxStarts()) parseElement();
      else copy(1);
    }
  }
  parseCode(false);
  return out;
}

export default function igrekSource(options = {}) {
  const root = options.root ?? process.cwd();
  return {
    name: "igrek-source",
    enforce: "pre",
    apply: "serve",
    transform(code, id) {
      const path = id.split("?")[0];
      if (!/\.(jsx|tsx)$/.test(path) || path.includes("/node_modules/")) return null;
      try {
        return { code: addSourceAttrs(code, relative(root, path)), map: null };
      } catch {
        return null;
      }
    },
  };
}
