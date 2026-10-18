import type { Database } from "bun:sqlite";
import { Database as Sqlite } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { BackupJob, BackupRun, InboxNotice } from "@igrek/core";
import type { Bus } from "./bus";
import type { Databases } from "./databases";
import type { Servers } from "./servers";
import type { Store } from "./store";

const DAY = 86_400_000;

type JobInput = Omit<BackupJob, "id" | "createdAt" | "lastRun" | "nextAt">;

/** When a job runs next, after `from`. Manual jobs never do. */
export function nextBackupAt(job: Pick<BackupJob, "every" | "time" | "weekday">, from: number): number | undefined {
  if (job.every === "manual") return undefined;
  const [h = 3, m = 0] = job.time.split(":").map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (job.every === "day") {
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  const want = job.weekday ?? 0;
  let add = (want - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= from) add = 7;
  d.setDate(d.getDate() + add);
  return d.getTime();
}

function spawn(cmd: string[], env?: Record<string, string>): Promise<{ code: number; out: string; err: string }> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
    const timer = setTimeout(() => proc.kill(), 60 * 60_000);
    return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).then(
      ([out, err, code]) => {
        clearTimeout(timer);
        return { code, out, err };
      },
    );
  } catch (err) {
    return Promise.resolve({ code: 127, out: "", err: (err as Error).message });
  }
}

/** A database address without its password (that goes in an environment variable instead). */
function splitPassword(address: string): { url: string; password?: string } {
  const u = new URL(address);
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  u.password = "";
  return { url: u.toString().replace(/:@/, "@"), password };
}

/**
 * Backup manager (plan.md 12): database and folder backups on a schedule, kept for a number of
 * runs, and tested: a new backup is restored where it is safe to (a temporary database, a copy of
 * the file) and counted, so a backup that can't be restored is found before the day you need it.
 */
export class BackupJobs {
  private running = new Set<string>();

  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly databases: Databases,
    private readonly servers: Servers,
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private changed(): void {
    this.bus.publish({ type: "ops-changed", what: "backups" });
  }

  list(): BackupJob[] {
    return (
      this.db.query("SELECT id, data, created_at FROM backup_jobs ORDER BY created_at").all() as {
        id: string;
        data: string;
        created_at: number;
      }[]
    ).map((r) => this.withState({ ...(JSON.parse(r.data) as JobInput), id: r.id, createdAt: r.created_at }));
  }

  private withState(job: BackupJob): BackupJob {
    const last = this.runs(job.id, 1)[0];
    const from = last?.startedAt ?? job.createdAt;
    const next = nextBackupAt(job, Math.max(from, this.now() - DAY));
    return { ...job, ...(last ? { lastRun: last } : {}), ...(next ? { nextAt: next } : {}) };
  }

  get(id: string): BackupJob | undefined {
    return this.list().find((j) => j.id === id);
  }

  private validate(input: JobInput): JobInput {
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 80);
    if (!name) throw new Error("Give the backup a name");
    if (input.source?.kind === "database") this.databases.get(input.source.connectionId);
    else if (input.source?.kind === "files") {
      if (!input.source.path?.startsWith("/")) throw new Error("Use the full path of the folder");
      if (/["'`$\\\n;&|<>]/.test(input.source.path)) throw new Error("The path has characters that aren't allowed");
      if (input.source.serverId && !this.servers.get(input.source.serverId)) throw new Error("Server not found");
      if (!input.source.serverId && !existsSync(input.source.path)) throw new Error("No such folder");
    } else throw new Error("Pick what to back up");
    if (!["day", "week", "manual"].includes(input.every)) throw new Error("Unknown schedule");
    if (!/^\d{2}:\d{2}$/.test(input.time ?? "")) throw new Error("Use a time like 03:00");
    return {
      name,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      source: input.source,
      every: input.every,
      time: input.time,
      ...(input.every === "week" ? { weekday: Math.min(6, Math.max(0, Number(input.weekday ?? 0))) } : {}),
      keep: Math.min(100, Math.max(1, Math.round(Number(input.keep) || 7))),
      verify: input.verify !== false,
    };
  }

  add(input: JobInput): BackupJob {
    const job = this.validate(input);
    const id = crypto.randomUUID().slice(0, 12);
    this.db
      .query("INSERT INTO backup_jobs (id, data, created_at) VALUES (?, ?, ?)")
      .run(id, JSON.stringify(job), this.now());
    this.changed();
    return this.get(id) as BackupJob;
  }

  update(id: string, input: JobInput): BackupJob {
    const job = this.validate(input);
    this.db.query("UPDATE backup_jobs SET data = ? WHERE id = ?").run(JSON.stringify(job), id);
    this.changed();
    return this.get(id) as BackupJob;
  }

  /** Removes the job; its backup files stay on disk unless asked. */
  remove(id: string, deleteFiles = false): void {
    // Both or neither: a job removed halfway would leave runs nobody owns.
    this.db.transaction(() => {
      this.db.query("DELETE FROM backup_jobs WHERE id = ?").run(id);
      this.db.query("DELETE FROM backup_runs WHERE job_id = ?").run(id);
    })();
    if (deleteFiles) rmSync(join(this.dir, id), { recursive: true, force: true });
    this.changed();
  }

  runs(jobId: string, limit = 20): BackupRun[] {
    return (
      this.db
        .query("SELECT data FROM backup_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?")
        .all(jobId, limit) as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data) as BackupRun);
  }

