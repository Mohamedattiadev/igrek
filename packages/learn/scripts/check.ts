#!/usr/bin/env bun
/**
 * Content checker for the learning center. It runs every example marked `check:` and compares what
 * it prints with `output`, and with --urls it opens every source link. Run it after changing content:
 *
 *   bun packages/learn/scripts/check.ts [--urls] [--only git,python]
 *
 * Examples run in a fresh temporary folder each. Go, PHP and PostgreSQL run in Docker containers.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Runnable } from "../src/index";
import { loadContent } from "../src/load";

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set((args[args.indexOf("--only") + 1] ?? "").split(",")) : undefined;
const content = loadContent();
let failed = content.errors.length;
for (const e of content.errors) console.log(`INVALID ${e}`);

const PG_PORT = 55432;
let pgStarted = false;

function run(cmd: string[], cwd: string, env: Record<string, string> = {}, stdin?: string) {
  const p = Bun.spawnSync(cmd, {
    cwd,
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function startPostgres(): void {
  if (pgStarted) return;
  pgStarted = true;
  run(["docker", "rm", "-f", "godeye-learn-pg"], tmpdir());
  run(
    [
      "docker",
      "run",
      "-d",
      "--rm",
      "--name",
      "godeye-learn-pg",
      "-e",
      "POSTGRES_PASSWORD=learn",
      "-p",
      `127.0.0.1:${PG_PORT}:5432`,
      "postgres:16-alpine",
    ],
    tmpdir(),
  );
  for (let i = 0; i < 60; i++) {
    if (run(["docker", "exec", "godeye-learn-pg", "pg_isready", "-U", "postgres"], tmpdir()).code === 0) {
      Bun.sleepSync(1000);
      return;
    }
    Bun.sleepSync(500);
  }
}

let pgDb = 0;

/** Runs one example in its own folder; returns what it printed. */
function execute(kind: Runnable | "pg", code: string): { out: string; err?: string } {
  const dir = mkdtempSync(join(tmpdir(), "godeye-learn-"));
  const env = {
    HOME: dir,
    GIT_CONFIG_GLOBAL: join(dir, ".gitconfig"),
    GIT_AUTHOR_NAME: "Learn",
    GIT_AUTHOR_EMAIL: "learn@example.com",
    GIT_COMMITTER_NAME: "Learn",
    GIT_COMMITTER_EMAIL: "learn@example.com",
    LC_ALL: "C.UTF-8",
    NO_COLOR: "1",
    // Toolchains installed for the real user stay reachable with the temporary HOME.
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? join(homedir(), ".rustup"),
    CARGO_HOME: process.env.CARGO_HOME ?? join(homedir(), ".cargo"),
    DOTNET_NOLOGO: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: "1",
    NUGET_PACKAGES: process.env.NUGET_PACKAGES ?? join(homedir(), ".nuget", "packages"),
  };
  const file = (name: string) => {
    writeFileSync(join(dir, name), code);
    return name;
  };
  const docker = (image: string, cmd: string[]) =>
    run(["docker", "run", "--rm", "--network", "none", "-v", `${dir}:/w`, "-w", "/w", image, ...cmd], dir);
  try {
    let r: ReturnType<typeof run>;
    switch (kind) {
      case "sh":
        r = run(["bash", "-e", "-c", code], dir, env);
        break;
      case "js":
        r = run(["node", file("main.mjs")], dir, env);
        break;
      case "ts":
        r = run(["bun", file("main.ts")], dir, env);
        break;
      case "py":
        r = run(["python3", "-I", file("main.py")], dir, env);
        break;
      case "sql":
        r = run(["sqlite3", ":memory:"], dir, env, code);
        break;
      case "pg": {
        startPostgres();
        const db = `learn${++pgDb}`;
        const url = `postgres://postgres:learn@127.0.0.1:${PG_PORT}`;
        run(["psql", `${url}/postgres`, "-qc", `CREATE DATABASE ${db}`], dir);
        r = run(["psql", `${url}/${db}`, "-q", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], dir, env, code);
        break;
      }
      case "go":
        file("main.go");
        r = docker("golang:1.25-alpine", ["go", "run", "main.go"]);
        break;
      case "rust":
        file("main.rs");
        r = run(["rustc", "--edition", "2024", "-o", "main", "main.rs"], dir, env);
        if (r.code === 0) r = run(["./main"], dir, env);
        break;
      case "java":
        r = run(["java", file("Main.java")], dir, env);
        break;
      case "cs":
        r = run(["dotnet", "run", file("app.cs")], dir, { ...env, DOTNET_CLI_TELEMETRY_OPTOUT: "1" });
        break;
      case "php":
        file("main.php");
        r = docker("php:8.4-cli-alpine", ["php", "main.php"]);
        break;
    }
    return r.code === 0 ? { out: r.out } : { out: r.out, err: (r.err || r.out).trim().slice(0, 600) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tidy = (s: string) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();

let ran = 0;
for (const sheet of content.sheets) {
  if (only && !only.has(sheet.id)) continue;
  for (const section of sheet.sections)
    for (const item of section.items) {
      if (!item.check || !item.example) continue;
      // SQL in a PostgreSQL sheet runs on PostgreSQL, everywhere else on SQLite.
      const kind = item.check === "sql" && sheet.id === "postgresql" ? "pg" : item.check;
      ran++;
      const r = execute(kind, item.example);
      const where = `${sheet.id}/${item.id}`;
      if (r.err) {
        failed++;
        console.log(`FAIL ${where}: ${r.err}`);
      } else if (item.output !== undefined && tidy(r.out) !== tidy(item.output)) {
        failed++;
        console.log(
          `WRONG OUTPUT ${where}\n  expected: ${JSON.stringify(tidy(item.output))}\n  got:      ${JSON.stringify(tidy(r.out))}`,
        );
      }
    }
}
if (pgStarted) run(["docker", "rm", "-f", "godeye-learn-pg"], tmpdir());
console.log(`ran ${ran} examples`);

if (args.includes("--urls")) {
  const urls = new Map<string, string>();
  for (const s of content.sheets) {
    if (only && !only.has(s.id)) continue;
    for (const x of s.sources) urls.set(x.url, s.id);
    for (const sec of s.sections) for (const it of sec.items) urls.set(it.source, `${s.id}/${it.id}`);
  }
  for (const r of content.roadmaps) {
    if (only && !only.has(r.id)) continue;
    for (const st of r.steps) for (const x of st.sources) urls.set(x.url, `${r.id}/${st.id}`);
  }
  const list = [...urls];
  let bad = 0;
  for (let i = 0; i < list.length; i += 8)
    await Promise.all(
      list.slice(i, i + 8).map(async ([url, where]) => {
        const page = url.split("#")[0] as string;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(page, {
              redirect: "follow",
              signal: AbortSignal.timeout(20_000),
              headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) godeye-learn-check" },
            });
            if (res.ok) return;
            if (attempt === 1 || res.status === 404) {
              bad++;
              console.log(`LINK ${res.status} ${url} (${where})`);
              return;
            }
          } catch (e) {
            if (attempt === 1) {
              bad++;
              console.log(`LINK ERROR ${url} (${where}): ${(e as Error).message}`);
            }
          }
        }
      }),
    );
  console.log(`checked ${list.length} links, ${bad} bad`);
  failed += bad;
}
process.exit(failed ? 1 : 0);
