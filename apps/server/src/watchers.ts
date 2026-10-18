import type { Database } from "bun:sqlite";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findSecrets, type InboxNotice } from "@igrek/core";
import type { Store } from "./store";

const MARK = "igrek-secret-guard";
/** Guards installed before the rename count as ours: recognised and replaced. */
const OLD_MARK = "godeye-secret-guard";
const isGuard = (script: string) => script.includes(MARK) || script.includes(OLD_MARK);

function git(cwd: string, args: string[]): string {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return p.exitCode === 0 ? p.stdout.toString() : "";
}

export interface SecretFinding {
  projectId: string;
  hash: string;
  file: string;
  line: number;
  /** The secret, masked ("sk-a••••9xQz"). */
  hint: string;
  at: number;
  dismissed: boolean;
}

/** Added lines of a patch that look like secrets: file, line in the new file, masked hint. */
/** Files where a key-looking value is expected and not a leak: examples, templates, tests, fixtures. */
const PLACEHOLDER_FILE =
  /(^|\/)(\.env\.example|[^/]*\.sample|[^/]*\.template|[^/]*\.(test|spec)\.[cm]?[jt]sx?|[^/]*_test\.(go|py)|test_[^/]*\.py)$|(^|\/)(__tests__|fixtures|testdata)\//;

/** Documentation and teaching material: only real provider keys count there, not example lines. */
const DOC_FILE = /(^|\/)(docs?|examples?|content|guides?|tutorials?)\/|\.(md|mdx|rst|adoc|txt)$/i;

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|swift|dart)$/i;

export function secretsInPatch(patch: string): { file: string; line: number; hint: string }[] {
  const out: { file: string; line: number; hint: string }[] = [];
  let file = "";
  let line = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      // Example and template files hold placeholders, and tests hold made-up keys on purpose.
      if (!PLACEHOLDER_FILE.test(file))
        for (const s of findSecrets(raw.slice(1), DOC_FILE.test(file), CODE_FILE.test(file)))
          out.push({ file, line, hint: s.hint });
      line++;
    } else if (!raw.startsWith("-")) line++;
  }
  return out;
}

/**
 * Secret scanning (plan.md 11): new commits of every project are read for API keys, tokens and
 * passwords; what is found shows in the inbox (masked) with the commit and line. An optional git
 * pre-commit hook asks God Eye before each commit and stops one that adds a secret.
 */
