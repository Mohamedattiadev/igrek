/**
 * Learning center (plan.md Faz 14): cheatsheets and roadmaps. The content is hand-written YAML in
 * ../content, in English and Turkish, every item with an official source and the version it was
 * checked against. Other languages are translated on demand, like language packs.
 */

/** A text in the two languages that are written and checked by hand. */
export interface Text {
  en: string;
  tr: string;
}

export type Level = "basic" | "intermediate" | "advanced";
export const LEVELS: Level[] = ["basic", "intermediate", "advanced"];

export type SheetCategory = "language" | "framework" | "tool" | "concept";
export const SHEET_CATEGORIES: SheetCategory[] = ["language", "framework", "tool", "concept"];

/** Languages an example can be run in by the content checker (scripts/learn-check.ts). */
export const RUNNABLE = ["sh", "js", "ts", "py", "sql", "go", "rust", "java", "cs", "php"] as const;
export type Runnable = (typeof RUNNABLE)[number];

export interface Source {
  title: string;
  url: string;
}

/**
 * How to tell a project uses a technology, and where its installed version comes from:
 * npm/pip/cargo/composer/nuget package names, or files that only it has (go.mod, Dockerfile).
 */
export interface Detect {
  npm?: string[];
  pip?: string[];
  cargo?: string[];
  composer?: string[];
  nuget?: string[];
  files?: string[];
}

export interface SheetItem {
  id: string;
  level: Level;
  title: Text;
  /** What it is for, in one plain sentence. */
  what: Text;
  /** The most used form. */
  form: string;
  /** A short, real example. */
  example?: string;
  /** What the example prints, when it prints something; checked by running it. */
  output?: string;
  /** The language the form and example are written in (for highlighting and checking). */
  lang?: string;
  /** Run the example in the checker and compare with `output`. */
  check?: Runnable;
  /** The most common mistake. */
  mistake?: Text;
  /** When not to use it. */
  avoid?: Text;
  /** The version it first appeared in. */
  since?: string;
  /** How it differs in older versions. */
  older?: Text;
  /**
   * Text in code that shows this item is used ("useActionState("), for the version check of code
   * the AI wrote (plan.md 1.9). Only markers that can't mean anything else; needs `since`.
   */
  api?: string[];
  /** The official page this item comes from. */
  source: string;
}

export interface SheetSection {
  id: string;
  title: Text;
  items: SheetItem[];
}

export interface Sheet {
  id: string;
  title: string;
  category: SheetCategory;
  summary: Text;
  /** Words people search with ("k8s", "regexp"). */
  aliases?: string[];
  detect?: Detect;
  /** The version the sheet describes, if it has versions. */
  version?: string;
  /** Where to ask for the latest version: "npm:react", "eol:python" (endoflife.date), "pypi:fastapi". */
  latest?: string;
  /** When it was last checked against the sources (YYYY-MM). */
  checked: string;
  sources: Source[];
  /** Related roadmap, if there is one. */
  roadmap?: string;
  sections: SheetSection[];
}

/** The same skeleton for every roadmap (plan.md 14.2). */
export const STAGES = [
  "setup",
  "first-code",
  "basics",
  "first-project",
  "data-api",
  "testing",
  "security",
  "performance",
  "packaging",
  "deploy",
  "monitoring",
  "advanced",
] as const;
export type Stage = (typeof STAGES)[number];

export interface CodeFile {
  /** Where the file goes in the example project, or a shell session ("terminal"). */
  file: string;
  lang: string;
  text: string;
}

export interface QuizQuestion {
  q: Text;
  options: { en: string[]; tr: string[] };
  /** Index of the right option. */
  answer: number;
  why: Text;
}

export interface RoadmapStep {
  id: string;
  stage: Stage;
  title: Text;
  /** Rough time for a beginner, in minutes. */
  minutes: number;
  /** Steps to finish first: "<step>" in this roadmap or "<roadmap>/<step>". */
  needs?: string[];
  /** Why this step matters. */
  why: Text;
  /** What you will learn (markdown list). */
  learn: Text;
  /** What to do, step by step (markdown numbered list). */
  do: Text;
  code?: CodeFile[];
  mistakes?: { problem: Text; fix: Text }[];
  quiz?: QuizQuestion[];
  sources: Source[];
}

export interface Roadmap {
  id: string;
  title: string;
  summary: Text;
  /** The persona that teaches it. */
  teacher: string;
  /** The real example project the steps build. */
  project: Text;
  detect?: Detect;
  version?: string;
  latest?: string;
  checked: string;
  /** Roadmaps to know first ("web", "javascript"). */
  after?: string[];
  /** Cheatsheets that go with it. */
  sheets?: string[];
  steps: RoadmapStep[];
}

/** Short lists for search and the hub page; the full content is loaded one at a time. */
export interface SheetInfo {
  id: string;
  title: string;
  category: SheetCategory;
  summary: string;
  aliases: string[];
  version?: string;
  checked: string;
  items: number;
  roadmap?: string;
}

