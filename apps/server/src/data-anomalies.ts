import type { DataAnomaly, DbConnection, DbKind, DbResult, DbTable } from "@igrek/core";

/** What the scan needs from the database layer: its tables and read-only queries. */
export interface AnomalySource {
  get(id: string): DbConnection;
  tables(id: string): Promise<DbTable[]>;
  query(id: string, text: string): Promise<DbResult>;
}

/** Columns that should hold a different value in every row, even without a UNIQUE constraint. */
const UNIQUE_NAME = /(^|_)(email|slug|username|user_name|handle|sku|isbn|iban)$/i;
/** Columns where a negative number is almost always a bug. */
const NON_NEGATIVE = /(^|_)(price|amount|total|quantity|qty|stock|age|count|size|duration|weight)$/i;
const NUMERIC = /int|real|num|dec|float|double|money/i;
const MAX_TABLES = 60;
/** NULL in fewer than this share of rows, but more than none, looks like a mistake rather than a design. */
const RARE_NULL = 0.05;

function quoter(kind: DbKind): (name: string) => string {
  return kind === "mysql" ? (n) => `\`${n.replace(/`/g, "``")}\`` : (n) => `"${n.replace(/"/g, '""')}"`;
}

function countOf(result: DbResult): number {
  return Number(result.rows[0]?.[0] ?? 0) || 0;
}

/** The checks for one table, as [anomaly without count, counting query] pairs. */
function checksFor(table: DbTable, q: (n: string) => string, from: string): [Omit<DataAnomaly, "count">, string][] {
  const out: [Omit<DataAnomaly, "count">, string][] = [];
  const all = table.columns.map((col) => q(col.name)).join(", ");
  for (const col of table.columns) {
    const c = q(col.name);
    if (col.references) {
      const [refTable = "", refColumn = ""] = col.references.split(".");
      const where = `${c} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${q(refTable)} p WHERE p.${q(refColumn)} = t.${c})`;
      out.push([
        {
          kind: "orphan",
          table: table.name,
          column: col.name,
          target: col.references,
          query: `SELECT ${all} FROM ${from} t WHERE ${where}`,
        },
        `SELECT count(*) FROM ${from} t WHERE ${where}`,
      ]);
    }
    if (UNIQUE_NAME.test(col.name) && !col.primary)
      out.push([
        {
          kind: "duplicate",
          table: table.name,
          column: col.name,
          query: `SELECT ${c}, count(*) AS n FROM ${from} WHERE ${c} IS NOT NULL GROUP BY ${c} HAVING count(*) > 1 ORDER BY n DESC`,
        },
        `SELECT count(*) FROM (SELECT ${c} FROM ${from} WHERE ${c} IS NOT NULL GROUP BY ${c} HAVING count(*) > 1) d`,
      ]);
    if (NON_NEGATIVE.test(col.name) && NUMERIC.test(col.type))
      out.push([
        { kind: "negative", table: table.name, column: col.name, query: `SELECT ${all} FROM ${from} WHERE ${c} < 0` },
        `SELECT count(*) FROM ${from} WHERE ${c} < 0`,
      ]);
  }
  return out;
}

