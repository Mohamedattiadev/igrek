/** Category pages and evidence-based scores (plan.md Faz 5). */

export const CATEGORIES = [
  "architecture",
  "frontend",
  "uiux",
  "backend",
  "database",
  "devops",
  "security",
  "testing",
  "performance",
  "docs",
  "dependencies",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Evidence {
  path: string;
  line?: number;
  /** Short, safe detail (never a secret value). */
  note?: string;
}

export interface Finding {
  /** Stable id, also the i18n key: insight.check.<id>.title / .fix */
  id: string;
  category: Category;
  status: "pass" | "warn" | "fail";
  /** 0–1: how much of this check is satisfied. */
  value: number;
  weight: number;
  /** Points the category score would gain if this were fixed. */
  gain: number;
  /** Measured number for the text, e.g. "12%" or "4". */
  metric?: string;
  evidence: Evidence[];
}

export interface CategoryScore {
  category: Category;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: Finding[];
  /** Files that belong to this part of the project (first ones). */
  files: string[];
  fileCount: number;
}

export interface DiagramSet {
  architecture?: string;
  database?: string;
}

export interface InsightScan {
  projectId: string;
  at: number;
  overall: number;
  grade: CategoryScore["grade"];
  categories: CategoryScore[];
  /** Every check that applies, per part, including turned-off ones. */
  catalog?: Partial<Record<Category, string[]>>;
  diagrams: DiagramSet;
  apis?: ApiMap;
  fileCount: number;
}

export interface CategoryExplanation {
  /** "How does this part work?" in plain words. */
  how: string;
  parts: { name: string; what: string }[];
  /** Why the score is what it is, in one or two sentences. */
  score: string;
}

export interface CategoryDetail extends CategoryScore {
  explanation?: Record<string, CategoryExplanation>;
  explainedAt?: number;
  trend: { at: number; score: number }[];
  sessions: { id: string; title: string; updatedAt: number; author?: string }[];
  /** Memory items (decisions, conventions, known issues) that mention this part's files. */
  decisions: { id: string; section: string; text: string }[];
}

export function gradeOf(score: number): CategoryScore["grade"] {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

/** Where an API or setting shows up in the code. */
export interface CodeRef {
  path: string;
  line: number;
}

export interface ExternalApi {
  /** Known provider id (also the i18n key insight.api.<id>), or "url:<host>" for an unknown host. */
  id: string;
  name: string;
  docs?: string;
  refs: CodeRef[];
  /** Environment variable names that belong to it (names only, never values). */
  envKeys: string[];
}

export interface Endpoint {
  method: string;
  path: string;
  ref: CodeRef;
  framework: string;
  /** Known providers the handler's file talks to. */
  calls: string[];
}

export interface EnvKeyUse {
  name: string;
  refs: CodeRef[];
  /** In .env.example (or similar) — only the name is read from there. */
  documented: boolean;
  provider?: string;
}

export interface ApiMap {
  external: ExternalApi[];
  endpoints: Endpoint[];
  env: EnvKeyUse[];
  /** Names in .env.example that no code reads. */
  unusedEnv: string[];
  flow?: string;
}

/** .env editor (plan.md 5.6). Listings only ever carry masked values. */
export interface EnvFileInfo {
  path: string;
  /** Set for a file on a server (read and written over SSH). */
  remote?: { serverId: string; path: string };
  /** The server couldn't be reached or the file couldn't be read. */
  error?: string;
  /** "default", "local", "development", "staging", "production", "test", or the suffix. */
  env: string;
  example: boolean;
  keys: number;
}

export interface EnvKeyRow {
  name: string;
  /** Per file path: masked value, or absent when the file doesn't have the key. */
  values: Record<string, { masked: string; empty: boolean; line: number }>;
  usedInCode: boolean;
  provider?: string;
  refs: { path: string; line: number }[];
  issues: EnvIssue[];
}

export type EnvIssue =
  | { kind: "missing"; file: string }
  | { kind: "empty"; file: string }
  | { kind: "duplicate"; file: string }
  | { kind: "format"; file: string; expected: "url" | "number" | "boolean" }
  | { kind: "unused" };

export interface EnvOverview {
  files: EnvFileInfo[];
  keys: EnvKeyRow[];
}

export interface EnvBackup {
  id: string;
  at: number;
  keys: number;
}

/** The project's own checks, run only when the user starts them (plan.md 5.3). */
export type ToolKind = "typecheck" | "lint" | "test" | "audit";

export interface ToolPlan {
  kind: ToolKind;
  command: string[];
}

export interface ToolResult {
  kind: ToolKind;
  command: string;
  exitCode: number;
  ok: boolean;
  ms: number;
  at: number;
  /** Last part of the output, secrets removed. */
  output: string;
  vulnerabilities?: Record<string, number>;
  tests?: { passed?: number; failed?: number };
}

/** Per-project scoring choices: how much each part counts, and checks that don't apply. */
export interface InsightConfig {
  weights: Partial<Record<Category, number>>;
  disabled: string[];
}

export const DEFAULT_WEIGHTS: Partial<Record<Category, number>> = { security: 1.5, testing: 1.2 };

/** Importing an existing project's history (plan.md 5.4). */
export interface ImportEstimate {
  sessions: number;
  /** Rough input + output tokens for the small model. */
  tokens: number;
  seconds: number;
  model: string;
}

export interface ImportStatus {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  cancelled?: boolean;
}

/** A response seen in the built-in API tester. */
export interface HttpResponse {
  status: number;
  statusText: string;
  ms: number;
  headers: Record<string, string>;
  body: string;
  size: number;
  truncated: boolean;
}

/** "Kerim changed STRIPE_KEY in .env.production" — never the value. */
export interface EnvChange {
  file: string;
  key: string;
  action: "added" | "changed" | "removed" | "restored";
  author?: string;
  at: number;
}