export interface RoadmapInfo {
  id: string;
  title: string;
  summary: string;
  teacher: string;
  version?: string;
  checked: string;
  steps: number;
  minutes: number;
}

/** One search hit: a sheet item, a sheet or a roadmap step. */
export interface LearnHit {
  kind: "item" | "sheet" | "step";
  sheet?: string;
  roadmap?: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

/** A technology found in a project, with its installed version when it could be read. */
export interface ProjectTech {
  id: string;
  version?: string;
  /** Where the version came from ("node_modules/react/package.json"). */
  from?: string;
}

/** The newest version known for a sheet, and whether the sheet is behind. */
export interface LatestInfo {
  sheet: string;
  latest: string;
  /** The sheet describes an older major version. */
  behind: boolean;
  at: number;
}

export interface LearnState {
  favorites: string[];
  notes: Record<string, string>;
  /** Items and steps reported as wrong or out of date, with the reason. */
  reports: { key: string; reason: string; at: number }[];
  /** Finished roadmap steps, "<roadmap>/<step>". */
  done: string[];
}

/** Picks the text in the language asked for; Turkish and English are written, others translated. */
export function pick(text: Text | undefined, lang: string): string {
  if (!text) return "";
  return lang === "tr" ? text.tr : text.en;
}

/** "19.2.1" → [19, 2, 1]; text around the numbers ("^", "v", ">=") is ignored. */
export function versionParts(v: string | undefined): number[] {
  const m = v?.match(/\d+(?:\.\d+)*/);
  return m ? m[0].split(".").map(Number) : [];
}

/** Negative when a < b, like a sort comparator. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function text(errors: string[], where: string, value: unknown, required = true): void {
  if (value === undefined && !required) return;
  const t = value as Partial<Text> | undefined;
  if (!t || typeof t !== "object") return void errors.push(`${where}: missing`);
  for (const lang of ["en", "tr"] as const)
    if (typeof t[lang] !== "string" || !t[lang]?.trim()) errors.push(`${where}.${lang}: missing`);
}

function url(errors: string[], where: string, value: unknown): void {
  if (typeof value !== "string" || !/^https:\/\/[^\s]+$/.test(value)) errors.push(`${where}: not an https link`);
}

/** Everything wrong with a sheet; empty when it is fine. */
export function validateSheet(raw: unknown, file = "sheet"): string[] {
  const e: string[] = [];
  const s = raw as Partial<Sheet>;
  if (!s || typeof s !== "object") return [`${file}: not an object`];
  if (!ID.test(s.id ?? "")) e.push(`${file}: bad id`);
  if (!s.title) e.push(`${file}: no title`);
  if (!SHEET_CATEGORIES.includes(s.category as SheetCategory)) e.push(`${file}: bad category`);
  text(e, `${file}.summary`, s.summary);
  if (!MONTH.test(String(s.checked ?? ""))) e.push(`${file}: checked must be YYYY-MM`);
  if (!Array.isArray(s.sources) || !s.sources.length) e.push(`${file}: no sources`);
  else for (const [i, x] of s.sources.entries()) url(e, `${file}.sources[${i}]`, x?.url);
  if (!Array.isArray(s.sections) || !s.sections.length) return [...e, `${file}: no sections`];
  const ids = new Set<string>();
  for (const sec of s.sections) {
    const w = `${file}/${sec?.id}`;
    if (!ID.test(sec?.id ?? "")) e.push(`${w}: bad section id`);
    text(e, `${w}.title`, sec?.title);
    if (!Array.isArray(sec?.items) || !sec.items.length) {
      e.push(`${w}: no items`);
      continue;
    }
    for (const it of sec.items) {
      const wi = `${w}/${it?.id}`;
      if (!ID.test(it?.id ?? "")) e.push(`${wi}: bad id`);
      if (ids.has(it.id)) e.push(`${wi}: duplicate id`);
      ids.add(it.id);
      if (!LEVELS.includes(it.level)) e.push(`${wi}: bad level`);
      text(e, `${wi}.title`, it.title);
      text(e, `${wi}.what`, it.what);
      if (typeof it.form !== "string" || !it.form.trim()) e.push(`${wi}: no form`);
      text(e, `${wi}.mistake`, it.mistake, false);
      text(e, `${wi}.avoid`, it.avoid, false);
      text(e, `${wi}.older`, it.older, false);
      if (it.older && !it.since) e.push(`${wi}: older without since`);
      if (it.api !== undefined) {
        if (!it.since) e.push(`${wi}: api without since`);
        if (
          !Array.isArray(it.api) ||
          !it.api.length ||
          it.api.some((a) => typeof a !== "string" || a.trim().length < 4)
        )
          e.push(`${wi}: api must be a list of markers, 4 characters or more`);
      }
      url(e, `${wi}.source`, it.source);
      if (it.check && !RUNNABLE.includes(it.check)) e.push(`${wi}: bad check`);
      if (it.check && !it.example) e.push(`${wi}: check without example`);
    }
  }
  return e;
}

/** Code that uses something newer than the version the project has installed. */
export interface ApiVersionIssue {
  /** The file, as given. */
  file: string;
  line: number;
  marker: string;
  sheet: string;
  item: string;
  title: Text;
  since: string;
  installed: string;
  /** The official page of the item. */
  source: string;
}

/**
 * Compares code with the versions a project has installed (plan.md 1.9): an item whose marker is in
 * the code but which came in a newer version than the installed one ("useActionState needs React 19,
 * this project has 18.3.1"). Only sheets of technologies the project uses take part.
 */
export function apiVersionIssues(
  files: { path: string; text: string }[],
  sheets: Pick<Sheet, "id" | "sections">[],
  techs: ProjectTech[],
): ApiVersionIssue[] {
  const out: ApiVersionIssue[] = [];
  for (const tech of techs) {
    if (!tech.version) continue;
    const sheet = sheets.find((s) => s.id === tech.id);
    for (const it of sheet?.sections.flatMap((sec) => sec.items) ?? []) {
      if (!it.api || !it.since || compareVersions(tech.version, it.since) >= 0) continue;
      for (const f of files)
        for (const marker of it.api) {
          const at = f.text.indexOf(marker);
          if (at < 0) continue;
          out.push({
            file: f.path,
            line: f.text.slice(0, at).split("\n").length,
            marker,
            sheet: tech.id,
            item: it.id,
            title: it.title,
            since: it.since,
            installed: tech.version,
            source: it.source,
          });
          break;
        }
    }
  }
  return out;
}

/** Everything wrong with a roadmap; empty when it is fine. */
export function validateRoadmap(raw: unknown, file = "roadmap", known?: Set<string>): string[] {
  const e: string[] = [];
  const r = raw as Partial<Roadmap>;
  if (!r || typeof r !== "object") return [`${file}: not an object`];
  if (!ID.test(r.id ?? "")) e.push(`${file}: bad id`);
  if (!r.title) e.push(`${file}: no title`);
  text(e, `${file}.summary`, r.summary);
  text(e, `${file}.project`, r.project);
  if (!r.teacher) e.push(`${file}: no teacher`);
  if (!MONTH.test(String(r.checked ?? ""))) e.push(`${file}: checked must be YYYY-MM`);
  if (!Array.isArray(r.steps) || !r.steps.length) return [...e, `${file}: no steps`];
  const ids = new Set(r.steps.map((s) => s?.id));
  if (ids.size !== r.steps.length) e.push(`${file}: duplicate step ids`);
  const stages = new Set(r.steps.map((s) => s?.stage));
  for (const st of STAGES) if (!stages.has(st)) e.push(`${file}: no step for stage ${st}`);
  let last = -1;
  for (const s of r.steps) {
    const w = `${file}/${s?.id}`;
    if (!ID.test(s?.id ?? "")) e.push(`${w}: bad id`);
    const at = STAGES.indexOf(s.stage);
    if (at < 0) e.push(`${w}: bad stage`);
    else if (at < last) e.push(`${w}: stages out of order`);
    last = Math.max(last, at);
    text(e, `${w}.title`, s.title);
    for (const k of ["why", "learn", "do"] as const) text(e, `${w}.${k}`, s[k]);
    if (!(typeof s.minutes === "number" && s.minutes > 0)) e.push(`${w}: minutes`);
    if (!Array.isArray(s.sources) || !s.sources.length) e.push(`${w}: no sources`);
    else for (const [i, x] of s.sources.entries()) url(e, `${w}.sources[${i}]`, x?.url);
    for (const n of s.needs ?? []) {
      const [a, b] = n.includes("/") ? n.split("/") : [undefined, n];
      if (a === undefined && !ids.has(b)) e.push(`${w}: needs unknown step ${n}`);
      if (a !== undefined && known && !known.has(n)) e.push(`${w}: needs unknown step ${n}`);
    }
    for (const [i, m] of (s.mistakes ?? []).entries()) {
      text(e, `${w}.mistakes[${i}].problem`, m?.problem);
      text(e, `${w}.mistakes[${i}].fix`, m?.fix);
    }
    for (const [i, q] of (s.quiz ?? []).entries()) {
      const wq = `${w}.quiz[${i}]`;
      text(e, `${wq}.q`, q?.q);
      text(e, `${wq}.why`, q?.why);
      const n = q?.options?.en?.length ?? 0;
      if (n < 2 || q.options.tr?.length !== n) e.push(`${wq}: options`);
      if (!(Number.isInteger(q?.answer) && q.answer >= 0 && q.answer < n)) e.push(`${wq}: answer`);
    }
    for (const [i, c] of (s.code ?? []).entries())
      if (!c?.file || !c.lang || !c.text?.trim()) e.push(`${w}.code[${i}]: file, lang and text`);
  }
  return e;
}

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c" };

/**
 * Words of a text for search: lower case, Turkish letters folded (people often type "nasil" for
 * "nasıl"), short words dropped.
 */
export function words(s: string): string[] {
  return s
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[ışğüöç]/g, (c) => FOLD[c] ?? c)
    .split(/[^\p{L}\p{N}#+.-]+/u)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1);
}
