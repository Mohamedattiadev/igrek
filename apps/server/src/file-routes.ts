import { basename, extname, join } from "node:path";
import type { Hono } from "hono";
import { gitChanges, gitCommit, gitShowHead } from "./adapters/git";
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
export function registerFileRoutes(app: Hono, { files, store }: { files: Files; store: Store }): void {
  app.get("/api/fs/list", (c) => guard(c, () => files.list(c.req.query("path") ?? "", c.req.query("hidden") === "1")));
  app.get("/api/fs/read", (c) => guard(c, () => files.read(c.req.query("path") ?? "")));

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
