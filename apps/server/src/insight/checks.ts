import {
  type Category,
  type CategoryScore,
  DEFAULT_WEIGHTS,
  type Evidence,
  type Finding,
  gradeOf,
  type InsightConfig,
  type ToolResult,
  type UiAudit,
  type UiPageCheck,
} from "@igrek/core";
import { SECRET_PATTERNS } from "../sync/scrub";
import { isEnvExample, type RepoFile, SENSITIVE, type Snapshot } from "./snapshot";

// ---- what is what --------------------------------------------------------------------

export const CODE =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro|py|go|rs|rb|java|kt|swift|php|cs|c|cpp|scala|ex|exs|dart)$/i;
const JS_TS = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;
const UI_FILE = /\.(tsx|jsx|vue|svelte|astro|html?)$/i;
const STYLE = /\.(css|scss|sass|less)$/i;
export const TEST_FILE =
  /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/i;
const DOC = /\.(md|mdx|rst|adoc)$/i;
const MANIFEST =
  /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|composer\.json)$/;
const LOCK =
  /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
const DEVOPS =
  /(^|\/)(Dockerfile[^/]*|Containerfile|[^/]*compose[^/]*\.ya?ml|\.github\/workflows\/[^/]+|\.gitlab-ci\.yml|\.circleci\/[^/]+|Jenkinsfile|Procfile|fly\.toml|vercel\.json|netlify\.toml|render\.yaml|Caddyfile|nginx[^/]*\.conf|k8s\/[^/]+|helm\/[^/]+|\.dockerignore)$/i;
const CI =
  /(^|\/)(\.github\/workflows\/[^/]+|\.gitlab-ci\.yml|\.circleci\/config\.yml|Jenkinsfile|azure-pipelines\.yml|bitbucket-pipelines\.yml)$/;
const DB_FILE =
  /(^|\/)(migrations?\/|schema\.prisma$|[^/]*\.sql$|db\.(ts|js|py)$|database\.(ts|js|py)$|models?\.(py|ts)$|schema\.(ts|js)$|drizzle\/)/i;
const SECURITY_FILE = /(^|\/)[^/]*(auth|security|crypto|session|permission|password|token|guard|policy)[^/]*$/i;

const FRONTEND_DEPS = [
  "react",
  "vue",
  "svelte",
  "@angular/core",
  "next",
  "nuxt",
  "solid-js",
  "preact",
  "astro",
  "@remix-run/react",
  "lit",
];
const BACKEND_DEPS = [
  "express",
  "hono",
  "fastify",
  "koa",
  "@nestjs/core",
  "@hapi/hapi",
  "elysia",
  "django",
  "flask",
  "fastapi",
  "starlette",
  "aiohttp",
  "rails",
  "sinatra",
  "github.com/gin-gonic/gin",
  "github.com/labstack/echo/v4",
  "github.com/gofiber/fiber/v2",
  "actix-web",
  "axum",
  "next",
];
const DB_DEPS = [
  "prisma",
  "@prisma/client",
  "drizzle-orm",
  "sequelize",
  "typeorm",
  "mongoose",
  "mongodb",
  "knex",
  "kysely",
  "pg",
  "mysql2",
  "better-sqlite3",
  "sqlite3",
  "@libsql/client",
  "@supabase/supabase-js",
  "redis",
  "ioredis",
  "sqlalchemy",
  "psycopg2",
  "psycopg",
  "pymongo",
  "peewee",
  "django",
  "gorm.io/gorm",
  "diesel",
  "sqlx",
];

function hasDep(snap: Snapshot, names: string[]): boolean {
  return names.some((n) => snap.deps.has(n));
}