export class SecretScanner {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
  ) {}

  scanAll(): number {
    let found = 0;
    for (const p of this.store.liveProjectRows())
      if (!p.hidden && existsSync(join(p.path, ".git"))) found += this.scan(p.id);
    return found;
  }

  /**
   * Findings saved before placeholders ("paste-the-key-here", "PASSWORD") were recognized: the line
   * is read again from its commit, once per project, and closed when it holds no real secret.
   */
  private recheck(projectId: string, path: string): void {
    const key = `secrets-recheck-v5:${projectId}`;
    if (this.db.query("SELECT 1 FROM lesson_state WHERE key = ?").get(key)) return;
    const rows = this.db
      .query("SELECT hash, file, line FROM secret_findings WHERE project_id = ? AND dismissed = 0")
      .all(projectId) as { hash: string; file: string; line: number }[];
    for (const r of rows) {
      const text = git(path, ["show", `${r.hash}:${r.file}`]);
      if (!text) continue;
      if (!findSecrets(text.split("\n")[r.line - 1] ?? "", DOC_FILE.test(r.file), CODE_FILE.test(r.file)).length)
        this.dismiss(projectId, r.hash, r.file, r.line);
    }
    this.db.query("INSERT OR REPLACE INTO lesson_state (key, value) VALUES (?, ?)").run(key, "1");
  }

  scan(projectId: string): number {
    const project = this.store.projectRow(projectId);
    if (!project) return 0;
    this.recheck(projectId, project.path);
    const key = `secrets:${projectId}`;
    const last = (
      this.db.query("SELECT value FROM lesson_state WHERE key = ?").get(key) as { value: string } | undefined
    )?.value;
    const head = git(project.path, ["rev-parse", "HEAD"]).trim();
    if (!head || head === last) return 0;
    const range =
      last && git(project.path, ["cat-file", "-t", last]).trim() === "commit"
        ? [`${last}..HEAD`]
        : ["--since=90.days", "-n", "300"];
    const log = git(project.path, [
      "log",
      ...range,
      "-p",
      "--no-color",
      "-U0",
      "--no-merges",
      "--format=__COMMIT__%H %ct",
    ]);
    let found = 0;
    const insert = this.db.query(
      "INSERT OR IGNORE INTO secret_findings (project_id, hash, file, line, hint, at, dismissed) VALUES (?, ?, ?, ?, ?, ?, 0)",
    );
    for (const chunk of log.split("__COMMIT__").slice(1)) {
      const [first, ...rest] = chunk.split("\n");
      const [hash, ts] = (first ?? "").split(" ");
      if (!hash) continue;
      for (const s of secretsInPatch(rest.join("\n")))
        found += insert.run(projectId, hash, s.file, s.line, s.hint, Number(ts) * 1000 || Date.now()).changes;
    }
    this.db.query("INSERT OR REPLACE INTO lesson_state (key, value) VALUES (?, ?)").run(key, head);
    return found;
  }

  list(projectId?: string, includeDismissed = false): SecretFinding[] {
    const rows = this.db
      .query(`SELECT * FROM secret_findings ${projectId ? "WHERE project_id = ?" : ""} ORDER BY at DESC LIMIT 200`)
      .all(...(projectId ? [projectId] : [])) as {
      project_id: string;
      hash: string;
      file: string;
      line: number;
      hint: string;
      at: number;
      dismissed: number;
    }[];
    return (
      rows
        // Findings from before test files were left out.
        .filter((r) => !PLACEHOLDER_FILE.test(r.file))
        .filter((r) => includeDismissed || !r.dismissed)
        .map((r) => ({
          projectId: r.project_id,
          hash: r.hash,
          file: r.file,
          line: r.line,
          hint: r.hint,
          at: r.at,
          dismissed: !!r.dismissed,
        }))
    );
  }

  dismiss(projectId: string, hash: string, file: string, line: number): void {
    this.db
      .query("UPDATE secret_findings SET dismissed = 1 WHERE project_id = ? AND hash = ? AND file = ? AND line = ?")
      .run(projectId, hash, file, line);
  }

  /** One inbox line per commit, not per line: a commit with ten keys is one thing to look at. */
  notices(): InboxNotice[] {
    const byCommit = new Map<string, SecretFinding[]>();
    for (const f of this.list()) {
      const k = `${f.projectId}:${f.hash}`;
      byCommit.set(k, [...(byCommit.get(k) ?? []), f]);
    }
    return [...byCommit.values()].slice(0, 20).map((group) => {
      const f = group[0] as SecretFinding;
      return {
        id: `secret:${f.hash}:${group.length}`,
        kind: "secret" as const,
        projectId: f.projectId,
        projectName: this.store.projectRow(f.projectId)?.name ?? "",
        detail:
          group.length === 1
            ? `${f.file}:${f.line} · ${f.hash.slice(0, 7)} · ${f.hint}`
            : `${f.file}:${f.line} +${group.length - 1} · ${f.hash.slice(0, 7)}`,
        at: Math.max(...group.map((g) => g.at)),
        link: `/p/${f.projectId}?tab=sections&cat=security`,
      };
    });
  }

  /** The pre-commit guard: a small script in .git/hooks that asks God Eye; without God Eye running it lets the commit through. */
  installGuard(projectPath: string, dataDir: string, port: number): void {
    const hooks = join(projectPath, ".git", "hooks");
    if (!existsSync(hooks)) throw new Error("Not a git repository");
    const file = join(hooks, "pre-commit");
    if (existsSync(file) && !isGuard(readFileSync(file, "utf8")))
      throw new Error("This project already has its own pre-commit hook");
    writeFileSync(
      file,
      `#!/bin/sh
# ${MARK}: installed by God Eye. Stops commits that add API keys, tokens or passwords.
# Skip once with: git commit --no-verify
KEY=$(cat "${join(dataDir, "session.key")}" 2>/dev/null) || exit 0
command -v curl >/dev/null 2>&1 || exit 0
OUT=$(git diff --cached -U0 --no-color | curl -s -m 5 -X POST -H "Host: localhost:${port}" -H "Cookie: igrek_session=$KEY" \\
  -H "content-type: text/plain" --data-binary @- "http://127.0.0.1:${port}/api/secrets/check" 2>/dev/null) || exit 0
case "$OUT" in
  OK*|"") exit 0 ;;
  *) echo "God Eye: this commit adds what looks like a secret:"; echo "$OUT"; echo "Remove it (or commit with --no-verify if it is not a secret)."; exit 1 ;;
esac
`,
    );
    chmodSync(file, 0o755);
  }

  guardInstalled(projectPath: string): boolean {
    const file = join(projectPath, ".git", "hooks", "pre-commit");
    return existsSync(file) && isGuard(readFileSync(file, "utf8"));
  }

  /** For the hook: "OK" or one line per secret found in the staged change. */
  check(patch: string): string {
    const found = secretsInPatch(patch);
    return found.length ? found.map((f) => `  ${f.file}:${f.line}  ${f.hint}`).join("\n") : "OK";
  }
}