  private save(run: BackupRun): void {
    this.db
      .query("INSERT OR REPLACE INTO backup_runs (id, job_id, data, started_at) VALUES (?, ?, ?, ?)")
      .run(run.id, run.jobId, JSON.stringify(run), run.startedAt);
    this.changed();
  }

  async run(jobId: string): Promise<BackupRun> {
    const job = this.get(jobId);
    if (!job) throw new Error("Backup not found");
    if (this.running.has(jobId)) throw new Error("This backup is already running");
    this.running.add(jobId);
    const run: BackupRun = { id: crypto.randomUUID().slice(0, 12), jobId, startedAt: this.now(), status: "running" };
    this.save(run);
    try {
      const folder = join(this.dir, jobId);
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const stamp = new Date(run.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      run.file = await this.make(job, join(folder, stamp));
      run.bytes = statSync(run.file).size;
      run.status = "ok";
      run.finishedAt = this.now();
      this.save(run);
      if (job.verify) run.verified = await this.test(job, run.file);
      this.prune(job);
    } catch (err) {
      run.status = "failed";
      run.error = (err as Error).message.slice(0, 500);
      run.finishedAt = this.now();
      this.bus.publish({ type: "alert", kind: "backupFailed", title: job.name, link: "/tools?tab=backups" });
    } finally {
      this.running.delete(jobId);
    }
    this.save(run);
    return run;
  }

  /** Makes the backup file and returns its path (the extension depends on what was backed up). */
  private async make(job: BackupJob, base: string): Promise<string> {
    if (job.source.kind === "files") {
      const file = `${base}.tar.gz`;
      const parent = dirname(job.source.path);
      const name = basename(job.source.path);
      if (job.source.serverId) {
        await this.servers.download(
          job.source.serverId,
          `tar -czf - -C '${parent}' '${name}'`,
          `Backup: ${job.name}`,
          file,
        );
      } else {
        const r = await spawn(["tar", "-czf", file, "-C", parent, name]);
        if (r.code !== 0) throw new Error(r.err.trim().slice(-300) || "tar failed");
      }
      return file;
    }
    const conn = this.databases.get(job.source.connectionId);
    const address = await this.databases.address(conn.id);
    if (conn.kind === "sqlite") {
      const file = `${base}.sqlite`;
      const src = new Sqlite(address, { readonly: true });
      try {
        // A consistent copy even while the app writes to it.
        src.run(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      } finally {
        src.close();
      }
      const gz = `${file}.gz`;
      writeFileSync(gz, Bun.gzipSync(new Uint8Array(await Bun.file(file).arrayBuffer())));
      rmSync(file);
      return gz;
    }
    if (conn.kind === "postgres") {
      const file = `${base}.dump`;
      const { url, password } = splitPassword(address);
      const r = await spawn(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", `--file=${file}`, url], {
        ...(password ? { PGPASSWORD: password } : {}),
      });
      if (r.code === 127 || /not found|ENOENT/.test(r.err))
        throw new Error("pg_dump is not installed on this computer");
      if (r.code !== 0) throw new Error(r.err.trim().split("\n").slice(-3).join(" ").slice(0, 300));
      return file;
    }
    if (conn.kind === "mysql") {
      const file = `${base}.sql.gz`;
      const u = new URL(address);
      const r = await spawn(
        [
          "mysqldump",
          "--single-transaction",
          "--routines",
          `--host=${u.hostname}`,
          `--port=${u.port || "3306"}`,
          `--user=${decodeURIComponent(u.username)}`,
          u.pathname.replace(/^\//, ""),
        ],
        u.password ? { MYSQL_PWD: decodeURIComponent(u.password) } : {},
      );
      if (r.code === 127) throw new Error("mysqldump is not installed on this computer");
      if (r.code !== 0) throw new Error(r.err.trim().slice(-300));
      writeFileSync(file, Bun.gzipSync(new TextEncoder().encode(r.out)));
      return file;
    }
    // MongoDB: every collection as extended JSON lines, through the driver (no extra tools).
    const file = `${base}.ndjson.gz`;
    const { MongoClient, BSON } = await import("mongodb");
    const client = new MongoClient(address, { serverSelectionTimeoutMS: 10_000 });
    const lines: string[] = [];
    try {
      await client.connect();
      const mdb = client.db();
      for (const c of await mdb.listCollections({}, { nameOnly: true }).toArray()) {
        if (c.name.startsWith("system.")) continue;
        for await (const doc of mdb.collection(c.name).find({}))
          lines.push(JSON.stringify({ collection: c.name, doc: BSON.EJSON.serialize(doc) }));
      }
    } finally {
      await client.close().catch(() => undefined);
    }
    writeFileSync(file, Bun.gzipSync(new TextEncoder().encode(lines.join("\n"))));
    return file;
  }

  /** The restore test of one backup file. */
  async test(job: BackupJob, file: string): Promise<NonNullable<BackupRun["verified"]>> {
    const at = this.now();
    try {
      if (file.endsWith(".tar.gz")) {
        const r = await spawn(["tar", "-tzf", file]);
        const entries = r.out.split("\n").filter(Boolean).length;
        return { ok: r.code === 0 && entries > 0, how: "list", counts: { files: entries }, at };
      }
      if (file.endsWith(".sqlite.gz")) {
        const tmp = join(dirname(file), `.restore-test-${at}.sqlite`);
        writeFileSync(tmp, Bun.gunzipSync(new Uint8Array(await Bun.file(file).arrayBuffer())));
        const copy = new Sqlite(tmp, { readonly: true });
        try {
          const check = (copy.query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
          const tables = copy
            .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
            .all() as {
            name: string;
          }[];
          let rows = 0;
          for (const t of tables)
            rows += (copy.query(`SELECT count(*) AS n FROM "${t.name.replace(/"/g, '""')}"`).get() as { n: number }).n;
          return {
            ok: check === "ok",
            how: "restore",
            counts: { tables: tables.length, rows },
            ...(check === "ok" ? {} : { note: "integrity", detail: check }),
            at,
          };
        } finally {
          copy.close();
          rmSync(tmp, { force: true });
        }
      }
      if (file.endsWith(".dump")) return await this.testPostgres(job, file, at);
      if (file.endsWith(".sql.gz")) {
        const text = new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await Bun.file(file).arrayBuffer())));
        const tables = (text.match(/^CREATE TABLE/gm) ?? []).length;
        const done = /-- Dump completed/.test(text.slice(-500));
        return { ok: done, how: "read", counts: { tables }, ...(done ? {} : { note: "incomplete" }), at };
      }
      if (file.endsWith(".ndjson.gz")) {
        const text = new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(await Bun.file(file).arrayBuffer())));
        const counts = new Map<string, number>();
        for (const line of text.split("\n").filter(Boolean)) {
          const { collection } = JSON.parse(line) as { collection: string };
          counts.set(collection, (counts.get(collection) ?? 0) + 1);
        }
        const docs = [...counts.values()].reduce((a, b) => a + b, 0);
        return { ok: true, how: "read", counts: { collections: counts.size, documents: docs }, at };
      }
      return { ok: false, how: "none", note: "unknown", at };
    } catch (err) {
      return { ok: false, how: "failed", detail: (err as Error).message.slice(0, 300), at };
    }
  }

  /**
   * PostgreSQL: restored into a temporary database next to the original and counted, then the
   * temporary database is dropped. On a prod database (or without the right to create databases)
   * only the dump's table of contents is read, nothing is written to the server.
   */
  private async testPostgres(job: BackupJob, file: string, at: number): Promise<NonNullable<BackupRun["verified"]>> {
    const list = await spawn(["pg_restore", "--list", file]);
    if (list.code !== 0) return { ok: false, how: "list", detail: list.err.trim().slice(-300), at };
    const tables = (list.out.match(/ TABLE DATA /g) ?? []).length;
    const listed = { ok: true, how: "list" as const, counts: { tables }, at };
    if (job.source.kind !== "database") return listed;
    const conn = this.databases.get(job.source.connectionId);
    if (conn.prod || conn.readOnly) return listed;
    const address = await this.databases.address(conn.id);
    const { url, password } = splitPassword(address);
    const env: Record<string, string> = password ? { PGPASSWORD: password } : {};
    const temp = `godeye_restore_test_${at}`;
    const admin = new Bun.SQL(address, { max: 1, connectionTimeout: 10 });
    try {
      await admin.unsafe(`CREATE DATABASE ${temp}`);
    } catch {
      await admin.close().catch(() => undefined);
      return { ...listed, note: "listOnly" };
    }
    try {
      const target = new URL(url);
      target.pathname = `/${temp}`;
      const restored = await spawn(
        ["pg_restore", "--no-owner", "--no-privileges", `--dbname=${target.toString()}`, file],
        env,
      );
      const checkUrl = new URL(address);
      checkUrl.pathname = `/${temp}`;
      const check = new Bun.SQL(checkUrl.toString(), { max: 1, connectionTimeout: 10 });
      try {
        const t = (await check.unsafe(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')",
        )) as { n: number }[];
        await check.unsafe("ANALYZE");
        const r = (await check.unsafe("SELECT COALESCE(sum(n_live_tup), 0)::bigint AS n FROM pg_stat_user_tables")) as {
          n: bigint | number;
        }[];
        const restoredTables = t[0]?.n ?? 0;
        return {
          ok: restoredTables >= tables && (restored.code === 0 || restoredTables > 0),
          how: "restore",
          counts: { tables: restoredTables, rows: Number(r[0]?.n ?? 0) },
          ...(restored.code === 0 ? {} : { note: (restored.err.trim().split("\n").pop() ?? "").slice(0, 160) }),
          at,
        };
      } finally {
        await check.close().catch(() => undefined);
      }
    } finally {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${temp} WITH (FORCE)`).catch(() => undefined);
      await admin.close().catch(() => undefined);
    }
  }

  async verifyRun(runId: string): Promise<BackupRun> {
    const row = this.db.query("SELECT data FROM backup_runs WHERE id = ?").get(runId) as { data: string } | null;
    if (!row) throw new Error("Backup not found");
    const run = JSON.parse(row.data) as BackupRun;
    const job = this.get(run.jobId);
    if (!job || !run.file || !existsSync(run.file)) throw new Error("The backup file is gone");
    run.verified = await this.test(job, run.file);
    this.save(run);
    return run;
  }

  /** SQLite backups come back as a new file next to the original; the original is never overwritten. */
  async restoreSqlite(runId: string): Promise<string> {
    const row = this.db.query("SELECT data FROM backup_runs WHERE id = ?").get(runId) as { data: string } | null;
    if (!row) throw new Error("Backup not found");
    const run = JSON.parse(row.data) as BackupRun;
    const job = this.get(run.jobId);
    if (job?.source.kind !== "database" || !run.file?.endsWith(".sqlite.gz") || !existsSync(run.file))
      throw new Error("Only a SQLite backup can be restored from here");
    const original = await this.databases.address(job.source.connectionId);
    const target = original.replace(/(\.\w+)?$/, `.restored-${new Date(run.startedAt).toISOString().slice(0, 10)}$1`);
    writeFileSync(target, Bun.gunzipSync(new Uint8Array(await Bun.file(run.file).arrayBuffer())));
    return target;
  }

  /** Keeps the newest `keep` backup files of a job. */
  private prune(job: BackupJob): void {
    const folder = join(this.dir, job.id);
    if (!existsSync(folder)) return;
    const files = readdirSync(folder)
      .filter((f) => !f.startsWith("."))
      .sort()
      .reverse();
    for (const f of files.slice(job.keep)) rmSync(join(folder, f), { force: true });
  }

  async tick(): Promise<void> {
    const now = this.now();
    for (const job of this.list())
      if (job.nextAt && job.nextAt <= now && !this.running.has(job.id)) await this.run(job.id).catch(() => undefined);
  }

  notices(): InboxNotice[] {
    const out: InboxNotice[] = [];
    for (const job of this.list()) {
      const last = job.lastRun;
      const project = job.projectId ? (this.store.projectRow(job.projectId)?.name ?? "") : "";
      const bad =
        last?.status === "failed" ? last.error : last?.verified && !last.verified.ok ? last.verified.detail : undefined;
      if (last && bad)
        out.push({
          id: `backup:${last.id}`,
          kind: "backup",
          projectId: job.projectId ?? "",
          projectName: project,
          detail: `${job.name} · ${bad.slice(0, 80)}`,
          at: last.finishedAt ?? last.startedAt,
          link: "/tools?tab=backups",
        });
    }
    return out;
  }
}
