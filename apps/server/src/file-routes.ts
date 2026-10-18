import type { Database } from "bun:sqlite";
import { basename, extname, join } from "node:path";
import type { Hono } from "hono";
import { gitBlame, gitBranches, gitChanges, gitCommit, gitShowHead, gitSwitch, gitWorktrees } from "./adapters/git";
import { checkpointChanges, createCheckpoint, listCheckpoints, restoreCheckpoint } from "./checkpoints";
import { FileAccessError, type Files } from "./files";
import type { Store } from "./store";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

type Ctx = { req: { query: (k: string) => string | undefined }; json: (body: unknown, status?: number) => Response };

/** Turns FileAccessError into a clean JSON error with the right status. */
async function guard(c: Ctx, run: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    return c.json(await run());
  } catch (err) {
    if (err instanceof FileAccessError) return c.json({ error: err.message }, err.status);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return c.json({ error: "Not found" }, 404);
    if (code === "EACCES" || code === "EPERM") return c.json({ error: "No permission" }, 403);
    return c.json({ error: (err as Error).message }, 500);
  }
}

/** File manager, code editor and previewer API (plan.md 2.3, 2.4, 2.9). */
export function registerFileRoutes(
  app: Hono,
  {
    files,
    store,
    db,
    onRestore,
    busy,
  }: {
    files: Files;
    store: Store;
    db: Database;
    /** A checkpoint was restored: the AI's work since then was undone (a lesson candidate). */
    onRestore?: (projectId: string, checkpointId: string, files: string[]) => void;
    /** An AI is working in the project right now; restoring under it would mix the two. */
    busy?: (projectId: string) => boolean;
  },
): void {
  app.get("/api/fs/list", (c) => guard(c, () => files.list(c.req.query("path") ?? "", c.req.query("hidden") === "1")));
  app.get("/api/fs/read", (c) => guard(c, () => files.read(c.req.query("path") ?? "")));
  // The end of a (possibly huge) log file, for live following.
  app.get("/api/fs/tail", (c) =>
    guard(c, async () => {
      const path = files.resolve(c.req.query("path") ?? "");
      const bytes = Math.min(1_000_000, Math.max(1000, Number(c.req.query("bytes") ?? 200_000)));
      const file = Bun.file(path);
      const size = file.size;
      const text = await file.slice(Math.max(0, size - bytes), size).text();
      return { text: size > bytes ? text.slice(text.indexOf("\n") + 1) : text, size };
    }),
  );

  // Raw bytes for previews and downloads. Sandboxed so an HTML/SVG file from a repo
  // can never run scripts with access to God Eye.
  app.get("/api/fs/raw", (c) => {
    try {
      const path = files.resolve(c.req.query("path") ?? "");
      const ext = extname(path).slice(1).toLowerCase();
      const download = c.req.query("download") === "1";
      return new Response(Bun.file(path), {
        headers: {
          "content-type": MIME[ext] ?? (files.isText(path) ? "text/plain; charset=utf-8" : "application/octet-stream"),
          "content-security-policy":
            "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'",
          "x-content-type-options": "nosniff",
          ...(download
            ? { "content-disposition": `attachment; filename="${encodeURIComponent(basename(path))}"` }
            : {}),
        },
      });
    } catch (err) {
      const status = err instanceof FileAccessError ? err.status : 404;
      return c.json({ error: (err as Error).message }, status);
    }
  });

  app.put("/api/fs/write", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string; content?: string; expectedMtime?: number };
    return guard(c, () => files.write(body.path ?? "", String(body.content ?? ""), body.expectedMtime));
  });
  app.post("/api/fs/mkdir", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string };
    return guard(c, () => files.mkdir(body.path ?? ""));
  });
  app.post("/api/fs/rename", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
    return guard(c, () => files.rename(body.from ?? "", body.to ?? ""));
  });
  app.post("/api/fs/copy", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { from?: string; to?: string };
    return guard(c, () => files.copy(body.from ?? "", body.to ?? ""));
  });
  app.post("/api/fs/trash", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string };
    return guard(c, () => files.trash(body.path ?? ""));
  });
  app.get("/api/fs/trash", (c) => guard(c, () => files.listTrash()));
  app.post("/api/fs/restore", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: string };
    return guard(c, () => files.restore(body.id ?? ""));
  });
  app.post("/api/fs/upload", async (c) => {
    const dir = c.req.query("dir") ?? "";
    const form = await c.req.formData().catch(() => undefined);
    return guard(c, async () => {
      const saved = [];
      for (const value of form?.getAll("files") ?? []) {
        if (typeof value === "string") continue;
        saved.push(files.writeBytes(join(dir, basename(value.name)), new Uint8Array(await value.arrayBuffer())));
      }
      return saved;
    });
  });
  app.get("/api/fs/search", (c) =>
    guard(c, () => files.search(c.req.query("root") ?? "", c.req.query("q") ?? "", c.req.query("content") === "1")),
  );
  app.get("/api/fs/usage", (c) => guard(c, () => files.usage(c.req.query("path") ?? "")));

  // Git panel for a project.
  app.get("/api/projects/:id/git/changes", (c) => {
    const row = store.projectRow(c.req.param("id"));
    return row ? c.json(gitChanges(row.path)) : c.json({ error: "Project not found" }, 404);
  });
  app.get("/api/projects/:id/git/diff", async (c) => {
    const row = store.projectRow(c.req.param("id"));
    const path = c.req.query("path") ?? "";
    if (!row || !path || path.includes("..")) return c.json({ error: "Not found" }, 404);
    return guard(c, () => {
      const full = files.resolve(join(row.path, path));
      const current = files.read(full);
      return {
        original: gitShowHead(row.path, path),
        modified: current.content ?? "",
        binary: current.kind === "binary",
      };
    });
  });
  app.get("/api/projects/:id/checkpoints", (c) => {
    const row = store.projectRow(c.req.param("id"));
    return row ? c.json(listCheckpoints(row.path)) : c.json({ error: "Project not found" }, 404);
  });
  app.post("/api/projects/:id/checkpoints", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const checkpoint = createCheckpoint(row.path, "manual");
    return checkpoint ? c.json(checkpoint) : c.json({ error: "This folder is not a git repository" }, 409);
  });
  app.get("/api/projects/:id/checkpoints/:cid/changes", (c) => {
    const row = store.projectRow(c.req.param("id"));
    return row ? c.json(checkpointChanges(row.path, c.req.param("cid"))) : c.json({ error: "Project not found" }, 404);
  });
  app.post("/api/projects/:id/checkpoints/:cid/restore", (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    if (busy?.(row.id)) return c.json({ error: "An AI chat is working in this project; stop it first" }, 409);
    const changed = (() => {
      try {
        return checkpointChanges(row.path, c.req.param("cid"));
      } catch {
        return [];
      }
    })();
    const result = restoreCheckpoint(row.path, c.req.param("cid"));
    if (result.ok) onRestore?.(row.id, c.req.param("cid"), changed);
    return result.ok ? c.json(result) : c.json({ error: result.error }, 409);
  });

  app.get("/api/projects/:id/git/branches", (c) => {
    const row = store.projectRow(c.req.param("id"));
    return row
      ? c.json({ branches: gitBranches(row.path), worktrees: gitWorktrees(row.path) })
      : c.json({ error: "Project not found" }, 404);
  });
  app.post("/api/projects/:id/git/switch", async (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { branch?: string; create?: boolean };
    const result = gitSwitch(row.path, (body.branch ?? "").trim(), body.create === true);
    return result.ok ? c.json(result) : c.json({ error: result.output }, 409);
  });

  /**
   * "AI blame" (plan.md 2.3): git blame per line, plus the session that most
   * likely wrote it — one that edited this file around the commit's time.
   */
  app.get("/api/projects/:id/git/blame", (c) => {
    const row = store.projectRow(c.req.param("id"));
    const path = c.req.query("path") ?? "";
    if (!row || !path || path.includes("..")) return c.json({ error: "Not found" }, 404);
    const rel = path.startsWith(`${row.path}/`) ? path.slice(row.path.length + 1) : path;
    const full = join(row.path, rel);
    const sessions = (
      db
        .query(
          "SELECT id, title, tool, started_at, updated_at, files_touched, author_name FROM sessions WHERE project_id = ? AND files_touched LIKE ?",
        )
        .all(row.id, `%${rel.split("/").pop()}%`) as {
        id: string;
        title: string | null;
        tool: string;
        started_at: number;
        updated_at: number;
        files_touched: string;
        author_name: string | null;
      }[]
    ).filter((s) => (JSON.parse(s.files_touched) as string[]).some((f) => f === full || f.endsWith(`/${rel}`)));
    const sessionFor = (at: number, uncommitted: boolean) =>
      sessions
        .filter((s) => (uncommitted ? true : s.started_at <= at + 10 * 60_000 && s.updated_at >= at - 6 * 3600_000))
        .sort((a, b) => Math.abs(a.updated_at - at) - Math.abs(b.updated_at - at))[0];
    const lines = gitBlame(row.path, rel).map((l) => {
      const uncommitted = /^0+$/.test(l.hash);
      const s = sessionFor(uncommitted ? Date.now() : l.at, uncommitted);
      return {
        line: l.line,
        hash: uncommitted ? "" : l.hash.slice(0, 7),
        author: uncommitted ? "" : l.author,
        at: l.at,
        summary: l.summary,
        session: s
          ? { id: s.id, title: s.title ?? s.id.slice(0, 8), tool: s.tool, author: s.author_name ?? undefined }
          : undefined,
      };
    });
    return c.json(lines);
  });

  /** Find and replace across the project: preview first, then apply after a snapshot (so it can be undone). */
  app.post("/api/projects/:id/replace", async (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      find?: string;
      replace?: string;
      regex?: boolean;
      caseSensitive?: boolean;
      paths?: string[];
      apply?: boolean;
    };
    if (!body.find) return c.json({ error: "Type what to find" }, 400);
    let pattern: RegExp;
    try {
      pattern = new RegExp(
        body.regex ? body.find : body.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        body.caseSensitive ? "g" : "gi",
      );
    } catch {
      return c.json({ error: "That isn't a valid regular expression" }, 400);
    }
    const listed = Bun.spawnSync(
      ["git", "-C", row.path, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { stdout: "pipe" },
    );
    const candidates = listed.exitCode === 0 ? listed.stdout.toString().split("\0").filter(Boolean) : [];
    const chosen = body.paths?.length ? candidates.filter((p) => body.paths?.includes(p)) : candidates;
    const results: { path: string; count: number; samples: { line: number; before: string; after: string }[] }[] = [];
    for (const rel of chosen.slice(0, 5000)) {
      if (/(^|\/)\.env(\.|$)|\.(pem|key|lock|lockb|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?)$/i.test(rel)) continue;
      const full = join(row.path, rel);
      let text: string;
      try {
        const file = Bun.file(full);
        if (file.size > 2_000_000) continue;
        text = await file.text();
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;
      pattern.lastIndex = 0;
      const count = text.match(pattern)?.length ?? 0;
      if (!count) continue;
      const samples: { line: number; before: string; after: string }[] = [];
      text.split("\n").forEach((line, i) => {
        if (samples.length < 3 && new RegExp(pattern.source, pattern.flags.replace("g", "")).test(line))
          samples.push({
            line: i + 1,
            before: line.trim().slice(0, 160),
            after: line
              .replace(pattern, body.replace ?? "")
              .trim()
              .slice(0, 160),
          });
      });
      results.push({ path: rel, count, samples });
    }
    if (!body.apply) return c.json({ files: results.slice(0, 300), total: results.reduce((n, r) => n + r.count, 0) });
    const checkpoint = createCheckpoint(row.path, `before replace "${body.find.slice(0, 40)}"`);
    for (const r of results) {
      const full = join(row.path, r.path);
      const text = await Bun.file(full).text();
      await Bun.write(full, text.replace(pattern, body.replace ?? ""));
    }
    return c.json({
      files: results.length,
      total: results.reduce((n, r) => n + r.count, 0),
      checkpoint: checkpoint?.id,
    });
  });

  app.post("/api/projects/:id/git/commit", async (c) => {
    const row = store.projectRow(c.req.param("id"));
    if (!row) return c.json({ error: "Project not found" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { message?: string; files?: string[] };
    const message = body.message?.trim();
    if (!message) return c.json({ error: "Write a commit message" }, 400);
    const result = gitCommit(
      row.path,
      message,
      Array.isArray(body.files) ? body.files.filter((f) => !f.includes("..")) : undefined,
    );
    return result.ok ? c.json({ ok: true, output: result.output }) : c.json({ error: result.output }, 409);
  });
}
