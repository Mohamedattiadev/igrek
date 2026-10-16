import type { Database } from "bun:sqlite";
import type { EnvChange, EnvKeyUse } from "@godeye/core";
import type { Hono } from "hono";
import { type EnvFiles, keyCount, removeFromText, setInText, valueIn } from "./envfiles";
import type { Insight } from "./insight";
import type { Servers } from "./servers";
import type { Store } from "./store";

interface Deps {
  env: EnvFiles;
  store: Store;
  insight: Insight;
  servers: Servers;
  db: Database;
  /** Tells teammates which setting changed (never the value). */
  onChange?: (projectId: string, change: { file: string; key: string; action: EnvChange["action"] }) => void;
}

/** "ssh:<serverId>:<path>" is a file on a server; anything else is a local path. */
function remoteOf(file: string): { serverId: string; path: string } | undefined {
  const m = file.match(/^ssh:([^:]+):(.+)$/);
  return m ? { serverId: m[1] as string, path: m[2] as string } : undefined;
}

/** .env editor (plan.md 5.6). Errors never echo values back. */
export function registerEnvRoutes(app: Hono, { env, store, insight, servers, db, onChange }: Deps): void {
  const rootOf = (id: string) => {
    const project = store.projectRow(id);
    return project && !project.path.startsWith("team:") ? project.path : undefined;
  };
  const usedKeys = (id: string): EnvKeyUse[] => {
    const latest = insight.latest(id);
    return "apis" in latest && latest.apis ? latest.apis.env : [];
  };
  const links = (id: string) =>
    db.query("SELECT server_id, path FROM project_remote_env WHERE project_id = ?").all(id) as {
      server_id: string;
      path: string;
    }[];
  const fail = (err: unknown) => ({ error: (err as Error).message });
  const record = (projectId: string, file: string, key: string, action: EnvChange["action"]) => {
    db.query("INSERT INTO env_changes (project_id, file, key, action, at) VALUES (?, ?, ?, ?, ?)").run(
      projectId,
      file,
      key,
      action,
      Date.now(),
    );
    onChange?.(projectId, { file, key, action });
  };

  app.get("/api/projects/:id/env", async (c) => {
    const id = c.req.param("id");
    const root = rootOf(id);
    if (!root) return c.json({ error: "Not found" }, 404);
    const remote = await Promise.all(
      links(id).map(async (l) => {
        const path = `ssh:${l.server_id}:${l.path}`;
        try {
          return {
            path,
            text: await servers.readEnvFile(l.server_id, l.path),
            serverId: l.server_id,
            remotePath: l.path,
          };
        } catch (err) {
          return { path, error: (err as Error).message, serverId: l.server_id, remotePath: l.path };
        }
      }),
    );
    return c.json(env.overview(root, usedKeys(id), remote));
  });

  app.post("/api/projects/:id/env/reveal", async (c) => {
    const root = rootOf(c.req.param("id"));
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string };
    if (!root || !body.file || !body.key) return c.json({ error: "Not found" }, 404);
    try {
      const remote = remoteOf(body.file);
      const value = remote
        ? valueIn(await servers.readEnvFile(remote.serverId, remote.path), body.key)
        : env.reveal(root, body.file, body.key);
      return c.json({ value });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.put("/api/projects/:id/env", async (c) => {
    const id = c.req.param("id");
    const root = rootOf(id);
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string; value?: string };
    if (!root || !body.file || !body.key || typeof body.value !== "string")
      return c.json({ error: "Missing file, key or value" }, 400);
    try {
      const remote = remoteOf(body.file);
      let existed: boolean;
      if (remote) {
        const text = await servers.readEnvFile(remote.serverId, remote.path).catch(() => "");
        existed = text.split("\n").some((l) => l.replace(/^\s*export\s+/, "").startsWith(`${body.key}=`));
        await servers.writeEnvFile(remote.serverId, remote.path, setInText(text, body.key, body.value));
      } else {
        existed = env.overview(root, []).keys.some((k) => k.name === body.key && k.values[body.file as string]);
        env.set(root, body.file, body.key, body.value);
      }
      record(id, body.file, body.key, existed ? "changed" : "added");
      return c.json({ ok: true, remote: !!remote });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.delete("/api/projects/:id/env", async (c) => {
    const id = c.req.param("id");
    const root = rootOf(id);
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; key?: string };
    if (!root || !body.file || !body.key) return c.json({ error: "Missing file or key" }, 400);
    try {
      const remote = remoteOf(body.file);
      if (remote)
        await servers.writeEnvFile(
          remote.serverId,
          remote.path,
          removeFromText(await servers.readEnvFile(remote.serverId, remote.path), body.key),
        );
      else env.remove(root, body.file, body.key);
      record(id, body.file, body.key, "removed");
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.get("/api/projects/:id/env/history", async (c) => {
    const root = rootOf(c.req.param("id"));
    const file = c.req.query("file");
    if (!root || !file) return c.json({ error: "Not found" }, 404);
    try {
      const remote = remoteOf(file);
      if (!remote) return c.json(env.history(root, file));
      const backups = await servers.envBackups(remote.serverId, remote.path);
      return c.json(backups.map((b) => ({ ...b, keys: 0 })));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.post("/api/projects/:id/env/restore", async (c) => {
    const id = c.req.param("id");
    const root = rootOf(id);
    const body = (await c.req.json().catch(() => ({}))) as { file?: string; id?: string };
    if (!root || !body.file || !body.id) return c.json({ error: "Missing file or backup" }, 400);
    try {
      const remote = remoteOf(body.file);
      if (remote) await servers.restoreEnvBackup(remote.serverId, remote.path, body.id);
      else env.restore(root, body.file, body.id);
      record(id, body.file, "*", "restored");
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  app.post("/api/projects/:id/env/example", (c) => {
    const root = rootOf(c.req.param("id"));
    if (!root) return c.json({ error: "Not found" }, 404);
    try {
      return c.json(env.syncExample(root, usedKeys(c.req.param("id"))));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });

  // ---- a server's .env linked to this project ----------------------------------------------
  app.get("/api/projects/:id/env/remote", (c) =>
    c.json(links(c.req.param("id")).map((l) => ({ serverId: l.server_id, path: l.path }))),
  );
  app.post("/api/projects/:id/env/remote", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { serverId?: string; path?: string };
    if (!rootOf(id) || !body.serverId || !body.path) return c.json({ error: "Choose a server and a path" }, 400);
    try {
      // Reading it once proves the path is valid and reachable.
      const text = await servers.readEnvFile(body.serverId, body.path);
      db.query("INSERT OR IGNORE INTO project_remote_env (project_id, server_id, path) VALUES (?, ?, ?)").run(
        id,
        body.serverId,
        body.path.trim(),
      );
      return c.json({ ok: true, keys: keyCount(text) });
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/projects/:id/env/remote", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { serverId?: string; path?: string };
    db.query("DELETE FROM project_remote_env WHERE project_id = ? AND server_id = ? AND path = ?").run(
      c.req.param("id"),
      body.serverId ?? "",
      body.path ?? "",
    );
    return c.json({ ok: true });
  });

  // ---- who changed what (names only) -------------------------------------------------------
  app.get("/api/projects/:id/env/changes", (c) =>
    c.json(
      (
        db
          .query(
            "SELECT file, key, action, author_name, at FROM env_changes WHERE project_id = ? ORDER BY at DESC LIMIT 50",
          )
          .all(c.req.param("id")) as {
          file: string;
          key: string;
          action: EnvChange["action"];
          author_name: string | null;
          at: number;
        }[]
      ).map((r) => ({ file: r.file, key: r.key, action: r.action, author: r.author_name ?? undefined, at: r.at })),
    ),
  );
}
