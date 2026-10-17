import { Database as Sqlite } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { erDiagram, isWriteSql, tablesInSql } from "@godeye/core";
import { BackupJobs, nextBackupAt } from "./backup-jobs";
import { Bus } from "./bus";
import { Databases, displayAddress, kindOf } from "./databases";
import { openDb } from "./db";
import { EnvFiles } from "./envfiles";
import { Sealer } from "./seal";
import type { Servers } from "./servers";
import { Store } from "./store";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "godeye-data-"));
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const databases = new Databases(sqlite, store, new Sealer(dir), new EnvFiles(join(dir, "env-backups")));
  const file = join(dir, "shop.db");
  const db = new Sqlite(file);
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)");
  db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), total REAL)");
  db.run("INSERT INTO users (email) VALUES ('a@x.test'), ('b@x.test')");
  db.run("INSERT INTO orders (user_id, total) VALUES (1, 9.5)");
  db.close();
  return { dir, sqlite, store, databases, file };
}

describe("sql helpers", () => {
  test("writes are recognized, reads are not", () => {
    for (const q of [
      "insert into t values (1)",
      "  UPDATE t SET a = 1",
      "select 1; drop table t",
      "with d as (delete from t returning *) select * from d",
      "select * into backup_t from t",
      "select * from t for update",
      "pragma journal_mode = wal",
    ])
      expect(isWriteSql(q)).toBe(true);
    for (const q of [
      "select * from t where note = 'insert'",
      "-- drop table\nselect 1",
      "explain select 1",
      "pragma table_info(t)",
      "select a into @x from t",
    ])
      expect(isWriteSql(q)).toBe(false);
    expect(tablesInSql('select * from "users" u join public.orders o on o.user_id = u.id')).toEqual([
      "users",
      "orders",
    ]);
  });

  test("addresses: kind and display without the password", () => {
    expect(kindOf("postgresql://u:p@h/db")).toBe("postgres");
    expect(kindOf("mongodb+srv://u:p@c.example.net/app")).toBe("mongodb");
    expect(kindOf("/data/app.sqlite3")).toBe("sqlite");
    expect(kindOf("redis://h")).toBeUndefined();
    expect(displayAddress("postgres", "postgres://app:s3cret@db.example.com:5432/shop")).toBe(
      "postgres://app@db.example.com:5432/shop",
    );
  });
});

describe("database explorer (SQLite)", () => {
  test("tables with keys, rows, a diagram; the address is stored encrypted", async () => {
    const { sqlite, databases, file } = setup();
    const conn = await databases.add({ address: file, name: "Shop" });
    expect(conn).toMatchObject({ kind: "sqlite", prod: false, readOnly: false, display: file });
    const stored = sqlite.query("SELECT address FROM db_connections").get() as { address: string };
    expect(stored.address).not.toContain("shop.db");
    expect(await databases.address(conn.id)).toBe(file);
    const tables = await databases.tables(conn.id);
    expect(tables.map((t) => `${t.name}:${t.rows}`)).toEqual(["orders:1", "users:2"]);
    expect(tables[0]?.columns.find((c) => c.name === "user_id")?.references).toBe("users.id");
    expect(erDiagram(tables)).toContain('users ||--o{ orders : "user_id"');
    const rows = await databases.rows(conn.id, "users");
    expect(rows.columns).toEqual(["id", "email"]);
    expect(rows.rows).toHaveLength(2);
    expect((await databases.test(conn.id)).ok).toBe(true);
  });

  test("a write needs a yes; a prod database is read-only even with one", async () => {
    const { databases, file } = setup();
    const conn = await databases.add({ address: file });
    await expect(databases.query(conn.id, "delete from orders")).rejects.toMatchObject({ code: "confirm" });
    expect((await databases.query(conn.id, "delete from orders", true)).changed).toBe(1);
    databases.update(conn.id, { prod: true });
    expect(databases.get(conn.id).readOnly).toBe(true);
    await expect(databases.query(conn.id, "delete from users", true)).rejects.toMatchObject({ code: "read_only" });
    // Even a write the classifier misses can't change a read-only file.
    await expect(databases.query(conn.id, "select 1; delete from users", true)).rejects.toThrow();
    expect((await databases.query(conn.id, "select count(*) as n from users")).rows).toEqual([[2]]);
    expect(await databases.explain(conn.id, "select * from users where email = 'a'")).toContain("users");
  });

  test("suggestions from .env keys and database files, added without showing the value", async () => {
    const { store, databases, dir } = setup();
    const project = mkdtempSync(join(tmpdir(), "godeye-proj-"));
    writeFileSync(join(project, ".env"), `DATABASE_URL=file:${join(dir, "shop.db")}\nOTHER=1\n`);
    writeFileSync(join(project, "local.sqlite"), readFileSync(join(dir, "shop.db")));
    const projectId = store.addProject(project);
    const s = databases.suggestions(projectId);
    expect(s.map((x) => x.label)).toEqual(["DATABASE_URL · .env", "local.sqlite"]);
    const conn = await databases.add({ projectId, from: s[0]?.source });
    expect(conn.kind).toBe("sqlite");
    await expect(databases.add({ projectId, from: { kind: "file", path: "../../etc/passwd.db" } })).rejects.toThrow(
      "Outside",
    );
  });
});