export interface DependencyStatus {
  name: string;
  ecosystem: "npm" | "PyPI";
  current: string;
  latest?: string;
  outdated: "major" | "minor" | "patch" | "none" | "unknown";
  vulns: { id: string; summary: string; severity?: string }[];
}

export interface DependencyReport {
  projectId: string;
  at: number;
  deps: DependencyStatus[];
}

function parts(v: string): number[] {
  return (v.match(/\d+(\.\d+){0,2}/)?.[0] ?? "0").split(".").map(Number);
}

export function compareVersions(current: string, latest: string): DependencyStatus["outdated"] {
  const a = parts(current);
  const b = parts(latest);
  if ((b[0] ?? 0) > (a[0] ?? 0)) return "major";
  if ((b[0] ?? 0) === (a[0] ?? 0) && (b[1] ?? 0) > (a[1] ?? 0)) return "minor";
  if ((b[0] ?? 0) === (a[0] ?? 0) && (b[1] ?? 0) === (a[1] ?? 0) && (b[2] ?? 0) > (a[2] ?? 0)) return "patch";
  return "none";
}

/**
 * Dependency watcher (plan.md 11): each package's installed version against the newest one, and
 * known vulnerabilities from OSV.dev (the free, open vulnerability database). npm and pinned
 * Python requirements.
 */
