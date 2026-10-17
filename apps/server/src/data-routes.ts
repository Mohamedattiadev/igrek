import { type BackupJob, erDiagram, tablesInSql } from "@godeye/core";
import type { Hono } from "hono";
import type { BackupJobs } from "./backup-jobs";
import type { Databases } from "./databases";

const fail = (err: unknown) => {
  const e = err as Error & { code?: string };
  return { error: e.message, ...(e.code ? { code: e.code } : {}) };
};

export function registerDataRoutes(
  app: Hono,
  { databases, backups }: { databases: Databases; backups: BackupJobs },
): void {
  app.get("/api/databases", (c) => c.json(databases.list()));
  app.get("/api/projects/:id/database-suggestions", (c) => c.json(databases.suggestions(c.req.param("id"))));
  app.post("/api/databases", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Parameters<Databases["add"]>[0];
    try {
      const conn = await databases.add(body);
      return c.json({ ...conn, test: await databases.test(conn.id) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.patch("/api/databases/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string; prod?: boolean; readOnly?: boolean };
    try {
      return c.json(databases.update(c.req.param("id"), body));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/databases/:id", (c) => {
    databases.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/databases/:id/test", async (c) => c.json(await databases.test(c.req.param("id"))));
  app.get("/api/databases/:id/tables", async (c) => {
    try {
      return c.json(await databases.tables(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/databases/:id/diagram", async (c) => {
    try {
      return c.json({ mermaid: erDiagram(await databases.tables(c.req.param("id"))) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/databases/:id/rows", async (c) => {
    try {
      return c.json(
        await databases.rows(c.req.param("id"), c.req.query("table") ?? "", {
          schema: c.req.query("schema") || undefined,
          page: Number(c.req.query("page")) || 0,
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/databases/:id/query", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { query?: string; allowWrite?: boolean };
    try {
      return c.json(await databases.query(c.req.param("id"), String(body.query ?? ""), body.allowWrite === true));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  /** What "Ask the DB expert" sends: the query, the schema of the tables it uses and the plan. Never rows. */
  app.post("/api/databases/:id/explain-draft", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { query?: string };
    const query = String(body.query ?? "").slice(0, 8000);
    try {
      const conn = databases.get(c.req.param("id"));
      const used = new Set(tablesInSql(query).map((t) => t.toLowerCase()));
      const tables = (await databases.tables(conn.id)).filter((t) => used.has(t.name.toLowerCase()));
      const schema = tables
        .map(
          (t) =>
            `${t.name}(${t.columns.map((col) => `${col.name} ${col.type}${col.primary ? " PK" : ""}${col.references ? ` -> ${col.references}` : ""}`).join(", ")})${t.rows !== undefined ? ` ~${t.rows} rows` : ""}`,
        )
        .join("\n");
      const plan = await databases.explain(conn.id, query);
      return c.json({ kind: conn.kind, prod: conn.prod, query, schema, plan, projectId: conn.projectId });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.get("/api/backups", (c) => c.json(backups.list()));
  app.post("/api/backups", async (c) => {
    try {
      return c.json(backups.add((await c.req.json()) as BackupJob));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.put("/api/backups/:id", async (c) => {
    try {
      return c.json(backups.update(c.req.param("id"), (await c.req.json()) as BackupJob));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/backups/:id", (c) => {
    backups.remove(c.req.param("id"), c.req.query("files") === "1");
    return c.json({ ok: true });
  });
  app.get("/api/backups/:id/runs", (c) => c.json(backups.runs(c.req.param("id"))));
  app.post("/api/backups/:id/run", async (c) => {
    try {
      return c.json(await backups.run(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/backup-runs/:id/verify", async (c) => {
    try {
      return c.json(await backups.verifyRun(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/backup-runs/:id/restore", async (c) => {
    try {
      return c.json({ file: await backups.restoreSqlite(c.req.param("id")) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
