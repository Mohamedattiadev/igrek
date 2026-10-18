/**
 * Database rules as code (plan.md 15.3), run on God Eye's own SQLite schema: the migrations are
 * applied to an empty database and the result is inspected, and every SQL statement in the server
 * code is explained against it. Sources: Elmasri & Navathe, "Fundamentals of Database Systems"
 * (7th ed.): key, entity and referential integrity (ch. 5.2), indexes (ch. 17), plus SQLite's own
 * documentation where SQLite differs.
 *
 * What already breaks a rule is written in db-baseline.json with the reason; nothing new may be
 * added, and a fixed problem must leave the baseline (the "ratchet": the count only goes down).
 *
 *   bun scripts/db-check.ts                 check (exit 1 on anything new or fixed-but-listed)
 *   bun scripts/db-check.ts --baseline      rewrite the violation list (keeps the reasons)
 *   bun scripts/db-check.ts --lock          record new migrations as shipped
 *   bun scripts/db-check.ts --data <file>   look for data anomalies in a real database, read-only
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { migrate, migrations } from "../apps/server/src/db";

const ROOT = resolve(import.meta.dir, "..");
export const BASELINE = join(import.meta.dir, "db-baseline.json");
const SERVER = join(ROOT, "apps/server/src");

/** Tables that grow with use: a full scan on them gets slower every week. */
const LARGE = new Set([
  "sessions",
  "messages",
  "commits",
  "usage",
  "memory_items",
  "library_chunks",
  "comments",
  "team_messages",
  "deploys",
  "uptime_checks",
  "rate_limits",
  "app_events_daily",
  "app_users_daily",
  "app_perf",
  "app_error_groups",
  "chat_history",
  "netlog",
]);

export const RULES: Record<string, string> = {
  "pk-required": "Every table needs a primary key (key constraint, Elmasri 5.2.1).",
  "pk-not-null":
    "A primary key may not be NULL (entity integrity, Elmasri 5.2.3); SQLite allows NULL in a non-INTEGER key unless the column says NOT NULL.",
  "reference-fk": "A column that points at another table needs a FOREIGN KEY (referential integrity, Elmasri 5.2.4).",
  "reference-index":
    "A column used to find related rows needs an index, or every lookup reads the whole table (Elmasri 17).",
  "typed-columns": "Every column has a declared type; times (*_at) are INTEGER milliseconds.",
  "snake-case": "Table and column names are lower snake_case, like the rest of the schema.",
  "duplicate-index": "An index whose columns start another index adds write cost and nothing else.",
  "full-scan": "A query with WHERE on a growing table must use an index (checked with EXPLAIN QUERY PLAN).",
  "migration-destructive":
    "DROP and RENAME lose data or break running copies; such a migration must say why in a -- why: comment.",
};

type Baseline = {
  reasons: Record<string, string>;
  violations: string[];
  /** SHA-256 of every shipped migration, in order: they may never change again. */
  migrations: string[];
};

function schema(): Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

type Column = { name: string; type: string; notnull: number; pk: number };