/** How a value would be written if everyone wrote it the same way: case, spaces and accents aside. */
function normalForm(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

/** Groups of values that differ only in how they are written: ["Istanbul", "istanbul "]. */
export function variantGroups(values: string[]): string[][] {
  const groups = new Map<string, Set<string>>();
  for (const v of values) {
    const key = normalForm(v);
    if (!key) continue;
    groups.set(key, (groups.get(key) ?? new Set()).add(v));
  }
  return [...groups.values()].filter((g) => g.size > 1).map((g) => [...g]);
}

/**
 * Text columns with few distinct values (a status, a city, a category) where the same thing is
 * written in more than one way: lookups and reports then count them as different things.
 */
async function inconsistentValues(
  source: AnomalySource,
  id: string,
  table: DbTable,
  q: (n: string) => string,
  from: string,
): Promise<DataAnomaly[]> {
  if ((table.rows ?? 0) < 20) return [];
  const out: DataAnomaly[] = [];
  const text = table.columns.filter((c) => /char|text|string|enum/i.test(c.type) && !c.primary && !c.references);
  for (const col of text.slice(0, 15)) {
    const c = q(col.name);
    // One small grouped read per column of the user's database (at most 15 per table).
    const rows = (await source.query(id, `SELECT ${c} FROM ${from} WHERE ${c} IS NOT NULL GROUP BY ${c} LIMIT 61`))
      .rows;
    if (rows.length > 60) continue; // Many distinct values: free text, not a list of choices.
    const groups = variantGroups(rows.map((r) => String(r[0])));
    if (groups.length)
      out.push({
        kind: "inconsistent",
        table: table.name,
        column: col.name,
        count: groups.length,
        target: groups
          .slice(0, 3)
          .map((g) => g.map((v) => JSON.stringify(v)).join(" / "))
          .join("; "),
        query: `SELECT ${c}, count(*) AS n FROM ${from} GROUP BY ${c} ORDER BY ${c}`,
      });
  }
  return out;
}

/** Nullable columns that are almost always filled: the few empty rows are probably mistakes. */
async function rareNulls(
  source: AnomalySource,
  id: string,
  table: DbTable,
  q: (n: string) => string,
  from: string,
): Promise<DataAnomaly[]> {
  const total = table.rows ?? countOf(await source.query(id, `SELECT count(*) FROM ${from}`));
  if (total < 20) return [];
  const cols = table.columns.filter((c) => c.nullable && !c.primary);
  if (!cols.length) return [];
  // One pass over the table counts the empty rows of every column.
  const sums = cols.map((col) => `sum(CASE WHEN ${q(col.name)} IS NULL THEN 1 ELSE 0 END)`).join(", ");
  const row = (await source.query(id, `SELECT ${sums} FROM ${from}`)).rows[0] ?? [];
  const all = table.columns.map((x) => q(x.name)).join(", ");
  const out: DataAnomaly[] = [];
  cols.forEach((col, i) => {
    const nulls = Number(row[i] ?? 0) || 0;
    if (nulls > 0 && nulls / total < RARE_NULL)
      out.push({
        kind: "unexpectedNull",
        table: table.name,
        column: col.name,
        count: nulls,
        query: `SELECT ${all} FROM ${from} WHERE ${q(col.name)} IS NULL`,
      });
  });
  return out;
}

/**
 * Looks for problems in the data of a connected database (plan.md 15.3), with SELECTs only:
 * rows pointing at rows that do not exist, values repeated where they should be unique, NULLs
 * in columns that are almost always filled, and negative prices or quantities. A production
 * database is only scanned after the user confirms.
 */
export async function scanAnomalies(
  source: AnomalySource,
  id: string,
  opts: { confirmProd?: boolean } = {},
): Promise<DataAnomaly[]> {
  const conn = source.get(id);
  if (conn.kind === "mongodb") throw new Error("The data scan works on SQL databases (SQLite, PostgreSQL, MySQL)");
  if (conn.prod && !opts.confirmProd)
    throw Object.assign(new Error("This is a production database. Confirm to scan it (read-only queries)."), {
      code: "confirm",
    });
  const q = quoter(conn.kind);
  const out: DataAnomaly[] = [];
  for (const table of (await source.tables(id)).filter((t) => t.kind === "table").slice(0, MAX_TABLES)) {
    const from = table.schema && conn.kind === "postgres" ? `${q(table.schema)}.${q(table.name)}` : q(table.name);
    for (const [anomaly, counting] of checksFor(table, q, from)) {
      try {
        const count = countOf(await source.query(id, counting));
        if (count > 0) out.push({ ...anomaly, count });
      } catch {
        // A column the database could not compare this way (types differ): skip it.
      }
    }
    try {
      out.push(...(await rareNulls(source, id, table, q, from)));
      out.push(...(await inconsistentValues(source, id, table, q, from)));
    } catch {
      // Counting failed (a view-like table or no rights): skip it.
    }
  }
  return out;
}
