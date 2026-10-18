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
  /** Open findings in this category per scan; the goal is zero and the count may only go down. */
  findingsTrend: { at: number; score: number }[];
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
  /** Why each check was turned off in this project (plan.md 15.5: a rule is only switched off with a reason). */
  reasons?: Record<string, string>;
}

/** Where each project check comes from: the official or standard page that explains the rule and its fix. */
export const CHECK_SOURCES: Record<string, string> = {
  "arch.readme": "https://www.makeareadme.com/",
  "arch.bigFiles": "https://refactoring.guru/smells/large-class",
  "arch.todo": "https://martinfowler.com/bliki/TechnicalDebt.html",
  "arch.types": "https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html",
  "arch.lint": "https://biomejs.dev/linter/",
  "fe.strict": "https://www.typescriptlang.org/tsconfig/#strict",
  "fe.bigComponents": "https://react.dev/learn/thinking-in-react",
  "fe.any": "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any",
  "fe.errorBoundary": "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary",
  "fe.i18n": "https://www.w3.org/International/questions/qa-i18n",
  "ux.dark": "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme",
  "ux.responsive": "https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design",
  "ux.alt": "https://www.w3.org/WAI/tutorials/images/",
  "ux.focus": "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  "be.validation": "https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html",
  "be.rateLimit": "https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/",
  "be.emptyCatch": "https://en.wikipedia.org/wiki/Error_hiding",
  "db.migrations": "https://martinfowler.com/articles/evodb.html",
  "db.injection": "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
  "ops.ci": "https://martinfowler.com/articles/continuousIntegration.html",
  "ops.dockerUser": "https://docs.docker.com/build/building/best-practices/#user",
  "ops.dockerignore": "https://docs.docker.com/build/concepts/context/#dockerignore-files",
  "ops.healthcheck": "https://docs.docker.com/reference/dockerfile/#healthcheck",
  "ops.pinned": "https://docs.docker.com/build/building/best-practices/#pin-base-image-versions",
  "sec.envTracked": "https://12factor.net/config",
  "sec.secrets": "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html",
  "sec.publicKeys": "https://cloud.google.com/docs/authentication/api-keys",
  "sec.gitignoreEnv": "https://git-scm.com/docs/gitignore",
  "sec.dangerous": "https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html",
  "test.exists": "https://martinfowler.com/articles/practical-test-pyramid.html",
  "test.ratio": "https://martinfowler.com/articles/practical-test-pyramid.html",
  "test.script": "https://docs.npmjs.com/cli/v11/using-npm/scripts",
  "test.ci": "https://martinfowler.com/articles/continuousIntegration.html",
  "perf.assets": "https://web.dev/articles/fast",
  "perf.lazy": "https://react.dev/reference/react/lazy",
  "docs.readme": "https://www.makeareadme.com/",
  "docs.install": "https://www.makeareadme.com/",
  "docs.license": "https://choosealicense.com/",
  "docs.envExample": "https://12factor.net/config",
  "docs.any": "https://www.writethedocs.org/guide/writing/beginners-guide-to-docs/",
  "deps.lockfile": "https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json",
  "deps.loose": "https://semver.org/",
  "deps.mixedLocks": "https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json",
  "deps.deprecated": "https://docs.npmjs.com/cli/v11/commands/npm-deprecate",
  "tool.typecheck": "https://www.typescriptlang.org/docs/handbook/compiler-options.html",
  "tool.lint": "https://biomejs.dev/linter/",
  "tool.tests": "https://martinfowler.com/articles/practical-test-pyramid.html",
  "tool.audit": "https://docs.npmjs.com/cli/v11/commands/npm-audit",
  "tool.auditSecurity": "https://docs.npmjs.com/cli/v11/commands/npm-audit",
};

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

/** Something worth a look in the inbox (plan.md 2.6b). */
export interface InboxNotice {
  id: string;
  /** lesson: a lesson keeps coming back (make it a rule?); opinion: a persona changed its mind; update: a package you use has a new major version. */
  kind:
    | "tool"
    | "score"
    | "env"
    | "overlap"
    | "mention"
    | "lesson"
    | "opinion"
    | "update"
    | "schedule"
    | "missed"
    | "scheduleFailed"
    | "proposed"
    | "secret"
    | "vuln"
    | "down"
    | "cert"
    | "domain"
    | "appError"
    | "backup"
    | "rotate"
    | "regression"
    | "aiComment"
    | "secretRequest"
    | "agentReport"
    | "agentForm"
    | "ratchet"
    | "deployFailed"
    | "deployDone";
  projectId: string;
  projectName: string;
  /** Short fact shown next to the title: the tool, "84 → 76", "Kerim · changed · STRIPE_KEY". */
  detail: string;
  at: number;
  link: string;
}

/** Which parts of the code have tests (plan.md 6.1c "test kapsamı haritası"). */
export interface CoverageMap {
  /** "report": read from the project's own coverage report; "static": tests that import or are named after a file. */
  source: "report" | "static";
  /** The coverage file used, relative to the project. */
  report?: string;
  files: number;
  tested: number;
  /** Line coverage 0–100 (report only). */
  percent?: number;
  folders: { path: string; files: number; tested: number; percent?: number }[];
  /** The biggest files without any test. */
  untested: { path: string; lines: number }[];
  at: number;
}