/** Which parts this project has; a part without anything in it gets no page. */
function presentCategories(snap: Snapshot): Category[] {
  const paths = snap.files.map((f) => f.path);
  const code = paths.filter((p) => CODE.test(p));
  const frontend = hasDep(snap, FRONTEND_DEPS) || paths.filter((p) => UI_FILE.test(p)).length >= 3;
  const backend =
    hasDep(snap, BACKEND_DEPS) || paths.some((p) => /(^|\/)(server|backend|api)\//.test(p) && CODE.test(p));
  const database = hasDep(snap, DB_DEPS) || paths.some((p) => DB_FILE.test(p));
  const out: Category[] = [];
  if (code.length) out.push("architecture");
  if (frontend) out.push("frontend", "uiux");
  if (backend) out.push("backend");
  if (database) out.push("database");
  if (paths.some((p) => DEVOPS.test(p))) out.push("devops");
  out.push("security");
  if (code.length) out.push("testing");
  if (frontend) out.push("performance");
  out.push("docs");
  if (paths.some((p) => MANIFEST.test(p))) out.push("dependencies");
  return out;
}

/** Files that make up each part (a file can be in several). */
function filesOf(category: Category, path: string): boolean {
  switch (category) {
    case "architecture":
      return (
        /(^|\/)(index|main|app|server|mod|lib)\.[a-z]+$/i.test(path) ||
        /(^|\/)(tsconfig[^/]*\.json|package\.json|biome\.json|vite\.config\.[a-z]+|Makefile)$/.test(path)
      );
    case "frontend":
      return (
        (UI_FILE.test(path) || /(^|\/)(web|frontend|client|ui|components|pages|views|hooks)\//.test(path)) &&
        !TEST_FILE.test(path)
      );
    case "uiux":
      return (
        STYLE.test(path) ||
        /(^|\/)(components|ui|design|theme|styles?)\//i.test(path) ||
        /(tailwind|theme|tokens)[^/]*\.[a-z]+$/i.test(path)
      );
    case "backend":
      return (
        CODE.test(path) &&
        /(^|\/)(server|backend|api|routes?|controllers?|services?|handlers?|middlewares?)(\/|[-_.])/i.test(path) &&
        !TEST_FILE.test(path)
      );
    case "database":
      return DB_FILE.test(path);
    case "devops":
      return DEVOPS.test(path);
    case "security":
      return SECURITY_FILE.test(path) && CODE.test(path);
    case "testing":
      return TEST_FILE.test(path);
    case "performance":
      return /(^|\/)(vite|webpack|rollup|next|nuxt|astro|esbuild)\.config\.[a-z]+$/.test(path);
    case "docs":
      return DOC.test(path) || /(^|\/)(LICENSE|CHANGELOG)[^/]*$/.test(path);
    case "dependencies":
      return MANIFEST.test(path) || LOCK.test(path);
  }
}

const LOCAL_CREDENTIAL_URL =
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@(localhost|127\.0\.0\.1|0\.0\.0\.0|db|database|postgres|postgresql|mysql|mariadb|redis|mongo|mongodb)(?=[:/\s"']|$)/gi;

/** Generated code isn't written by hand, so its size says nothing about the design. */
const GENERATED =
  /(^|\/)(generated|__generated__|gen|l10n|i18n\/generated)\/|\.(g|freezed|pb|gen)\.[a-z]+$|generated\.[a-z]+$|_pb2\.py$|app_localizations[^/]*\.dart$/i;
export const isGenerated = (f: RepoFile) =>
  GENERATED.test(f.path) || /^.{0,300}(@generated|DO NOT EDIT|auto-?generated)/is.test(f.text ?? "");

// ---- helpers -------------------------------------------------------------------------

interface Draft {
  id: string;
  category: Category;
  weight: number;
  value: number;
  metric?: string;
  evidence?: Evidence[];
}

/** Every line matching `pattern` in the given files, as evidence. */
function grep(files: RepoFile[], pattern: RegExp, limit = 12): Evidence[] {
  const out: Evidence[] = [];
  for (const f of files) {
    if (!f.text) continue;
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i] ?? "")) {
        out.push({ path: f.path, line: i + 1 });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function countMatches(files: RepoFile[], pattern: RegExp): number {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let n = 0;
  for (const f of files) if (f.text) n += f.text.match(global)?.length ?? 0;
  return n;
}

const someText = (files: RepoFile[], pattern: RegExp) => files.some((f) => f.text && pattern.test(f.text));
const ratio = (bad: number, tolerance: number) => Math.max(0, 1 - bad / tolerance);

// ---- the checks ----------------------------------------------------------------------

/**
 * Static checks only: nothing in the project is executed. Each one has a
 * weight, a 0–1 value and evidence pointing at file:line, so every score can
 * be traced back to something the user can open and fix.
 */
function runChecks(snap: Snapshot, categories: Category[]): Draft[] {
  const has = (c: Category) => categories.includes(c);
  const files = snap.files;
  const code = files.filter((f) => CODE.test(f.path) && !TEST_FILE.test(f.path) && !isGenerated(f));
  const jsts = code.filter((f) => JS_TS.test(f.path));
  const ui = code.filter((f) => UI_FILE.test(f.path));
  const tests = files.filter((f) => TEST_FILE.test(f.path) && CODE.test(f.path));
  const docs = files.filter((f) => DOC.test(f.path));
  const readme = files.find((f) => /^readme(\.[a-z]+)?$/i.test(f.path));
  const ci = files.filter((f) => CI.test(f.path));
  const dockerfiles = files.filter(
    (f) => /(^|\/)(Dockerfile[^/]*|Containerfile)$/.test(f.path) && !f.path.endsWith(".dockerignore"),
  );
  const styles = files.filter((f) => STYLE.test(f.path) || UI_FILE.test(f.path));
  const codeLines = Math.max(
    1,
    code.reduce((n, f) => n + f.lines, 0),
  );
  const out: Draft[] = [];
  const add = (d: Draft) => out.push({ ...d, value: Math.max(0, Math.min(1, d.value)) });

  if (has("architecture")) {
    add({ id: "arch.readme", category: "architecture", weight: 1, value: readme ? 1 : 0 });
    const big = code.filter((f) => f.lines > 600).sort((a, b) => b.lines - a.lines);
    add({
      id: "arch.bigFiles",
      category: "architecture",
      weight: 2,
      value: ratio(big.length, 10),
      metric: String(big.length),
      evidence: big.slice(0, 10).map((f) => ({ path: f.path, note: `${f.lines}` })),
    });
    // Only in comments, so code that merely mentions the word doesn't count.
    const todo = /(\/\/|#|\/\*|^\s*\*)\s*(TODO|FIXME|HACK|XXX)\b/m;
    const todos = grep(code, todo, 15);
    const todoCount = countMatches(code, todo);
    add({
      id: "arch.todo",
      category: "architecture",
      weight: 1,
      value: ratio((todoCount * 1000) / codeLines, 5),
      metric: String(todoCount),
      evidence: todos,
    });
    if (jsts.length) {
      const typed = jsts.filter((f) => /\.(ts|tsx|mts|cts)$/.test(f.path)).length;
      add({
        id: "arch.types",
        category: "architecture",
        weight: 1,
        value: typed / jsts.length,
        metric: `${Math.round((typed / jsts.length) * 100)}%`,
      });
    }
    const lint =
      files.some((f) =>
        /(^|\/)(biome\.jsonc?|\.eslintrc[^/]*|eslint\.config\.[a-z]+|\.prettierrc[^/]*|ruff\.toml|\.golangci\.ya?ml|\.rubocop\.yml)$/.test(
          f.path,
        ),
      ) ||
      someText(
        files.filter((f) => f.path.endsWith("pyproject.toml")),
        /\[tool\.(ruff|black|flake8)/,
      );
    add({ id: "arch.lint", category: "architecture", weight: 1, value: lint ? 1 : 0 });
  }

  if (has("frontend")) {
    const tsconfigs = files.filter((f) => /(^|\/)tsconfig[^/]*\.json$/.test(f.path));
    if (tsconfigs.length) {
      const strict = tsconfigs.some((f) => f.text && /"strict"\s*:\s*true/.test(f.text));
      add({
        id: "fe.strict",
        category: "frontend",
        weight: 1.5,
        value: strict ? 1 : 0,
        evidence: strict ? [] : tsconfigs.slice(0, 3).map((f) => ({ path: f.path })),
      });
    }
    const bigUi = ui.filter((f) => f.lines > 400).sort((a, b) => b.lines - a.lines);
    add({
      id: "fe.bigComponents",
      category: "frontend",
      weight: 1.5,
      value: ratio(bigUi.length, 6),
      metric: String(bigUi.length),
      evidence: bigUi.slice(0, 8).map((f) => ({ path: f.path, note: `${f.lines}` })),
    });
    const tsFiles = jsts.filter((f) => /\.(ts|tsx)$/.test(f.path));
    if (tsFiles.length) {
      const anyPattern = /(:\s*any\b|\bas\s+any\b|<any>)/;
      const anyCount = countMatches(tsFiles, anyPattern);
      const tsLines = Math.max(
        1,
        tsFiles.reduce((n, f) => n + f.lines, 0),
      );
      add({
        id: "fe.any",
        category: "frontend",
        weight: 1,
        value: ratio((anyCount * 1000) / tsLines, 4),
        metric: String(anyCount),
        evidence: grep(tsFiles, anyPattern, 10),
      });
    }
    if (snap.deps.has("react")) {
      const boundary = someText(ui, /(ErrorBoundary|componentDidCatch|errorElement)/);
      add({ id: "fe.errorBoundary", category: "frontend", weight: 0.5, value: boundary ? 1 : 0 });
    }
    add({
      id: "fe.i18n",
      category: "frontend",
      weight: 0.5,
      value: hasDep(snap, [
        "i18next",
        "react-i18next",
        "react-intl",
        "vue-i18n",
        "next-intl",
        "@lingui/core",
        "svelte-i18n",
      ])
        ? 1
        : 0,
    });
  }

  if (has("uiux")) {
    add({
      id: "ux.dark",
      category: "uiux",
      weight: 1,
      value: someText(styles, /(prefers-color-scheme|\bdark:|data-theme|\.dark\s*[{,])/) ? 1 : 0,
    });
    add({
      id: "ux.responsive",
      category: "uiux",
      weight: 1,
      value: someText(styles, /(@media|\b(sm|md|lg|xl):[a-z])/) ? 1 : 0,
    });
    const noAlt = grep(ui, /<img\b(?![^>]*\balt=)[^>]*>/i, 10);
    add({
      id: "ux.alt",
      category: "uiux",
      weight: 1.5,
      value: ratio(noAlt.length, 5),
      metric: String(noAlt.length),
      evidence: noAlt,
    });
    add({
      id: "ux.focus",
      category: "uiux",
      weight: 1,
      value: someText(styles, /(focus-visible|:focus\b|focus:)/) ? 1 : 0,
    });
  }

  if (has("backend")) {
    add({
      id: "be.validation",
      category: "backend",
      weight: 1.5,
      value: hasDep(snap, [
        "zod",
        "valibot",
        "yup",
        "joi",
        "ajv",
        "class-validator",
        "superstruct",
        "@sinclair/typebox",
        "arktype",
        "pydantic",
        "marshmallow",
      ])
        ? 1
        : 0,
    });
    const limiter =
      hasDep(snap, [
        "express-rate-limit",
        "rate-limiter-flexible",
        "@fastify/rate-limit",
        "hono-rate-limiter",
        "slowapi",
        "django-ratelimit",
        "flask-limiter",
      ]) || someText(code, /\b(rate[-_ ]?limit|RateLimiter)\b/i);
    add({ id: "be.rateLimit", category: "backend", weight: 1, value: limiter ? 1 : 0 });
    const emptyCatch = grep(code, /catch\s*(\([^)]*\))?\s*\{\s*\}|except[^:\n]*:\s*pass\b/, 10);
    add({
      id: "be.emptyCatch",
      category: "backend",
      weight: 1,
      value: ratio(emptyCatch.length, 5),
      metric: String(emptyCatch.length),
      evidence: emptyCatch,
    });
  }

  if (has("database")) {
    const migrations =
      files.some((f) => /(^|\/)(migrations?|drizzle|alembic)\//i.test(f.path)) ||
      someText(code, /\bmigrations?\b[^=\n]*=\s*\[/);
    add({ id: "db.migrations", category: "database", weight: 1.5, value: migrations ? 1 : 0 });
    // A query string built with ${…}: values should be bound parameters instead.
    const injection = grep(
      code,
      /\b(query|execute|exec|raw|run|prepare|sql)\s*\(\s*`[^`]*\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b[^`]*\$\{/i,
      10,
    );
    add({
      id: "db.injection",
      category: "database",
      weight: 2,
      value: ratio(injection.length, 3),
      metric: String(injection.length),
      evidence: injection,
    });
  }

  if (has("devops")) {
    add({
      id: "ops.ci",
      category: "devops",
      weight: 1.5,
      value: ci.length ? 1 : 0,
      evidence: ci.map((f) => ({ path: f.path })),
    });
    if (dockerfiles.length) {
      const root = dockerfiles.filter((f) => f.text && !/^\s*USER\s+(?!root\b)\S+/im.test(f.text));
      add({
        id: "ops.dockerUser",
        category: "devops",
        weight: 1,
        value: 1 - root.length / dockerfiles.length,
        evidence: root.map((f) => ({ path: f.path })),
      });
      add({
        id: "ops.dockerignore",
        category: "devops",
        weight: 0.5,
        value: files.some((f) => f.path.endsWith(".dockerignore")) ? 1 : 0,
      });
      const health =
        dockerfiles.some((f) => f.text && /^\s*HEALTHCHECK\b/im.test(f.text)) ||
        someText(
          files.filter((f) => /compose[^/]*\.ya?ml$/.test(f.path)),
          /healthcheck:/,
        );
      add({ id: "ops.healthcheck", category: "devops", weight: 0.5, value: health ? 1 : 0 });
      const latest = grep(dockerfiles, /^\s*FROM\s+(?!scratch\b)(\S+:latest\b|[^\s:@$]+\s*$|[^\s:@$]+\s+AS\s)/i, 10);
      add({
        id: "ops.pinned",
        category: "devops",
        weight: 1,
        value: ratio(latest.length, 2),
        metric: String(latest.length),
        evidence: latest,
      });
    }
  }

  if (has("security")) {
    const trackedEnv = files.filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f.path) && !isEnvExample(f.path));
    add({
      id: "sec.envTracked",
      category: "security",
      weight: 3,
      value: trackedEnv.length ? 0 : 1,
      evidence: trackedEnv.map((f) => ({ path: f.path })),
    });
    // Real keys in tracked code (test fixtures are skipped: they're usually fake on purpose).
    const secrets: Evidence[] = [];
    const publicKeys: Evidence[] = [];
    const clientConfig =
      /(^|\/)(google-services\.json|GoogleService-Info\.plist|firebase_options\.dart|firebase(Config)?\.(ts|js)|firebase\.json)$/i;
    for (const f of files) {
      if (!f.text || TEST_FILE.test(f.path) || SENSITIVE.test(f.path)) continue;
      const lines = f.text.split("\n");
      for (let i = 0; i < lines.length && secrets.length < 12; i++) {
        // Throwaway passwords for a local or CI service database aren't leaks.
        let line = (lines[i] ?? "").replace(LOCAL_CREDENTIAL_URL, "");
        // Google/Firebase client keys are public by design (they ship inside the app); they only need restricting.
        if (clientConfig.test(f.path) && /\bAIza[0-9A-Za-z_-]{35}\b/.test(line)) {
          if (publicKeys.length < 12) publicKeys.push({ path: f.path, line: i + 1 });
          line = line.replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "");
        }
        if (SECRET_PATTERNS.some((p) => new RegExp(p.source, p.flags.replace("g", "")).test(line)))
          secrets.push({ path: f.path, line: i + 1 });
      }
    }
    add({
      id: "sec.secrets",
      category: "security",
      weight: 3,
      value: secrets.length ? 0 : 1,
      metric: String(secrets.length),
      evidence: secrets,
    });
    if (publicKeys.length)
      add({
        id: "sec.publicKeys",
        category: "security",
        weight: 0.5,
        value: 0.5,
        metric: String(publicKeys.length),
        evidence: publicKeys,
      });
    const usesEnv = someText(code, /(process\.env|import\.meta\.env|Bun\.env|os\.environ|os\.getenv|ENV\[)/);
    if (usesEnv) {
      const gitignore = files.find((f) => f.path === ".gitignore");
      add({
        id: "sec.gitignoreEnv",
        category: "security",
        weight: 1,
        value: gitignore?.text && /(^|\n)\s*\/?\.env\b/.test(gitignore.text) ? 1 : 0,
      });
    }
    // Rendering HTML is fine when the same file sanitizes it.
    const sanitizes = (path: string) =>
      /(DOMPurify|sanitize\(|bleach\.clean|escapeHtml)/.test(snap.byPath.get(path)?.text ?? "");
    const dangerous = grep(
      code,
      /(\beval\s*\(|new Function\s*\(|\.innerHTML\s*=|dangerouslySetInnerHTML|\bexec(Sync)?\s*\(\s*`[^`]*\$\{|shell\s*=\s*True|os\.system\s*\()/,
      30,
    )
      .filter((e) => {
        const line = snap.byPath.get(e.path)?.text?.split("\n")[(e.line ?? 1) - 1] ?? "";
        return !(/(dangerouslySetInnerHTML|innerHTML)/.test(line) && sanitizes(e.path));
      })
      .slice(0, 12);
    add({
      id: "sec.dangerous",
      category: "security",
      weight: 1.5,
      value: ratio(dangerous.length, 6),
      metric: String(dangerous.length),
      evidence: dangerous,
    });
  }

  if (has("testing")) {
    add({
      id: "test.exists",
      category: "testing",
      weight: 2,
      value: tests.length ? 1 : 0,
      metric: String(tests.length),
    });
    const share = tests.length / Math.max(1, code.length);
    add({
      id: "test.ratio",
      category: "testing",
      weight: 1.5,
      value: share / 0.3,
      metric: `${Math.round(share * 100)}%`,
    });
    const script =
      snap.packages.some((p) => {
        const test = (p.json.scripts as Record<string, string> | undefined)?.test;
        return !!test && !/no test specified/.test(test);
      }) ||
      files.some((f) =>
        /(^|\/)(pytest\.ini|conftest\.py|jest\.config\.[a-z]+|vitest\.config\.[a-z]+|playwright\.config\.[a-z]+)$/.test(
          f.path,
        ),
      );
    add({ id: "test.script", category: "testing", weight: 1, value: script ? 1 : 0 });
    if (ci.length)
      add({
        id: "test.ci",
        category: "testing",
        weight: 1,
        value: someText(ci, /\b(test|pytest|vitest|jest)\b/i) ? 1 : 0,
        evidence: ci.map((f) => ({ path: f.path })),
      });
  }

  if (has("performance")) {
    const heavy = files
      .filter(
        (f) => /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|woff2?|ttf|otf)$/i.test(f.path) && f.size > 500 * 1024,
      )
      .sort((a, b) => b.size - a.size);
    add({
      id: "perf.assets",
      category: "performance",
      weight: 1,
      value: ratio(heavy.length, 4),
      metric: String(heavy.length),
      evidence: heavy.slice(0, 8).map((f) => ({ path: f.path, note: `${Math.round(f.size / 1024)} KB` })),
    });
    if (ui.length > 25)
      add({
        id: "perf.lazy",
        category: "performance",
        weight: 1,
        value: someText(code, /(React\.lazy|\blazy\s*\(|import\s*\(\s*["'`]|defineAsyncComponent|next\/dynamic)/)
          ? 1
          : 0,
      });
  }

  if (has("docs")) {
    const size = readme?.text?.length ?? 0;
    add({
      id: "docs.readme",
      category: "docs",
      weight: 1.5,
      value: size >= 1500 ? 1 : size / 1500,
      metric: String(size),
    });
    add({
      id: "docs.install",
      category: "docs",
      weight: 1,
      value:
        readme?.text && /(install|setup|getting started|kurulum|usage|kullanım|quick ?start)/i.test(readme.text)
          ? 1
          : 0,
    });
    add({
      id: "docs.license",
      category: "docs",
      weight: 0.5,
      value: files.some((f) => /^(LICENSE|LICENCE|COPYING)[^/]*$/i.test(f.path)) ? 1 : 0,
    });
    if (someText(code, /(process\.env\.|import\.meta\.env\.|Bun\.env\.|os\.environ|os\.getenv)/))
      add({
        id: "docs.envExample",
        category: "docs",
        weight: 1,
        value: files.some((f) => isEnvExample(f.path)) ? 1 : 0,
      });
    if (docs.length === 0 && !readme) add({ id: "docs.any", category: "docs", weight: 1, value: 0 });
  }

  if (has("dependencies")) {
    const manifests = snap.packages;
    if (manifests.length) {
      // Workspaces share one lockfile at the top, so any lockfile above counts.
      const locked = (dir: string) =>
        files.some((f) => LOCK.test(f.path) && (dir === "" || `${dir}/`.startsWith(f.path.replace(/[^/]+$/, ""))));
      const unlocked = manifests.filter((p) => !locked(p.path.replace(/\/?package\.json$/, "")));
      add({
        id: "deps.lockfile",
        category: "dependencies",
        weight: 1.5,
        value: 1 - unlocked.length / manifests.length,
        evidence: unlocked.map((p) => ({ path: p.path })),
      });
      const loose: Evidence[] = [];
      for (const p of manifests)
        for (const key of ["dependencies", "devDependencies"])
          for (const [name, version] of Object.entries((p.json[key] as Record<string, string>) ?? {}))
            if (version === "*" || version === "latest" || version === "" || /^>=?\s*\d/.test(version))
              loose.push({ path: p.path, note: `${name}@${version || '""'}` });
      add({
        id: "deps.loose",
        category: "dependencies",
        weight: 1,
        value: ratio(loose.length, 4),
        metric: String(loose.length),
        evidence: loose.slice(0, 10),
      });
      const dirs = new Map<string, number>();
      for (const f of files)
        if (/(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(f.path))
          dirs.set(f.path.replace(/[^/]+$/, ""), (dirs.get(f.path.replace(/[^/]+$/, "")) ?? 0) + 1);
      const mixed = [...dirs.entries()].filter(([, n]) => n > 1);
      add({
        id: "deps.mixedLocks",
        category: "dependencies",
        weight: 0.5,
        value: mixed.length ? 0 : 1,
        evidence: mixed.map(([d]) => ({ path: d || "." })),
      });
    }
    const deprecated = [
      "request",
      "node-sass",
      "tslint",
      "babel-eslint",
      "left-pad",
      "querystring",
      "uuid-v4",
      "gulp-util",
      "istanbul",
      "nomnom",
      "coffee-script",
    ].filter((d) => snap.deps.has(d));
    add({
      id: "deps.deprecated",
      category: "dependencies",
      weight: 1,
      value: ratio(deprecated.length, 2),
      metric: String(deprecated.length),
      evidence: deprecated.map((d) => ({ path: "package.json", note: d })),
    });
  }
  return out;
}

/** "src/a.ts(12,5): error" and "src/a.ts:12:5 - error" lines from compilers and linters. */
function outputEvidence(output: string, snap: Snapshot): Evidence[] {
  const out: Evidence[] = [];
  for (const m of output.matchAll(/([\w./@-]+\.[a-z]{1,5})(?:\((\d+),\d+\)|:(\d+)(?::\d+)?)/g)) {
    const path = (m[1] ?? "").replace(/^\.\//, "");
    if (!snap.byPath.has(path)) continue;
    const line = Number(m[2] ?? m[3]);
    if (!out.some((e) => e.path === path && e.line === line)) out.push({ path, line });
    if (out.length >= 12) break;
  }
  return out;
}

/** The project's own tools, when the user has run them in the last two weeks. */
function toolDrafts(snap: Snapshot, tools: ToolResult[], present: Category[]): Draft[] {
  const fresh = tools.filter((t) => Date.now() - t.at < 14 * 86_400_000);
  const out: Draft[] = [];
  for (const t of fresh) {
    if (t.kind === "typecheck" && present.includes("architecture"))
      out.push({
        id: "tool.typecheck",
        category: "architecture",
        weight: 2,
        value: t.ok ? 1 : 0,
        metric: t.command,
        evidence: outputEvidence(t.output, snap),
      });
    if (t.kind === "lint" && present.includes("architecture"))
      out.push({
        id: "tool.lint",
        category: "architecture",
        weight: 1.5,
        value: t.ok ? 1 : 0.3,
        metric: t.command,
        evidence: outputEvidence(t.output, snap),
      });
    if (t.kind === "test" && present.includes("testing")) {
      const passed = t.tests?.passed ?? 0;
      const failed = t.tests?.failed ?? 0;
      const value = t.ok ? 1 : passed + failed > 0 ? passed / (passed + failed) / 2 : 0;
      out.push({
        id: "tool.tests",
        category: "testing",
        weight: 3,
        value,
        metric: passed + failed > 0 ? `${passed}/${passed + failed}` : t.ok ? "ok" : "fail",
        evidence: outputEvidence(t.output, snap),
      });
    }
    if (t.kind === "dead" && t.dead !== undefined && present.includes("architecture"))
      out.push({
        id: "tool.dead",
        category: "architecture",
        weight: 1.5,
        value: t.dead === 0 ? 1 : t.dead < 10 ? 0.6 : 0.3,
        metric: String(t.dead),
        evidence: outputEvidence(t.output, snap),
      });
    if (t.kind === "audit" && t.vulnerabilities) {
      const v = t.vulnerabilities;
      const serious = (v.critical ?? 0) + (v.high ?? 0);
      const value = serious ? 0 : (v.moderate ?? 0) ? 0.5 : (v.low ?? 0) || (v.info ?? 0) || (v.unknown ?? 0) ? 0.8 : 1;
      const metric =
        Object.entries(v)
          .filter(([, n]) => n)
          .map(([k, n]) => `${n} ${k}`)
          .join(", ") || "0";
      if (present.includes("dependencies"))
        out.push({ id: "tool.audit", category: "dependencies", weight: 2, value, metric });
      if (serious && present.includes("security"))
        out.push({ id: "tool.auditSecurity", category: "security", weight: 1, value: 0, metric });
    }
  }
  return out;
}

/** "page at width": where a real-screen finding was seen. */
const seenAt = (p: UiPageCheck) => `${p.path} (${p.viewport})`;

/**
 * The real-screen check as findings (plan.md 5.3): what the running app showed in a browser, next
 * to what its code says. Accessibility and layout count for the interface, errors and broken images
 * for the front end, loading and layout shift for performance. Only when there is a check to read.
 */
function uiDrafts(audit: UiAudit | undefined, present: Category[]): Draft[] {
  const pages = (audit?.pages ?? []).filter((p) => !p.error);
  if (!pages.length) return [];
  const out: Draft[] = [];
  const ux: Category = present.includes("uiux") ? "uiux" : "frontend";
  const fe: Category = "frontend";
  if (!present.includes(fe)) return out;
  const serious = pages.flatMap((p) =>
    p.violations
      .filter((v) => v.id !== "color-contrast" && (v.impact === "serious" || v.impact === "critical"))
      .map((v) => ({ page: p, v })),
  );
  out.push({
    id: "ui.a11y",
    category: ux,
    weight: 2,
    value: ratio(
      serious.reduce((n, x) => n + x.v.nodes, 0),
      15,
    ),
    metric: String(serious.length),
    evidence: serious.slice(0, 10).map(({ page, v }) => ({ path: seenAt(page), note: `${v.help} (${v.nodes})` })),
  });
  const contrast = pages.flatMap((p) =>
    p.violations.filter((v) => v.id === "color-contrast").map((v) => ({ page: p, v })),
  );
  out.push({
    id: "ui.contrast",
    category: ux,
    weight: 1.5,
    value: ratio(
      contrast.reduce((n, x) => n + x.v.nodes, 0),
      20,
    ),
    metric: String(contrast.reduce((n, x) => n + x.v.nodes, 0)),
    evidence: contrast.slice(0, 10).map(({ page, v }) => ({ path: seenAt(page), note: v.target ?? v.help })),
  });
  const overflow = pages.filter((p) => p.overflowX);
  out.push({
    id: "ui.overflow",
    category: ux,
    weight: 1,
    value: ratio(overflow.length, Math.max(1, pages.length / 2)),
    metric: String(overflow.length),
    evidence: overflow.map((p) => ({ path: seenAt(p) })),
  });
  const errors = pages.filter((p) => p.consoleErrors.length);
  out.push({
    id: "ui.console",
    category: fe,
    weight: 1.5,
    value: ratio(errors.length, Math.max(1, pages.length / 2)),
    metric: String(errors.reduce((n, p) => n + p.consoleErrors.length, 0)),
    evidence: errors.slice(0, 8).map((p) => ({ path: seenAt(p), note: p.consoleErrors[0] })),
  });
  const broken = pages.filter((p) => p.brokenImages > 0);
  out.push({
    id: "ui.images",
    category: fe,
    weight: 0.5,
    value: broken.length ? 0 : 1,
    metric: String(broken.reduce((n, p) => n + p.brokenImages, 0)),
    evidence: broken.map((p) => ({ path: seenAt(p), note: String(p.brokenImages) })),
  });
  // Web Vitals "good" thresholds (web.dev): LCP at most 2.5 s, CLS at most 0.1.
  const timed = pages.filter((p) => p.lcpMs !== undefined || p.cls !== undefined);
  if (timed.length) {
    const slow = timed.filter((p) => (p.lcpMs ?? 0) > 2500 || (p.cls ?? 0) > 0.1);
    out.push({
      id: "ui.vitals",
      category: present.includes("performance") ? "performance" : fe,
      weight: 1.5,
      value: ratio(slow.length, Math.max(1, timed.length / 2)),
      metric: String(slow.length),
      evidence: slow.map((p) => ({ path: seenAt(p), note: `LCP ${p.lcpMs ?? "?"} ms, CLS ${p.cls ?? "?"}` })),
    });
  }
  return out;
}

export function scoreCategories(
  snap: Snapshot,
  opts: { config?: InsightConfig; tools?: ToolResult[]; ui?: UiAudit } = {},
): { categories: CategoryScore[]; overall: number; catalog: Partial<Record<Category, string[]>> } {
  const present = presentCategories(snap);
  const disabled = new Set(opts.config?.disabled ?? []);
  const all = [
    ...runChecks(snap, present),
    ...toolDrafts(snap, opts.tools ?? [], present),
    ...uiDrafts(opts.ui, present),
  ];
  // Every check that applies here, including ones the user turned off (so they can be turned back on).
  const catalog: Partial<Record<Category, string[]>> = {};
  for (const d of all) catalog[d.category] = [...(catalog[d.category] ?? []), d.id];
  const drafts = all.filter((d) => !disabled.has(d.id));
  const weights: Partial<Record<Category, number>> = { ...DEFAULT_WEIGHTS, ...(opts.config?.weights ?? {}) };
  const categories: CategoryScore[] = present.map((category) => {
    const own = drafts.filter((d) => d.category === category);
    const total = own.reduce((n, d) => n + d.weight, 0) || 1;
    const findings: Finding[] = own
      .map((d) => ({
        id: d.id,
        category,
        status: (d.value >= 0.999 ? "pass" : d.value >= 0.5 ? "warn" : "fail") as Finding["status"],
        value: Math.round(d.value * 100) / 100,
        weight: d.weight,
        gain: Math.round((100 * d.weight * (1 - d.value)) / total),
        metric: d.metric,
        evidence: d.evidence ?? [],
      }))
      .sort((a, b) => b.gain - a.gain);
    const score = Math.round((100 * own.reduce((n, d) => n + d.weight * d.value, 0)) / total);
    const all = snap.files.filter((f) => filesOf(category, f.path)).map((f) => f.path);
    return { category, score, grade: gradeOf(score), findings, files: all.slice(0, 200), fileCount: all.length };
  });
  const sum = categories.reduce((n, c) => n + (weights[c.category] ?? 1), 0) || 1;
  const overall = Math.round(categories.reduce((n, c) => n + c.score * (weights[c.category] ?? 1), 0) / sum);
  return { categories, overall, catalog };
}
