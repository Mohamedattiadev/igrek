import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LibrarySuggestion } from "@igrek/core";

/**
 * What the library could hold next, without asking a model: the official docs of what the user's
 * projects are built with (read from their manifests), and the free reference sources each expert
 * works from. All free to read; adding one downloads the page into the library.
 */

/** Free, official or long-standing references, and the experts who read them. */
const EXPERT_SOURCES: { url: string; title: string; personas: string[] }[] = [
  { url: "https://owasp.org/Top10/", title: "OWASP Top 10", personas: ["security", "pentester", "backend"] },
  {
    url: "https://cheatsheetseries.owasp.org/",
    title: "OWASP Cheat Sheet Series",
    personas: ["security", "pentester", "backend", "frontend"],
  },
  {
    url: "https://owasp.org/www-project-application-security-verification-standard/",
    title: "OWASP Application Security Verification Standard",
    personas: ["security", "pentester"],
  },
  {
    url: "https://www.w3.org/WAI/WCAG22/quickref/",
    title: "WCAG 2.2 quick reference",
    personas: ["a11y-tester", "uiux", "frontend"],
  },
  {
    url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility",
    title: "MDN: Accessibility",
    personas: ["a11y-tester", "frontend"],
  },
  { url: "https://web.dev/articles/vitals", title: "Web Vitals", personas: ["performance", "frontend"] },
  {
    url: "https://web.dev/baseline",
    title: "Baseline: web features you can use",
    personas: ["cross-browser-tester", "frontend"],
  },
  {
    url: "https://react.dev/learn/you-might-not-need-an-effect",
    title: "React: You Might Not Need an Effect",
    personas: ["frontend"],
  },
  {
    url: "https://use-the-index-luke.com/",
    title: "Use The Index, Luke",
    personas: ["database", "performance", "backend"],
  },
  {
    url: "https://www.postgresql.org/docs/current/performance-tips.html",
    title: "PostgreSQL: Performance Tips",
    personas: ["database", "performance"],
  },
  {
    url: "https://www.rfc-editor.org/rfc/rfc9110",
    title: "RFC 9110: HTTP Semantics",
    personas: ["backend", "architect"],
  },
  {
    url: "https://www.rfc-editor.org/rfc/rfc9457",
    title: "RFC 9457: Problem Details for HTTP APIs",
    personas: ["backend"],
  },
  { url: "https://12factor.net/", title: "The Twelve-Factor App", personas: ["devops", "backend", "architect"] },
  {
    url: "https://sre.google/sre-book/table-of-contents/",
    title: "Site Reliability Engineering (Google)",
    personas: ["devops", "chaos-tester"],
  },
  {
    url: "https://sre.google/workbook/table-of-contents/",
    title: "The Site Reliability Workbook (Google)",
    personas: ["devops"],
  },
  { url: "https://dora.dev/", title: "DORA research", personas: ["devops", "pm-lead"] },
  { url: "https://principlesofchaos.org/", title: "Principles of Chaos Engineering", personas: ["chaos-tester"] },
  { url: "https://c4model.com/", title: "The C4 model", personas: ["architect", "tech-writer"] },
  {
    url: "https://martinfowler.com/bliki/StranglerFigApplication.html",
    title: "Strangler Fig Application (Martin Fowler)",
    personas: ["architect"],
  },
  {
    url: "https://martinfowler.com/articles/practical-test-pyramid.html",
    title: "The Practical Test Pyramid",
    personas: ["qa", "unit-tester", "integration-tester", "e2e-tester"],
  },
  {
    url: "https://playwright.dev/docs/best-practices",
    title: "Playwright: Best Practices",
    personas: ["e2e-tester", "cross-browser-tester"],
  },
  { url: "https://grafana.com/docs/k6/latest/", title: "Grafana k6 documentation", personas: ["load-tester"] },
  {
    url: "https://www.nngroup.com/articles/ten-usability-heuristics/",
    title: "10 Usability Heuristics (Nielsen Norman Group)",
    personas: ["uiux"],
  },
  {
    url: "https://developer.apple.com/design/human-interface-guidelines/",
    title: "Apple Human Interface Guidelines",
    personas: ["mobile", "uiux"],
  },
  { url: "https://m3.material.io/", title: "Material Design 3", personas: ["mobile", "uiux"] },
  { url: "https://diataxis.fr/", title: "Diataxis", personas: ["tech-writer"] },
  { url: "https://keepachangelog.com/en/1.1.0/", title: "Keep a Changelog", personas: ["tech-writer"] },
  { url: "https://semver.org/", title: "Semantic Versioning", personas: ["tech-writer", "devops"] },
  { url: "https://choosealicense.com/licenses/", title: "Choose a License: licenses compared", personas: ["legal"] },
  { url: "https://gdpr-info.eu/", title: "GDPR text, article by article", personas: ["legal"] },
  { url: "https://www.kvkk.gov.tr/", title: "KVKK (Kişisel Verileri Koruma Kurumu)", personas: ["legal"] },
  {
    url: "https://www.anthropic.com/engineering/building-effective-agents",
    title: "Building effective agents (Anthropic)",
    personas: ["ai-engineer"],
  },
];