export function schemaViolations(db: Database): string[] {
  const out: string[] = [];
  const tables = (
    db
      .query("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string; sql: string }[]
  ).filter((t) => !t.sql.startsWith("CREATE VIRTUAL") && !/_fts_(data|idx|content|docsize|config)$/.test(t.name));
  for (const { name: table } of tables) {
    const cols = db.query(`PRAGMA table_info("${table}")`).all() as Column[];
    const fks = db.query(`PRAGMA foreign_key_list("${table}")`).all() as { from: string }[];
    const indexes = (db.query(`PRAGMA index_list("${table}")`).all() as { name: string }[]).map((i) => ({
      name: i.name,
      cols: (db.query(`PRAGMA index_info("${i.name}")`).all() as { name: string }[]).map((c) => c.name),
    }));
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    if (!pk.length) out.push(`pk-required:${table}`);
    for (const c of pk)
      if (!c.notnull && !(pk.length === 1 && /^INTEGER$/i.test(c.type))) out.push(`pk-not-null:${table}.${c.name}`);
    const leads = new Set([...indexes.map((i) => i.cols[0]), pk[0]?.name]);
    if (!/^[a-z][a-z0-9_]*$/.test(table)) out.push(`snake-case:${table}`);
    for (const c of cols) {
      const at = `${table}.${c.name}`;
      if (!/^[a-z][a-z0-9_]*$/.test(c.name)) out.push(`snake-case:${at}`);
      if (!c.type || (/_at$/.test(c.name) && !/^INTEGER$/i.test(c.type))) out.push(`typed-columns:${at}`);
      if (/_id$/.test(c.name) && !fks.some((f) => f.from === c.name)) out.push(`reference-fk:${at}`);
      if (/_id$/.test(c.name) && !leads.has(c.name)) out.push(`reference-index:${at}`);
    }
    for (const a of indexes)
      for (const b of indexes)
        if (
          a !== b &&
          !a.name.startsWith("sqlite_autoindex") &&
          a.cols.length <= b.cols.length &&
          a.cols.every((c, i) => b.cols[i] === c)
        )
          out.push(`duplicate-index:${table}.${a.name}`);
  }
  return out;
}

function serverFiles(dir = SERVER, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) serverFiles(path, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

/** SQL written as plain strings in the server code (strings built with ${} are skipped). */
export function codeQueries(): { file: string; sql: string }[] {
  const out: { file: string; sql: string }[] = [];
  for (const file of serverFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(["'`])((?:SELECT|UPDATE|DELETE)\b(?:(?!\1)[\s\S])*?)\1/g))
      if (!m[2]?.includes("${")) out.push({ file: relative(ROOT, file), sql: m[2] ?? "" });
  }
  return out;
}

export function queryViolations(db: Database): string[] {
  const out = new Set<string>();
  for (const { file, sql } of codeQueries()) {
    if (!/\bWHERE\b/i.test(sql)) continue;
    let plan: { detail: string }[] = [];
    try {
      plan = db.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[];
    } catch {
      continue; // Not a statement on its own (a fragment glued to others).
    }
    for (const step of plan) {
      const table = step.detail.match(/^SCAN (\w+)(?: AS \w+)?$/)?.[1];
      // "SCAN s" names an alias: find the table it stands for.
      const real =
        table && (LARGE.has(table) ? table : sql.match(new RegExp(`\\b(\\w+)\\s+(?:AS\\s+)?${table}\\b`))?.[1]);
      if (real && LARGE.has(real)) out.add(`full-scan:${file}:${real}:${hash(sql.replace(/\s+/g, " ")).slice(0, 8)}`);
    }
  }
  return [...out];
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function migrationViolations(): string[] {
  return migrations.flatMap((sql, i) =>
    /\b(DROP\s+(TABLE|COLUMN|INDEX)|RENAME\s+(TO|COLUMN))\b/i.test(sql) && !/--\s*why:/i.test(sql)
      ? [`migration-destructive:${i + 1}`]
      : [],
  );
}

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
}

export function check(): { added: string[]; fixed: string[]; edited: number[]; unlocked: number } {
  const db = schema();
  const now = [...schemaViolations(db), ...queryViolations(db), ...migrationViolations()].sort();
  const base = readBaseline();
  const known = new Set(base.violations);
  const current = migrations.map(hash);
  return {
    added: now.filter((v) => !known.has(v)),
    fixed: base.violations.filter((v) => !now.includes(v)),
    edited: base.migrations.flatMap((h, i) => (current[i] === h ? [] : [i + 1])),
    unlocked: current.length - base.migrations.length,
  };
}

/** Orphans, NULL keys and repeated values in a real database, opened read-only. */
export function dataAnomalies(path: string): string[] {
  const db = new Database(path, { readonly: true });
  const out: string[] = [];
  const tables = new Set(
    // Virtual tables (search, vectors) need extensions this check does not load; their data lives in shadow tables.
    (
      db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND sql NOT LIKE 'CREATE VIRTUAL%'").all() as {
        name: string;
      }[]
    ).map((t) => t.name),
  );
  const target: Record<string, string> = { project_id: "projects", session_id: "sessions", account_id: "accounts" };
  for (const table of tables) {
    if (/^sqlite_|_fts/.test(table)) continue;
    const cols = db.query(`PRAGMA table_info("${table}")`).all() as Column[];
    for (const c of cols.filter((c) => c.pk > 0)) {
      const n = (db.query(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${c.name}" IS NULL`).get() as { n: number }).n;
      if (n) out.push(`${table}.${c.name}: ${n} rows with a NULL key`);
    }
    for (const c of cols) {
      const to = target[c.name];
      if (!to || to === table || !tables.has(to)) continue;
      const n = (
        db
          .query(
            `SELECT COUNT(*) AS n FROM "${table}" t WHERE t."${c.name}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${to}" x WHERE x.id = t."${c.name}")`,
          )
          .get() as { n: number }
      ).n;
      if (n) out.push(`${table}.${c.name}: ${n} rows point at a missing ${to} row`);
    }
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args[0] === "--data") {
    const found = dataAnomalies(args[1] ?? "");
    for (const f of found) console.log(`! ${f}`);
    console.log(`${found.length} data anomalies (read-only check, nothing was changed)`);
    process.exit(0);
  }
  const base = readBaseline();
  if (args.includes("--baseline") || args.includes("--lock")) {
    const db = schema();
    if (args.includes("--baseline"))
      base.violations = [...schemaViolations(db), ...queryViolations(db), ...migrationViolations()].sort();
    if (args.includes("--lock")) base.migrations = migrations.map(hash);
    writeFileSync(BASELINE, `${JSON.stringify(base, null, 2)}\n`);
    console.log(`wrote ${relative(ROOT, BASELINE)}: ${base.violations.length} known violations`);
    process.exit(0);
  }
  const { added, fixed, edited, unlocked } = check();
  for (const v of added) console.log(`x new: ${v} (${RULES[v.split(":")[0] ?? ""]})`);
  for (const v of fixed) console.log(`x fixed but still in db-baseline.json, remove it: ${v}`);
  for (const i of edited) console.log(`x migration ${i} changed after it shipped; add a new migration instead`);
  if (unlocked > 0) console.log(`x ${unlocked} new migration(s): run bun scripts/db-check.ts --lock`);
  const bad = added.length + fixed.length + edited.length + Math.max(0, unlocked);
  console.log(
    `${migrations.length} migrations, ${base.violations.length} known violations, ${bad ? `${bad} problems` : "nothing new"}`,
  );
  process.exit(bad ? 1 : 0);
}
