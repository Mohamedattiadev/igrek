/** Knowledge engine (plan.md 7.1b): personas keep up with their field from free, public sources. */

/** Where a persona looks. Every list is optional; nothing here needs an account. */
export interface KnowledgeSources {
  /** Hacker News search words (Algolia API). */
  hn: string[];
  /** Subreddits (public RSS). */
  reddit: string[];
  /** Lobsters tags. */
  lobsters: string[];
  /** Mastodon hashtags (mastodon.social public timeline). */
  mastodon: string[];
  /** Bluesky search words (public API). */
  bluesky: string[];
  /** arXiv categories, e.g. cs.AI. */
  arxiv: string[];
  /** GitHub topics: new, fast-rising repositories. */
  github: string[];
  /** Product Hunt's daily launches. */
  productHunt: boolean;
  /** Hugging Face daily papers. */
  hfPapers: boolean;
  /** RSS or Atom feeds: official blogs, changelogs, newsletters, podcasts. */
  feeds: string[];
}

export interface NewsItem {
  id: string;
  personaId: string;
  title: string;
  url: string;
  /** "Hacker News", "r/devops", "arXiv cs.AI", a feed's host. */
  source: string;
  publishedAt?: number;
  /** 0–10, from the persona's point of view. */
  importance: number;
  /** Is it a real change or noise? */
  verdict: "real" | "hype" | "unclear";
  /** One or two sentences in the user's language. */
  summary: string;
  why: string;
  /** Names of the user's projects it affects. */
  affects: string[];
  /** In how many sources the same story showed up. */
  mentions: number;
  createdAt: number;
}

/** A newer version of a package one of the user's projects uses. */
export interface PackageUpdate {
  projectId: string;
  projectName: string;
  name: string;
  current: string;
  latest: string;
  major: boolean;
  releasedAt?: number;
  /** What in the release could affect the project, when it was looked at. */
  notes?: string;
  url: string;
}

export interface TechTrend {
  term: string;
  thisWeek: number;
  /** Average per week over the four weeks before. */
  before: number;
}

export interface KnowledgeOverview {
  lastScan?: number;
  scanning: boolean;
  items: NewsItem[];
  rising: TechTrend[];
  falling: TechTrend[];
  updates: PackageUpdate[];
}

/** "React or Svelte?": current numbers, each with where it came from. */
export interface PackageComparison {
  name: string;
  weeklyDownloads?: number;
  /** Weekly downloads one year ago, for the trend. */
  yearAgoDownloads?: number;
  stars?: number;
  openIssues?: number;
  lastRelease?: { version: string; at: number };
  lastPush?: number;
  license?: string;
  /** Hacker News stories in the last 90 days. */
  hnStories?: number;
  repo?: string;
  error?: string;
}

const none: KnowledgeSources = {
  hn: [],
  reddit: [],
  lobsters: [],
  mastodon: [],
  bluesky: [],
  arxiv: [],
  github: [],
  productHunt: false,
  hfPapers: false,
  feeds: [],
};

/** Starting sources per persona (the user can change them). Personas not listed follow nothing until set. */
export const DEFAULT_SOURCES: Record<string, KnowledgeSources> = {
  "ai-engineer": {
    ...none,
    hn: ["LLM", "AI agents"],
    reddit: ["MachineLearning", "LocalLLaMA"],
    lobsters: ["ai"],
    arxiv: ["cs.CL", "cs.AI"],
    github: ["llm"],
    hfPapers: true,
  },
  frontend: {
    ...none,
    hn: ["React", "CSS"],
    reddit: ["webdev", "reactjs"],
    lobsters: ["web", "javascript"],
    mastodon: ["webdev"],
  },
  backend: { ...none, hn: ["API design", "Node.js"], reddit: ["node", "golang"], lobsters: ["programming"] },
  database: { ...none, hn: ["PostgreSQL", "SQLite"], reddit: ["PostgreSQL", "Database"], lobsters: ["databases"] },
  devops: {
    ...none,
    hn: ["Kubernetes", "outage"],
    reddit: ["devops", "selfhosted"],
    lobsters: ["devops"],
    mastodon: ["devops"],
  },
  security: {
    ...none,
    hn: ["vulnerability", "supply chain attack"],
    reddit: ["netsec"],
    lobsters: ["security"],
    mastodon: ["infosec"],
  },
  performance: { ...none, hn: ["performance"], lobsters: ["performance"] },
  mobile: { ...none, reddit: ["androiddev", "iOSProgramming", "FlutterDev"] },
  "data-engineer": { ...none, reddit: ["dataengineering"], hn: ["data engineering"] },
  uiux: { ...none, reddit: ["UXDesign"], hn: ["design system"] },
  "product-manager": { ...none, productHunt: true, reddit: ["ProductManagement"] },
  growth: { ...none, productHunt: true, hn: ["launch", "SEO"] },
  "competitor-analyst": { ...none, productHunt: true },
  "rnd-engineer": { ...none, github: ["developer-tools"], hn: ["Show HN"] },
  researcher: { ...none, arxiv: ["cs.SE"], hfPapers: true },
};

export const EMPTY_SOURCES = none;

/** Technologies counted for the "rising and falling" panel. */
export const TECH_TERMS = [
  "react",
  "vue",
  "svelte",
  "angular",
  "solid",
  "next.js",
  "nuxt",
  "astro",
  "remix",
  "htmx",
  "vite",
  "webpack",
  "tailwind",
  "typescript",
  "javascript",
  "bun",
  "deno",
  "node.js",
  "rust",
  "go",
  "python",
  "java",
  "kotlin",
  "swift",
  "flutter",
  "react native",
  "wasm",
  "webassembly",
  "graphql",
  "grpc",
  "postgres",
  "postgresql",
  "sqlite",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "clickhouse",
  "duckdb",
  "kubernetes",
  "docker",
  "terraform",
  "nix",
  "cloudflare",
  "vercel",
  "supabase",
  "firebase",
  "aws",
  "llm",
  "rag",
  "mcp",
  "agents",
  "ollama",
  "pytorch",
  "langchain",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "llama",
  "mistral",
];
