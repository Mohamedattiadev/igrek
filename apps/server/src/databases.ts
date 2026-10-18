import type { Database } from "bun:sqlite";
import { Database as Sqlite } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  type DbColumn,
  type DbConnection,
  type DbKind,
  type DbResult,
  type DbSuggestion,
  type DbTable,
  isWriteSql,
} from "@igrek/core";
import type { EnvFiles } from "./envfiles";
import type { Sealer } from "./seal";
import type { Store } from "./store";

const MAX_ROWS = 500;
const QUERY_TIMEOUT = 30_000;

interface ConnRow {
  id: string;
  name: string;
  kind: DbKind;
  project_id: string | null;
  prod: number;
  read_only: number;
  address: string;
  display: string;
  created_at: number;
}

/** The address without the password, for showing. */
export function displayAddress(kind: DbKind, address: string): string {
  if (kind === "sqlite") return address;
  try {
    const u = new URL(address);
    u.password = "";
    return u.toString().replace(/:@/, "@");
  } catch {
    return kind;
  }
}

export function kindOf(address: string): DbKind | undefined {
  if (/^postgres(ql)?:\/\//i.test(address)) return "postgres";
  if (/^mysql:\/\//i.test(address) || /^mariadb:\/\//i.test(address)) return "mysql";
  if (/^mongodb(\+srv)?:\/\//i.test(address)) return "mongodb";
  if (/^(file:|sqlite:)?\/.*\.(db|sqlite3?|db3)$/i.test(address)) return "sqlite";
  return undefined;
}

const ENV_KEY =
  /^(DATABASE_URL|DB_URL|POSTGRES(QL)?_URL|PG_URL|MYSQL_URL|MONGO(DB)?_(URI|URL)|SQLITE_(PATH|FILE|URL)|DIRECT_URL)$/i;
const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "target"]);

function cell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function table(rows: Record<string, unknown>[], ms: number, changed?: number): DbResult {
  const columns = rows.length ? Object.keys(rows[0] as object) : [];
  return {
    columns,
    rows: rows.slice(0, MAX_ROWS).map((r) => columns.map((c) => cell(r[c]))),
    truncated: rows.length > MAX_ROWS,
    ms,
    ...(changed !== undefined ? { changed } : {}),
  };
}

function withTimeout<T>(p: Promise<T>, ms = QUERY_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`No answer in ${ms / 1000} s`)), ms)),
  ]);
}

type SqlClient = InstanceType<typeof Bun.SQL>;

/**
 * Database explorer (plan.md 12): tables, rows, the schema as a diagram and a query editor for
 * SQLite, PostgreSQL, MySQL and MongoDB. Addresses are stored encrypted and never sent to AI.
 * Prod databases are read-only by default: queries run inside a read-only transaction (SQLite
 * opens the file read-only), and a write on any database needs an explicit yes.
 */
