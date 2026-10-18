import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** What the checks look at: tracked files, their text (when small and safe), and manifests. */
export interface RepoFile {
  path: string;
  size: number;
  /** Only for small text files that are safe to read (never .env, keys, lockfiles). */
  text?: string;
  lines: number;
}

export interface Snapshot {
  root: string;
  files: RepoFile[];
  byPath: Map<string, RepoFile>;
  /** package.json files, parsed. */
  packages: { path: string; json: Record<string, unknown> }[];
  /** Every dependency name found in any manifest (npm, Python, Go, Rust, Ruby). */
  deps: Set<string>;
}

const MAX_FILES = 6000;
const MAX_READ = 256 * 1024;
const MAX_TOTAL = 24 * 1024 * 1024;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "out",
  "coverage",
  "venv",
  ".venv",
  "__pycache__",
  "target",
  "vendor",
  ".turbo",
  ".cache",
]);

const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro|py|go|rs|rb|java|kt|swift|php|cs|c|h|cpp|hpp|scala|ex|exs|dart|lua|sh|bash|zsh|sql|prisma|graphql|gql|css|scss|sass|less|html|htm|md|mdx|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|xml|tf|hcl|nix|gradle)$/i;
const TEXT_NAMES =
  /(^|\/)(Dockerfile[^/]*|Containerfile|Makefile|Procfile|Caddyfile|Gemfile|\.gitignore|\.dockerignore|LICENSE[^/]*|README[^/]*|CHANGELOG[^/]*)$/i;

/** Never opened: secrets and things that only look like text. */
export const SENSITIVE =
  /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx|keystore|jks)|id_(rsa|ed25519|ecdsa)[^/]*|\.npmrc|\.pypirc|credentials[^/]*)$/i;
export const isEnvExample = (path: string) =>
  /(^|\/)\.env(\.[^/]+)?\.(example|sample|template|dist|defaults)$/i.test(path);
const LOCKFILE =
  /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;

function listTracked(root: string): string[] | undefined {
  const proc = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  if (proc.exitCode !== 0) return undefined;
  return proc.stdout.toString().split("\0").filter(Boolean);
}

function walk(root: string, dir = "", out: string[] = []): string[] {
  if (out.length >= MAX_FILES) return out;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, rel, out);
    } else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function pythonDeps(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"))
    .map((l) => l.split(/[<>=!~[;\s]/)[0]?.toLowerCase() ?? "")
    .filter(Boolean);
}

export function takeSnapshot(root: string): Snapshot {
  const paths = (listTracked(root) ?? walk(root))
    .filter((p) => !p.split("/").some((seg) => SKIP_DIRS.has(seg)))
    .slice(0, MAX_FILES);
  const files: RepoFile[] = [];
  let total = 0;
  for (const path of paths) {
    let size = 0;
    try {
      size = statSync(join(root, path)).size;
    } catch {
      continue; // deleted but still in the index
    }
    const file: RepoFile = { path, size, lines: 0 };
    // Example env files only hold names and placeholders, so they're read (real .env files never are).
    const readable =
      (TEXT_EXT.test(path) || TEXT_NAMES.test(path) || isEnvExample(path)) &&
      (!SENSITIVE.test(path) || isEnvExample(path)) &&
      !LOCKFILE.test(path);
    if (readable && size <= MAX_READ && total + size <= MAX_TOTAL) {
      try {
        const text = readFileSync(join(root, path), "utf8");
        if (!text.includes("\0")) {
          file.text = text;
          file.lines = text.split("\n").length;
          total += size;
        }
      } catch {
        // unreadable: keep it as a name only
      }
    }
    files.push(file);
  }

  const byPath = new Map(files.map((f) => [f.path, f]));
  const packages: Snapshot["packages"] = [];
  const deps = new Set<string>();
  for (const f of files) {
    const name = f.path.split("/").pop() ?? "";
    if (!f.text) continue;
    if (name === "package.json") {
      try {
        const json = JSON.parse(f.text) as Record<string, unknown>;
        packages.push({ path: f.path, json });
        for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])
          for (const dep of Object.keys((json[key] as Record<string, string>) ?? {})) deps.add(dep);
      } catch {
        // invalid JSON: the checks will notice nothing, which is fine
      }
    } else {
      const pattern =
        name === "pyproject.toml"
          ? /^\s*"?([A-Za-z0-9_.-]+)\s*[<>=~"]/gm
          : name === "go.mod"
            ? /^\s*([\w.-]+\/[\w./-]+)\s+v/gm
            : name === "Cargo.toml"
              ? /^([a-z0-9_-]+)\s*=/gm
              : name === "Gemfile"
                ? /^\s*gem\s+["']([\w-]+)/gm
                : undefined;
      if (/^requirements[^/]*\.txt$/.test(name)) for (const d of pythonDeps(f.text)) deps.add(d);
      else if (pattern)
        for (const m of f.text.matchAll(pattern))
          if (m[1]) deps.add(name === "pyproject.toml" ? m[1].toLowerCase() : m[1]);
    }
  }
  return { root, files, byPath, packages, deps };
}