/** Official docs of common dependencies, by the name they have in a manifest. */
const DOCS: Record<string, { url: string; title: string; personas: string[] }> = {
  react: { url: "https://react.dev/reference/react", title: "React reference", personas: ["frontend"] },
  next: { url: "https://nextjs.org/docs", title: "Next.js documentation", personas: ["frontend", "backend"] },
  vue: { url: "https://vuejs.org/guide/introduction.html", title: "Vue guide", personas: ["frontend"] },
  svelte: { url: "https://svelte.dev/docs", title: "Svelte documentation", personas: ["frontend"] },
  vite: { url: "https://vite.dev/guide/", title: "Vite guide", personas: ["frontend"] },
  tailwindcss: {
    url: "https://tailwindcss.com/docs",
    title: "Tailwind CSS documentation",
    personas: ["frontend", "uiux"],
  },
  typescript: {
    url: "https://www.typescriptlang.org/docs/handbook/intro.html",
    title: "The TypeScript Handbook",
    personas: ["frontend", "backend"],
  },
  express: { url: "https://expressjs.com/en/guide/routing.html", title: "Express guide", personas: ["backend"] },
  hono: { url: "https://hono.dev/docs/", title: "Hono documentation", personas: ["backend"] },
  "@nestjs/core": {
    url: "https://docs.nestjs.com/",
    title: "NestJS documentation",
    personas: ["backend", "architect"],
  },
  fastify: { url: "https://fastify.dev/docs/latest/", title: "Fastify documentation", personas: ["backend"] },
  prisma: { url: "https://www.prisma.io/docs", title: "Prisma documentation", personas: ["database", "backend"] },
  "drizzle-orm": {
    url: "https://orm.drizzle.team/docs/overview",
    title: "Drizzle ORM documentation",
    personas: ["database", "backend"],
  },
  pg: { url: "https://www.postgresql.org/docs/current/", title: "PostgreSQL documentation", personas: ["database"] },
  mongoose: { url: "https://mongoosejs.com/docs/", title: "Mongoose documentation", personas: ["database", "backend"] },
  ioredis: { url: "https://redis.io/docs/latest/", title: "Redis documentation", personas: ["database", "backend"] },
  "@playwright/test": {
    url: "https://playwright.dev/docs/intro",
    title: "Playwright documentation",
    personas: ["e2e-tester"],
  },
  vitest: { url: "https://vitest.dev/guide/", title: "Vitest guide", personas: ["unit-tester"] },
  jest: { url: "https://jestjs.io/docs/getting-started", title: "Jest documentation", personas: ["unit-tester"] },
  "react-native": {
    url: "https://reactnative.dev/docs/getting-started",
    title: "React Native documentation",
    personas: ["mobile"],
  },
  django: { url: "https://docs.djangoproject.com/en/stable/", title: "Django documentation", personas: ["backend"] },
  flask: { url: "https://flask.palletsprojects.com/", title: "Flask documentation", personas: ["backend"] },
  fastapi: { url: "https://fastapi.tiangolo.com/", title: "FastAPI documentation", personas: ["backend"] },
  sqlalchemy: {
    url: "https://docs.sqlalchemy.org/",
    title: "SQLAlchemy documentation",
    personas: ["database", "backend"],
  },
  pytest: { url: "https://docs.pytest.org/", title: "pytest documentation", personas: ["unit-tester"] },
};
// The same docs under other names a manifest may use.
DOCS["react-dom"] = DOCS.react as (typeof DOCS)[string];
DOCS.postgres = DOCS.pg as (typeof DOCS)[string];
DOCS.redis = DOCS.ioredis as (typeof DOCS)[string];

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The dependency names of a project folder: npm (root and one workspace level) and Python. */
export function projectDependencies(dir: string): string[] {
  const names = new Set<string>();
  const npm = (file: string) => {
    const pkg = readJson(file);
    for (const field of ["dependencies", "devDependencies"])
      for (const name of Object.keys((pkg?.[field] as Record<string, unknown>) ?? {})) names.add(name);
  };
  npm(join(dir, "package.json"));
  for (const sub of ["apps", "packages"])
    for (const entry of safeList(join(dir, sub))) npm(join(dir, sub, entry, "package.json"));
  const requirements = join(dir, "requirements.txt");
  if (existsSync(requirements))
    for (const line of readFileSync(requirements, "utf8").split("\n")) {
      const name = line.trim().match(/^([A-Za-z0-9_.-]+)/)?.[1];
      if (name && !line.trim().startsWith("#")) names.add(name.toLowerCase());
    }
  const pyproject = join(dir, "pyproject.toml");
  if (existsSync(pyproject))
    for (const m of readFileSync(pyproject, "utf8").matchAll(/^\s*"?([A-Za-z0-9_.-]+)\s*(?:[<>=~!]|"|$)/gm))
      if (m[1]) names.add(m[1].toLowerCase());
  return [...names];
}

function safeList(dir: string): string[] {
  try {
    return existsSync(dir) ? readdirSync(dir) : [];
  } catch {
    return [];
  }
}

/** Sources not in the library yet: docs of what the projects use (most used first), then the experts' references. */
export function librarySuggestions(projects: { name: string; path: string }[], have: Set<string>): LibrarySuggestion[] {
  const used = new Map<string, string[]>();
  for (const project of projects)
    for (const dep of projectDependencies(project.path)) {
      const doc = DOCS[dep];
      if (!doc) continue;
      const list = used.get(doc.url) ?? [];
      if (!list.includes(project.name)) used.set(doc.url, [...list, project.name]);
    }
  const docs = [...used]
    .map(([url, projectNames]) => {
      const doc = Object.values(DOCS).find((d) => d.url === url) as (typeof DOCS)[string];
      return { url, title: doc.title, personaIds: doc.personas, kind: "doc" as const, projects: projectNames };
    })
    .sort((a, b) => b.projects.length - a.projects.length);
  const experts = EXPERT_SOURCES.map((s) => ({
    url: s.url,
    title: s.title,
    personaIds: s.personas,
    kind: "web" as const,
  }));
  return [...docs, ...experts].filter((s) => !have.has(s.url));
}
