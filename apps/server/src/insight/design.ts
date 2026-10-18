import type { DesignFinding } from "@igrek/core";
import type { Snapshot } from "./snapshot";

/**
 * Design patterns and SOLID in a project's code (plan.md 15.2), by pattern matching: patterns used
 * where they add nothing (Singletons everywhere, an interface with a single implementation) and
 * places where one would help (a long switch on a type), plus the SOLID breaks that show in the
 * text (a subclass refusing what it inherits, a class doing everything, services built inside
 * constructors). Every finding links to its refactoring.guru or Wikipedia page.
 */

const CODE = /\.(ts|tsx|js|jsx|mjs|java|kt|cs|php|py|rb|go|swift)$/;
const TEST = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z]+$/;
const BIG_CLASS_LINES = 600;
const SWITCH_CASES = 8;

/** Line number of an index in a text. */
const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;

/** The body of the block that starts at `open` (the index of its "{"). */
function blockAt(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

function singletons(path: string, text: string): DesignFinding[] {
  const m = text.match(
    /\b(static\s+(getInstance|instance)\b|private\s+static\s+\w*\s*instance\b|_instance\s*=\s*None)/,
  );
  return m?.index !== undefined ? [{ rule: "singleton", file: path, line: lineAt(text, m.index) }] : [];
}

function bigSwitches(path: string, text: string): DesignFinding[] {
  const out: DesignFinding[] = [];
  for (const m of text.matchAll(/\bswitch\s*\(([^)]*)\)\s*\{/g)) {
    const body = blockAt(text, (m.index ?? 0) + m[0].length - 1);
    const cases = (body.match(/\bcase\s/g) ?? []).length;
    if (cases >= SWITCH_CASES && /\b(type|kind|status|mode|role|action)\b/i.test(m[1] ?? ""))
      out.push({ rule: "bigSwitch", file: path, line: lineAt(text, m.index ?? 0), detail: String(cases) });
  }
  return out;
}

function refusedBequest(path: string, text: string): DesignFinding[] {
  if (!/\bclass\s+\w+[^{]*\b(extends|implements)\b|^class\s+\w+\(\w[\w.]*\):/m.test(text)) return [];
  // An abstract method that throws is the base class saying "subclasses fill this in": fine.
  const refusals =
    /(throw\s+new\s+\w*Error\(\s*["'`][^"'`]*not\s+(implemented|supported)|raise\s+NotImplementedError|throw\s+new\s+UnsupportedOperationException)/gi;
  for (const m of text.matchAll(refusals)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 240), m.index);
    if (!/@abstractmethod|\babstract\s/.test(before))
      return [{ rule: "refusedBequest", file: path, line: lineAt(text, m.index ?? 0) }];
  }
  return [];
}

function godClasses(path: string, text: string): DesignFinding[] {
  const out: DesignFinding[] = [];
  for (const m of text.matchAll(/\bclass\s+(\w+)[^{]*\{/g)) {
    const lines = blockAt(text, (m.index ?? 0) + m[0].length - 1).split("\n").length;
    if (lines >= BIG_CLASS_LINES)
      out.push({ rule: "godClass", file: path, line: lineAt(text, m.index ?? 0), detail: `${m[1]} (${lines})` });
  }
  return out;
}

function hardDependencies(path: string, text: string): DesignFinding[] {
  const ctor = text.match(/\bconstructor\s*\([^)]*\)\s*\{/);
  if (ctor?.index === undefined) return [];
  const body = blockAt(text, ctor.index + ctor[0].length - 1);
  const made = [...body.matchAll(/=\s*new\s+(\w+(Service|Repository|Client|Gateway|Store|Api))\s*\(/g)].map(
    (m) => m[1],
  );
  return made.length
    ? [{ rule: "hardDependency", file: path, line: lineAt(text, ctor.index), detail: made.slice(0, 3).join(", ") }]
    : [];
}

/** Interfaces that exactly one class implements: an abstraction nothing else needs (yet). */
function singleImplementations(files: { path: string; text: string }[]): DesignFinding[] {
  const declared = new Map<string, { file: string; line: number }>();
  const uses = new Map<string, number>();
  for (const f of files) {
    for (const m of f.text.matchAll(
      /\binterface\s+(I?[A-Z]\w*(Strategy|Provider|Service|Repository|Handler|Factory|Policy)?)\b/g,
    ))
      if (m[1]) declared.set(m[1], { file: f.path, line: lineAt(f.text, m.index ?? 0) });
    for (const m of f.text.matchAll(/\bimplements\s+([\w\s,<>]+?)\s*\{/g))
      for (const name of (m[1] ?? "").split(",").map((s) => s.trim().replace(/<.*$/, "")))
        uses.set(name, (uses.get(name) ?? 0) + 1);
  }
  return [...declared]
    .filter(([name]) => uses.get(name) === 1)
    .slice(0, 15)
    .map(([name, at]) => ({ rule: "singleImplementation", file: at.file, line: at.line, detail: name }));
}

export function designFindings(snap: Snapshot): DesignFinding[] {
  const files = snap.files
    .filter((f) => CODE.test(f.path) && !TEST.test(f.path) && f.text)
    .map((f) => ({ path: f.path, text: f.text as string }));
  const out: DesignFinding[] = [];
  for (const f of files)
    out.push(
      ...singletons(f.path, f.text),
      ...bigSwitches(f.path, f.text),
      ...refusedBequest(f.path, f.text),
      ...godClasses(f.path, f.text),
      ...hardDependencies(f.path, f.text),
    );
  out.push(...singleImplementations(files));
  // Singletons only matter when there are many of them.
  const singles = out.filter((f) => f.rule === "singleton");
  return (singles.length >= 3 ? out : out.filter((f) => f.rule !== "singleton")).slice(0, 60);
}