describe("backup manager", () => {
  test("the next run of daily and weekly jobs", () => {
    const from = new Date(2026, 9, 17, 10, 0).getTime(); // Saturday 10:00
    expect(new Date(nextBackupAt({ every: "day", time: "03:00" }, from) ?? 0).getDate()).toBe(18);
    expect(new Date(nextBackupAt({ every: "day", time: "23:30" }, from) ?? 0).getDate()).toBe(17);
    const weekly = new Date(nextBackupAt({ every: "week", time: "03:00", weekday: 1 }, from) ?? 0);
    expect([weekly.getDay(), weekly.getDate()]).toEqual([1, 19]);
    expect(nextBackupAt({ every: "manual", time: "03:00" }, from)).toBeUndefined();
  });

  test("a SQLite backup is made, tested by restoring it, kept by count and restorable as a new file", async () => {
    const { sqlite, store, databases, file, dir } = setup();
    const conn = await databases.add({ address: file });
    let now = Date.now();
    const jobs = new BackupJobs(sqlite, store, new Bus(), databases, {} as Servers, join(dir, "backups"), () => now);
    const job = jobs.add({
      name: "Shop DB",
      source: { kind: "database", connectionId: conn.id },
      every: "day",
      time: "03:00",
      keep: 2,
      verify: true,
    });
    const first = await jobs.run(job.id);
    expect(first.status).toBe("ok");
    expect(first.file?.endsWith(".sqlite.gz")).toBe(true);
    expect(first.verified).toMatchObject({ ok: true, how: "restore", counts: { tables: 2, rows: 3 } });
    now += 1000;
    await jobs.run(job.id);
    now += 1000;
    const third = await jobs.run(job.id);
    expect(existsSync(first.file ?? "")).toBe(false);
    expect(jobs.runs(job.id)).toHaveLength(3);
    const restored = await jobs.restoreSqlite(third.id);
    expect(restored).toContain(".restored-");
    const copy = new Sqlite(restored, { readonly: true });
    expect((copy.query("select count(*) as n from users").get() as { n: number }).n).toBe(2);
    copy.close();
    expect(jobs.notices()).toEqual([]);
  });

  test("a folder backup is listed as its test; a failing job is an inbox item", async () => {
    const { sqlite, store, databases, dir } = setup();
    const folder = join(dir, "site");
    Bun.spawnSync(["mkdir", "-p", join(folder, "img")]);
    writeFileSync(join(folder, "index.html"), "<h1>hi</h1>");
    const jobs = new BackupJobs(sqlite, store, new Bus(), databases, {} as Servers, join(dir, "backups"));
    const job = jobs.add({
      name: "Site",
      source: { kind: "files", path: folder },
      every: "manual",
      time: "03:00",
      keep: 3,
      verify: true,
    });
    const run = await jobs.run(job.id);
    expect(run.status).toBe("ok");
    expect(run.verified).toMatchObject({ ok: true, how: "list", counts: { files: 3 } });
    expect(() =>
      jobs.add({
        name: "Bad",
        source: { kind: "files", path: "/tmp/x; rm -rf /" },
        every: "day",
        time: "03:00",
        keep: 1,
        verify: true,
      }),
    ).toThrow();
    const conn = await databases.add({ address: join(dir, "shop.db") });
    const broken = jobs.add({
      name: "Gone",
      source: { kind: "database", connectionId: conn.id },
      every: "day",
      time: "03:00",
      keep: 1,
      verify: true,
    });
    Bun.spawnSync(["rm", join(dir, "shop.db")]);
    expect((await jobs.run(broken.id)).status).toBe("failed");
    expect(jobs.notices().map((n) => n.kind)).toEqual(["backup"]);
  });
});

describe("product analytics", () => {
  test("events counted per day, user ids only as hashes, sign-ups from a table with numeric times", async () => {
    const { Analytics } = await import("./analytics");
    const { AppErrors } = await import("./apperrors");
    const { sqlite, store, databases, dir } = setup();
    const projectId = store.addProject(mkdtempSync(join(tmpdir(), "godeye-an-")));
    const errors = new AppErrors(sqlite, store, new Bus());
    const key = errors.key(projectId);
    const now = Date.now();
    const analytics = new Analytics(sqlite, errors, databases, () => now);
    expect(analytics.ingest("nope", { event: "x" })).toBe(false);
    expect(
      analytics.ingest(key, {
        events: [
          { event: "export_pdf", user: "ada@x.test" },
          { event: "export_pdf", user: "ada@x.test" },
          { event: "search", user: 42 },
          { event: "<script>" },
        ],
      }),
    ).toBe(true);
    const hashes = sqlite.query("SELECT user_hash FROM app_users_daily").all() as { user_hash: string }[];
    expect(hashes).toHaveLength(2);
    expect(JSON.stringify(hashes)).not.toContain("ada");
    // Sign-ups stored as epoch milliseconds (as Prisma does on SQLite).
    const file = join(dir, "app.db");
    const app = new Sqlite(file);
    app.run("CREATE TABLE users (id INTEGER PRIMARY KEY, createdAt INTEGER)");
    for (const daysAgo of [1, 2, 3, 9, 10, 30])
      app.query("INSERT INTO users (createdAt) VALUES (?)").run(now - daysAgo * 86_400_000);
    app.close();
    const conn = await databases.add({ address: file, projectId });
    analytics.setSource(projectId, { connectionId: conn.id, table: "users", createdColumn: "createdAt" });
    const s = await analytics.summary(projectId);
    expect(s.users).toMatchObject({ total: 6, last7: 3, previous7: 2 });
    expect(s.active).toMatchObject({ day: 2, week: 2 });
    expect(s.events).toEqual([
      { event: "export_pdf", last7: 2, previous7: 0 },
      { event: "search", last7: 1, previous7: 0 },
    ]);
    expect(analytics.draft(s, "Shop")).toContain("new in the last 7 days: 3");
    expect(() =>
      analytics.setSource(projectId, { connectionId: conn.id, table: "users; drop", createdColumn: "x" }),
    ).toThrow();
  });
});
