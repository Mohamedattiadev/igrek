/**
 * Databases and backups (plan.md 12): a database explorer and a backup manager that knows how to
 * test its own backups.
 */

export type DbKind = "sqlite" | "postgres" | "mysql" | "mongodb";

/** A saved database. The address (with its password) stays encrypted on this computer. */
export interface DbConnection {
  id: string;
  name: string;
  kind: DbKind;
  projectId?: string;
  /** Prod databases are read-only unless you switch that off on purpose. */
  prod: boolean;
  readOnly: boolean;
  /** The address without password, for display: postgres://app@db.example.com:5432/shop */
  display: string;
  createdAt: number;
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  /** "table.column" this column points to. */
  references?: string;
}

export interface DbTable {
  name: string;
  /** Schema for PostgreSQL ("public"), the database for MySQL. */
  schema?: string;
  kind: "table" | "view" | "collection";
  /** Exact for SQLite, an estimate from the database's own statistics elsewhere. */
  rows?: number;
  columns: DbColumn[];
}

export interface DbResult {
  columns: string[];
  rows: unknown[][];
  /** Rows changed by a write. */
  changed?: number;
  /** More rows existed than were returned. */
  truncated: boolean;
  ms: number;
}

/** A suggestion found in a project: a DATABASE_URL in .env, a .sqlite file. Never the value itself. */
export interface DbSuggestion {
  kind: DbKind;
  /** "DATABASE_URL in .env" or "data/app.db" */
  label: string;
  source: { kind: "env"; file: string; key: string } | { kind: "file"; path: string };
}

const WRITE_SQL =
  /^\s*(insert|update|delete|merge|upsert|replace|drop|alter|create|truncate|grant|revoke|rename|comment|vacuum|reindex|cluster|copy|call|do|lock|refresh|attach|detach)\b|^\s*pragma\s+\w+\s*=/i;

/** Whether a statement may change data or structure. Several statements: any of them. */
export function isWriteSql(sql: string): boolean {
  return stripSqlComments(sql)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .some(
      (s) =>
        WRITE_SQL.test(s) ||
        // WITH x AS (DELETE … RETURNING …) SELECT …
        /^\s*with\b[\s\S]*\b(insert|update|delete)\b/i.test(s) ||
        // SELECT … INTO new_table (PostgreSQL) or INTO OUTFILE (MySQL); INTO @var is harmless.
        /^\s*select\b[\s\S]*\binto\s+(?!@)\w+/i.test(s) ||
        // Locking reads hold rows other sessions are waiting for.
        /\bfor\s+(update|share)\b/i.test(s),
    );
}

export function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The table names a query reads or writes: enough to pick the schema the expert needs. */
export function tablesInSql(sql: string): string[] {
  const out = new Set<string>();
  for (const m of stripSqlComments(sql).matchAll(/\b(?:from|join|into|update|table)\s+([`"[]?[\w.]+[`"\]]?)/gi))
    out.add(
      (m[1] ?? "")
        .replace(/[`"[\]]/g, "")
        .split(".")
        .pop() ?? "",
    );
  out.delete("");
  return [...out];
}

/** The schema as a Mermaid ER diagram (also what the whiteboard turns into boxes and arrows). */
export function erDiagram(tables: DbTable[], limit = 40): string {
  const safe = (s: string) => s.replace(/[^\w]/g, "_");
  const lines = ["erDiagram"];
  const shown = tables.filter((t) => t.kind !== "view").slice(0, limit);
  const names = new Set(shown.map((t) => t.name));
  for (const t of shown) {
    lines.push(`  ${safe(t.name)} {`);
    for (const c of t.columns.slice(0, 25)) {
      const keys = [c.primary ? "PK" : "", c.references ? "FK" : ""].filter(Boolean).join(",");
      const type = (c.type.split("(")[0] || "text")
        .replace(/ without time zone/, "")
        .replace(/ with time zone/, "tz")
        .replace(/character varying/, "varchar")
        .replace(/double precision/, "double");
      lines.push(`    ${safe(type).slice(0, 32)} ${safe(c.name)}${keys ? ` ${keys}` : ""}`);
    }
    lines.push("  }");
  }
  for (const t of shown)
    for (const c of t.columns) {
      const target = c.references?.split(".")[0];
      if (target && names.has(target)) lines.push(`  ${safe(target)} ||--o{ ${safe(t.name)} : "${safe(c.name)}"`);
    }
  return lines.join("\n");
}

/** Backups Igrek makes on a schedule (plan.md 12 "Yedekleme yöneticisi"). */
export interface BackupJob {
  id: string;
  name: string;
  projectId?: string;
  source: { kind: "database"; connectionId: string } | { kind: "files"; path: string; serverId?: string };
  /** When it runs. */
  every: "day" | "week" | "manual";
  /** "03:00" */
  time: string;
  /** 0 = Sunday, for weekly backups. */
  weekday?: number;
  /** How many backup files to keep. */
  keep: number;
  /** Test each new backup right after it is made. */
  verify: boolean;
  lastRun?: BackupRun;
  nextAt?: number;
  createdAt: number;
}

export interface BackupRun {
  id: string;
  jobId: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "ok" | "failed";
  file?: string;
  bytes?: number;
  error?: string;
  /** What the restore test found: "12 tables, 4 310 rows restored into a temporary database". */
  verified?: {
    ok: boolean;
    how: "restore" | "list" | "read" | "failed" | "none";
    /** What was found, for the UI to say in the user's language. */
    counts?: { tables?: number; rows?: number; files?: number; collections?: number; documents?: number };
    /** "incomplete", "listOnly" (no right to create a test database), "integrity" or a tool's own message. */
    note?: string;
    /** A tool's error text when the test failed. */
    detail?: string;
    at: number;
  };
}

/** One problem in the data itself (plan.md 15.3), with the query that shows it. */
export interface DataAnomaly {
  kind: "orphan" | "unexpectedNull" | "duplicate" | "negative" | "inconsistent";
  table: string;
  column: string;
  /** Rows (or distinct values, for duplicates) affected. */
  count: number;
  /** For orphans: the table.column the value should point at. */
  target?: string;
  /** A read-only query that lists the rows, to look at them in the query editor. */
  query: string;
}