export class DependencyWatcher {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private installed(root: string, name: string, range: string): string {
    try {
      return (
        (JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version?: string })
          .version ?? range
      );
    } catch {
      return range.replace(/^[\^~>=<\s]+/, "");
    }
  }

  async check(projectId: string): Promise<DependencyReport> {
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    const deps: DependencyStatus[] = [];
    const pkgPath = join(project.path, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, Record<string, string> | undefined>;
      for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 120)) {
        if (/^(workspace|file|link|git|https?):/.test(range)) continue;
        deps.push({
          name,
          ecosystem: "npm",
          current: this.installed(project.path, name, range),
          outdated: "unknown",
          vulns: [],
        });
      }
    }
    const req = join(project.path, "requirements.txt");
    if (existsSync(req))
      for (const line of readFileSync(req, "utf8").split("\n")) {
        const m = line.trim().match(/^([A-Za-z0-9_.-]+)==([\w.]+)/);
        if (m)
          deps.push({
            name: m[1] as string,
            ecosystem: "PyPI",
            current: m[2] as string,
            outdated: "unknown",
            vulns: [],
          });
      }
    // Newest versions (a few at a time).
    for (let i = 0; i < deps.length; i += 8)
      await Promise.all(
        deps.slice(i, i + 8).map(async (d) => {
          try {
            const url =
              d.ecosystem === "npm"
                ? `https://registry.npmjs.org/${d.name.replace("/", "%2F")}/latest`
                : `https://pypi.org/pypi/${encodeURIComponent(d.name)}/json`;
            const res = await this.fetcher(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) return;
            const json = (await res.json()) as { version?: string; info?: { version?: string } };
            d.latest = json.version ?? json.info?.version;
            if (d.latest) d.outdated = compareVersions(d.current, d.latest);
          } catch {
            // unknown
          }
        }),
      );
    // Known vulnerabilities for the exact versions in use.
    try {
      const res = await this.fetcher("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: deps.map((d) => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.current })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { results?: { vulns?: { id: string }[] }[] };
        const details = new Map<string, { summary: string; severity?: string }>();
        const ids = [...new Set((json.results ?? []).flatMap((r) => (r.vulns ?? []).map((v) => v.id)))].slice(0, 25);
        await Promise.all(
          ids.map(async (id) => {
            try {
              const v = (await (
                await this.fetcher(`https://api.osv.dev/v1/vulns/${id}`, { signal: AbortSignal.timeout(15_000) })
              ).json()) as {
                summary?: string;
                details?: string;
                database_specific?: { severity?: string };
              };
              details.set(id, {
                summary: (v.summary ?? v.details ?? "").slice(0, 200),
                severity: v.database_specific?.severity,
              });
            } catch {
              details.set(id, { summary: "" });
            }
          }),
        );
        (json.results ?? []).forEach((r, i) => {
          const d = deps[i];
          if (d) d.vulns = (r.vulns ?? []).map((v) => ({ id: v.id, ...(details.get(v.id) ?? { summary: "" }) }));
        });
      }
    } catch {
      // OSV not reachable: versions only
    }
    const report: DependencyReport = { projectId, at: Date.now(), deps };
    this.db
      .query("INSERT OR REPLACE INTO lesson_state (key, value) VALUES (?, ?)")
      .run(`deps:${projectId}`, JSON.stringify(report));
    return report;
  }

  cached(projectId: string): DependencyReport | undefined {
    const row = this.db.query("SELECT value FROM lesson_state WHERE key = ?").get(`deps:${projectId}`) as
      | { value: string }
      | undefined;
    return row ? (JSON.parse(row.value) as DependencyReport) : undefined;
  }

  /** Re-checks projects whose report is older than a day (network only, no AI). */
  async daily(): Promise<void> {
    for (const p of this.store.liveProjectRows()) {
      if (p.hidden || !existsSync(join(p.path, "package.json"))) continue;
      const last = this.cached(p.id);
      if (last && Date.now() - last.at < 24 * 60 * 60_000) continue;
      await this.check(p.id).catch(() => undefined);
    }
  }

  notices(): InboxNotice[] {
    const out: InboxNotice[] = [];
    for (const p of this.store.liveProjectRows()) {
      const r = this.cached(p.id);
      const vulnerable = r?.deps.filter((d) => d.vulns.some((v) => /critical|high/i.test(v.severity ?? ""))) ?? [];
      if (vulnerable.length)
        out.push({
          id: `vuln:${p.id}:${vulnerable.map((d) => `${d.name}@${d.current}`).join(",")}`,
          kind: "vuln",
          projectId: p.id,
          projectName: p.name,
          detail: vulnerable
            .map((d) => `${d.name}@${d.current}`)
            .slice(0, 4)
            .join(", "),
          at: r?.at ?? Date.now(),
          link: `/p/${p.id}?tab=sections&cat=dependencies`,
        });
    }
    return out;
  }
}