export class Databases {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly sealer: Sealer,
    private readonly env: EnvFiles,
  ) {}

  private toConn(r: ConnRow): DbConnection {
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      ...(r.project_id ? { projectId: r.project_id } : {}),
      prod: !!r.prod,
      readOnly: !!r.read_only,
      display: r.display,
      createdAt: r.created_at,
    };
  }

  list(): DbConnection[] {
    return (this.db.query("SELECT * FROM db_connections ORDER BY name").all() as ConnRow[]).map((r) => this.toConn(r));
  }

  private row(id: string): ConnRow {
    const r = this.db.query("SELECT * FROM db_connections WHERE id = ?").get(id) as ConnRow | null;
    if (!r) throw new Error("Database not found");
    return r;
  }

  get(id: string): DbConnection {
    return this.toConn(this.row(id));
  }

  /** Adds a database by address, or from a project's .env key / .sqlite file without showing the value. */
  async add(input: {
    name?: string;
    address?: string;
    projectId?: string;
    prod?: boolean;
    from?: DbSuggestion["source"];
  }): Promise<DbConnection> {
    let address = input.address?.trim() ?? "";
    if (input.from) {
      const project = input.projectId ? this.store.projectRow(input.projectId) : undefined;
      if (!project) throw new Error("Pick the project first");
      if (input.from.kind === "env") address = this.env.reveal(project.path, input.from.file, input.from.key);
      else {
        address = resolve(project.path, input.from.path);
        if (!address.startsWith(project.path + sep)) throw new Error("Outside the project");
      }
    }
    address = address.replace(/^sqlite:\/\//i, "").replace(/^file:/i, "");
    const kind = kindOf(address);
    if (!kind)
      throw new Error("Use a postgres://, mysql://, mongodb:// address or the full path of a .db / .sqlite file");
    if (kind === "sqlite" && !existsSync(address)) throw new Error("No such database file");
    const id = crypto.randomUUID().slice(0, 12);
    const prod = input.prod ?? false;
    const display = displayAddress(kind, address);
    const name = (
      input.name?.trim() ||
      display
        .replace(/^\w+:\/\/([^@]*@)?/, "")
        .split("/")
        .pop() ||
      kind
    ).slice(0, 60);
    this.db
      .query(
        "INSERT INTO db_connections (id, name, kind, project_id, prod, read_only, address, display, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        name,
        kind,
        input.projectId ?? null,
        prod ? 1 : 0,
        prod ? 1 : 0,
        await this.sealer.seal(address, id),
        display,
        Date.now(),
      );
    return this.get(id);
  }

  update(id: string, patch: { name?: string; prod?: boolean; readOnly?: boolean }): DbConnection {
    const r = this.row(id);
    const prod = patch.prod ?? !!r.prod;
    // Marking a database as prod makes it read-only again; read-write on prod is a separate, explicit step.
    const readOnly = patch.prod === true && !r.prod ? true : (patch.readOnly ?? !!r.read_only);
    this.db
      .query("UPDATE db_connections SET name = ?, prod = ?, read_only = ? WHERE id = ?")
      .run((patch.name?.trim() || r.name).slice(0, 60), prod ? 1 : 0, readOnly ? 1 : 0, id);
    return this.get(id);
  }

  remove(id: string): void {
    this.db.query("DELETE FROM db_connections WHERE id = ?").run(id);
  }

  /** The address itself, for a backup tool that needs it; never leaves the server. */
  async address(id: string): Promise<string> {
    return this.sealer.open(this.row(id).address, id);
  }

  /** DATABASE_URL-like keys in the project's .env files and SQLite files in the project. */
  suggestions(projectId: string): DbSuggestion[] {
    const project = this.store.projectRow(projectId);
    if (!project || !existsSync(project.path)) return [];
    const out: DbSuggestion[] = [];
    for (const file of this.env.list(project.path)) {
      if (/\.example$|\.sample$|\.template$/.test(file)) continue;
      let text = "";
      try {
        text = readFileSync(join(project.path, file), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\s#]+)/i);
        if (!m?.[1] || !ENV_KEY.test(m[1])) continue;
        const kind = kindOf((m[2] ?? "").replace(/^file:/, ""));
        if (kind) out.push({ kind, label: `${m[1]} · ${file}`, source: { kind: "env", file, key: m[1] } });
      }
    }
    const walk = (dir: string, depth: number) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory() && depth < 3 && !SKIP.has(e.name) && !e.name.startsWith("."))
          walk(join(dir, e.name), depth + 1);
        else if (e.isFile() && /\.(db|sqlite3?|db3)$/i.test(e.name) && statSync(join(dir, e.name)).size > 0) {
          const path = relative(project.path, join(dir, e.name));
          out.push({ kind: "sqlite", label: path, source: { kind: "file", path } });
        }
      }
    };
    walk(project.path, 0);
    return out.slice(0, 20);
  }

  // ---- running things ------------------------------------------------------------------------

  private async withSql<T>(r: ConnRow, fn: (sql: SqlClient) => Promise<T>): Promise<T> {
    const address = await this.sealer.open(r.address, r.id);
    const sql = new Bun.SQL(address, { max: 1, idleTimeout: 5, connectionTimeout: 10 });
    try {
      return await withTimeout(fn(sql));
    } finally {
      await sql.close({ timeout: 1 }).catch(() => undefined);
    }
  }

  private async withMongo<T>(r: ConnRow, fn: (db: import("mongodb").Db) => Promise<T>): Promise<T> {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(await this.sealer.open(r.address, r.id), {
      serverSelectionTimeoutMS: 10_000,
      readPreference: r.read_only ? "secondaryPreferred" : "primary",
    });
    try {
      await client.connect();
      return await withTimeout(fn(client.db()));
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async openSqlite(r: ConnRow): Promise<Sqlite> {
    const path = await this.sealer.open(r.address, r.id);
    return r.read_only ? new Sqlite(path, { readonly: true }) : new Sqlite(path);
  }

  async test(id: string): Promise<{ ok: boolean; version?: string; error?: string }> {
    const r = this.row(id);
    try {
      if (r.kind === "sqlite") {
        const db = await this.openSqlite(r);
        const v = db.query("select sqlite_version() as v").get() as { v: string };
        db.close();
        return { ok: true, version: `SQLite ${v.v}` };
      }
      if (r.kind === "mongodb")
        return await this.withMongo(r, async (db) => {
          const info = (await db.admin().command({ buildInfo: 1 })) as { version?: string };
          return { ok: true, version: `MongoDB ${info.version ?? ""}` };
        });
      return await this.withSql(r, async (sql) => {
        const rows = (await sql.unsafe("select version() as v")) as { v: string }[];
        return {
          ok: true,
          version: String(rows[0]?.v ?? "")
            .split(" on ")[0]
            ?.slice(0, 80),
        };
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message.slice(0, 300) };
    }
  }

  async tables(id: string): Promise<DbTable[]> {
    const r = this.row(id);
    if (r.kind === "sqlite") {
      const db = await this.openSqlite(r);
      try {
        const list = db
          .query(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all() as { name: string; type: string }[];
        return list.map((t) => {
          const q = `"${t.name.replace(/"/g, '""')}"`;
          const cols = db.query(`PRAGMA table_info(${q})`).all() as {
            name: string;
            type: string;
            notnull: number;
            pk: number;
          }[];
          const fks = db.query(`PRAGMA foreign_key_list(${q})`).all() as {
            from: string;
            table: string;
            to: string | null;
          }[];
          let rows: number | undefined;
          try {
            rows = (db.query(`SELECT count(*) AS n FROM ${q}`).get() as { n: number }).n;
          } catch {
            rows = undefined;
          }
          return {
            name: t.name,
            kind: t.type === "view" ? ("view" as const) : ("table" as const),
            ...(rows !== undefined ? { rows } : {}),
            columns: cols.map((c) => {
              const fk = fks.find((f) => f.from === c.name);
              return {
                name: c.name,
                type: c.type || "any",
                nullable: !c.notnull && !c.pk,
                primary: c.pk > 0,
                ...(fk ? { references: `${fk.table}.${fk.to ?? "id"}` } : {}),
              };
            }),
          };
        });
      } finally {
        db.close();
      }
    }
    if (r.kind === "mongodb")
      return this.withMongo(r, async (db) => {
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        return Promise.all(
          collections
            .filter((c) => !c.name.startsWith("system."))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(async (c) => {
              const coll = db.collection(c.name);
              const [rows, sample] = await Promise.all([
                coll.estimatedDocumentCount().catch(() => undefined),
                coll
                  .find({}, { limit: 20 })
                  .toArray()
                  .catch(() => []),
              ]);
              // Fields seen in a small sample: Mongo has no fixed schema.
              const fields = new Map<string, string>();
              for (const doc of sample)
                for (const [k, v] of Object.entries(doc))
                  if (!fields.has(k))
                    fields.set(
                      k,
                      Array.isArray(v)
                        ? "array"
                        : v === null
                          ? "null"
                          : typeof v === "object"
                            ? (v.constructor?.name ?? "object")
                            : typeof v,
                    );
              return {
                name: c.name,
                kind: "collection" as const,
                ...(rows !== undefined ? { rows } : {}),
                columns: [...fields].map(([name, type]) => ({ name, type, nullable: true, primary: name === "_id" })),
              };
            }),
        );
      });
    return this.withSql(r, async (sql) => {
      const pg = r.kind === "postgres";
      const tables = (await sql.unsafe(
        pg
          ? `SELECT c.relname AS name, n.nspname AS schema, CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'table' END AS kind,
               COALESCE(s.n_live_tup, NULLIF(GREATEST(c.reltuples, -1), -1))::bigint AS rows
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
             WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
             ORDER BY n.nspname, c.relname LIMIT 500`
          : `SELECT table_name AS name, table_schema AS \`schema\`, IF(table_type = 'VIEW', 'view', 'table') AS kind, table_rows AS \`rows\`
             FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name LIMIT 500`,
      )) as { name: string; schema: string; kind: "table" | "view"; rows: number | string | bigint | null }[];
      const columns = (await sql.unsafe(
        pg
          ? `SELECT c.table_schema AS schema, c.table_name AS tbl, c.column_name AS name, c.data_type AS type, c.is_nullable = 'YES' AS nullable
             FROM information_schema.columns c WHERE c.table_schema NOT IN ('pg_catalog','information_schema') ORDER BY c.table_schema, c.table_name, c.ordinal_position`
          : `SELECT table_schema AS \`schema\`, table_name AS tbl, column_name AS name, column_type AS type, is_nullable = 'YES' AS nullable
             FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`,
      )) as { schema: string; tbl: string; name: string; type: string; nullable: boolean | number }[];
      const keys = (await sql.unsafe(
        pg
          ? `SELECT kcu.table_schema AS schema, kcu.table_name AS tbl, kcu.column_name AS name, tc.constraint_type AS type,
               ccu.table_name AS ref_table, ccu.column_name AS ref_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
             LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
             WHERE tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY') AND tc.table_schema NOT IN ('pg_catalog','information_schema')`
          : `SELECT k.table_schema AS \`schema\`, k.table_name AS tbl, k.column_name AS name,
               IF(k.constraint_name = 'PRIMARY', 'PRIMARY KEY', 'FOREIGN KEY') AS type, k.referenced_table_name AS ref_table, k.referenced_column_name AS ref_column
             FROM information_schema.key_column_usage k
             WHERE k.table_schema = DATABASE() AND (k.constraint_name = 'PRIMARY' OR k.referenced_table_name IS NOT NULL)`,
      )) as {
        schema: string;
        tbl: string;
        name: string;
        type: string;
        ref_table: string | null;
        ref_column: string | null;
      }[];
      // Statistics are empty until the database has analyzed a table: count those exactly, capped.
      const unknown = tables.filter((t) => t.kind === "table" && !Number(t.rows)).slice(0, 100);
      if (unknown.length) {
        const q = (s: string) => (pg ? `"${s.replace(/"/g, '""')}"` : `\`${s.replace(/`/g, "``")}\``);
        const counted = (await sql
          .unsafe(
            unknown
              .map(
                (t, i) =>
                  `SELECT ${i} AS i, count(*) AS n FROM (SELECT 1 FROM ${q(t.schema)}.${q(t.name)} LIMIT 100000) x${i}`,
              )
              .join(" UNION ALL "),
          )
          .catch(() => [])) as { i: number; n: number | bigint }[];
        for (const c of counted) {
          const t = unknown[Number(c.i)];
          if (t) t.rows = Number(c.n);
        }
      }
      return tables.map((t) => ({
        name: t.name,
        ...(t.schema && t.schema !== "public" ? { schema: t.schema } : {}),
        kind: t.kind,
        ...(t.rows !== null && t.rows !== undefined ? { rows: Number(t.rows) } : {}),
        columns: columns
          .filter((c) => c.tbl === t.name && c.schema === t.schema)
          .map((c): DbColumn => {
            const own = keys.filter((k) => k.tbl === t.name && k.schema === t.schema && k.name === c.name);
            const fk = own.find((k) => k.type === "FOREIGN KEY" && k.ref_table);
            return {
              name: c.name,
              type: c.type,
              nullable: !!c.nullable,
              primary: own.some((k) => k.type === "PRIMARY KEY"),
              ...(fk ? { references: `${fk.ref_table}.${fk.ref_column}` } : {}),
            };
          }),
      }));
    });
  }

  /** One page of a table, newest-first when there is a primary key. */
  async rows(
    id: string,
    tableName: string,
    opts: { schema?: string; page?: number; size?: number } = {},
  ): Promise<DbResult> {
    const r = this.row(id);
    if (!/^[\w$. -]{1,128}$/.test(tableName) || (opts.schema && !/^[\w$-]{1,64}$/.test(opts.schema)))
      throw new Error("Unknown table");
    const size = Math.min(200, Math.max(10, opts.size ?? 50));
    const offset = Math.max(0, (opts.page ?? 0) * size);
    if (r.kind === "mongodb") {
      const started = performance.now();
      return this.withMongo(r, async (db) => {
        const docs = await db
          .collection(tableName)
          .find({}, { limit: size, skip: offset, sort: { _id: -1 } })
          .toArray();
        return table(docs as Record<string, unknown>[], Math.round(performance.now() - started));
      });
    }
    const quote = r.kind === "mysql" ? (s: string) => `\`${s}\`` : (s: string) => `"${s}"`;
    const name = opts.schema ? `${quote(opts.schema)}.${quote(tableName)}` : quote(tableName);
    return this.run(r, `SELECT * FROM ${name} LIMIT ${size} OFFSET ${offset}`, false);
  }

  /** A query from the editor. A write needs `allowWrite`; on a read-only database it is refused. */
  async query(id: string, text: string, allowWrite = false): Promise<DbResult> {
    const r = this.row(id);
    if (!text.trim()) throw new Error("Write a query first");
    if (r.kind === "mongodb") return this.mongoQuery(r, text, allowWrite);
    const write = isWriteSql(text);
    if (write && r.read_only)
      throw Object.assign(new Error("This database is read-only. Turn off read-only in its settings to change data."), {
        code: "read_only",
      });
    if (write && !allowWrite)
      throw Object.assign(new Error("This query changes data. Confirm to run it."), { code: "confirm" });
    return this.run(r, text, write);
  }

  private async run(r: ConnRow, text: string, write: boolean): Promise<DbResult> {
    const started = performance.now();
    if (r.kind === "sqlite") {
      const db = await this.openSqlite(r);
      try {
        const statements = text
          .split(/;\s*(?:\n|$)/)
          .map((s) => s.trim())
          .filter(Boolean);
        let last: DbResult = table([], 0);
        for (const statement of statements) {
          const q = db.query(statement);
          if (write && !/^\s*(select|with|pragma|explain)\b/i.test(statement)) {
            const res = q.run();
            last = table([], Math.round(performance.now() - started), res.changes);
          } else last = table(q.all() as Record<string, unknown>[], Math.round(performance.now() - started));
        }
        return last;
      } finally {
        db.close();
      }
    }
    return this.withSql(r, async (sql) => {
      const reserved = await sql.reserve();
      try {
        if (r.read_only)
          await reserved.unsafe(r.kind === "postgres" ? "BEGIN READ ONLY" : "START TRANSACTION READ ONLY");
        const result = (await reserved.unsafe(text)) as Record<string, unknown>[] & {
          count?: number;
          affectedRows?: number;
        };
        if (r.read_only) await reserved.unsafe("ROLLBACK");
        // Several statements give one result each; the last one is what the editor shows.
        const last = (
          Array.isArray(result) && Array.isArray(result[0]) ? result[result.length - 1] : result
        ) as typeof result;
        const rows = Array.isArray(last) ? [...last] : [];
        const changed = write ? Number(last.count ?? last.affectedRows ?? 0) : undefined;
        return table(rows, Math.round(performance.now() - started), changed);
      } catch (err) {
        if (r.read_only) await reserved.unsafe("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        reserved.release();
      }
    });
  }

  /**
   * Mongo queries are JSON: {"find": "users", "filter": {...}, "sort": {...}, "limit": 50},
   * {"aggregate": "orders", "pipeline": [...]}, {"count": "users", "filter": {...}}. Writes
   * (insertOne, updateMany, deleteMany…) only on a writable database and with a yes.
   */
  private async mongoQuery(r: ConnRow, text: string, allowWrite: boolean): Promise<DbResult> {
    let q: Record<string, unknown>;
    try {
      q = JSON.parse(text);
    } catch {
      throw new Error('Mongo queries are JSON, for example {"find": "users", "filter": {"active": true}, "limit": 20}');
    }
    const op = [
      "find",
      "aggregate",
      "count",
      "distinct",
      "insertOne",
      "updateOne",
      "updateMany",
      "deleteOne",
      "deleteMany",
    ].find((k) => typeof q[k] === "string");
    if (!op)
      throw new Error(
        "Start with find, aggregate, count, distinct, insertOne, updateOne, updateMany, deleteOne or deleteMany",
      );
    const pipeline = (q.pipeline as Record<string, unknown>[] | undefined) ?? [];
    const write =
      !["find", "aggregate", "count", "distinct"].includes(op) || pipeline.some((s) => "$out" in s || "$merge" in s);
    if (write && r.read_only)
      throw Object.assign(new Error("This database is read-only. Turn off read-only in its settings to change data."), {
        code: "read_only",
      });
    if (write && !allowWrite)
      throw Object.assign(new Error("This query changes data. Confirm to run it."), { code: "confirm" });
    const started = performance.now();
    return this.withMongo(r, async (db) => {
      const coll = db.collection(String(q[op]));
      const filter = (q.filter as Record<string, unknown>) ?? {};
      const ms = () => Math.round(performance.now() - started);
      if (op === "find")
        return table(
          (await coll
            .find(filter, {
              ...(q.sort ? { sort: q.sort as Record<string, 1 | -1> } : {}),
              ...(q.projection ? { projection: q.projection as Record<string, 0 | 1> } : {}),
              limit: Math.min(MAX_ROWS + 1, Number(q.limit) || 50),
              skip: Number(q.skip) || 0,
            })
            .toArray()) as Record<string, unknown>[],
          ms(),
        );
      if (op === "aggregate")
        return table(
          (await coll
            .aggregate(pipeline, { maxTimeMS: QUERY_TIMEOUT })
            .limit(MAX_ROWS + 1)
            .toArray()) as Record<string, unknown>[],
          ms(),
        );
      if (op === "count") return table([{ count: await coll.countDocuments(filter) }], ms());
      if (op === "distinct")
        return table(
          (await coll.distinct(String(q.field ?? "_id"), filter)).map((value) => ({ value })),
          ms(),
        );
      if (op === "insertOne") {
        await coll.insertOne((q.document as Record<string, unknown>) ?? {});
        return table([], ms(), 1);
      }
      const update = (q.update as Record<string, unknown>) ?? {};
      const res =
        op === "updateOne"
          ? await coll.updateOne(filter, update)
          : op === "updateMany"
            ? await coll.updateMany(filter, update)
            : op === "deleteOne"
              ? await coll.deleteOne(filter)
              : await coll.deleteMany(filter);
      return table([], ms(), "modifiedCount" in res ? res.modifiedCount : res.deletedCount);
    });
  }

  /** The query plan (EXPLAIN without running it): something the expert can read without any data. */
  async explain(id: string, text: string): Promise<string | undefined> {
    const r = this.row(id);
    if (r.kind === "mongodb" || isWriteSql(text)) return undefined;
    try {
      const prefix = r.kind === "sqlite" ? "EXPLAIN QUERY PLAN " : "EXPLAIN ";
      const res = await this.run({ ...r, read_only: 1 }, prefix + text.trim().replace(/;$/, ""), false);
      return res.rows
        .map((row) => row.map((c) => String(c ?? "")).join(" "))
        .join("\n")
        .slice(0, 4000);
    } catch {
      return undefined;
    }
  }
}
