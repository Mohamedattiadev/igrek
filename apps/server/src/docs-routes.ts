import type { SceneElement } from "@igrek/core";
import type { Hono } from "hono";
import type { Docs } from "./docs";

const fail = (err: unknown) => ({ error: (err as Error).message });

export function registerDocsRoutes(app: Hono, docs: Docs, projectForCwd: (cwd: string) => string | undefined): void {
  app.get("/api/agent/wiki", (c) => {
    const projectId = projectForCwd(c.req.query("cwd") ?? "");
    return c.json(projectId ? docs.search(projectId, c.req.query("q") ?? "") : []);
  });
  app.get("/api/projects/:id/wiki", (c) => c.json(docs.pages(c.req.param("id"))));
  app.post("/api/projects/:id/wiki", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: string; title?: string; body?: string };
    try {
      return c.json(
        docs.savePage(c.req.param("id"), {
          id: body.id,
          title: String(body.title ?? ""),
          body: String(body.body ?? ""),
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/wiki/:id", (c) => {
    docs.removePage(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.get("/api/wiki/:id/context", (c) => c.json(docs.context(c.req.param("id"))));

  app.get("/api/projects/:id/boards", (c) =>
    c.json(docs.boards(c.req.param("id"), c.req.query("category") || undefined)),
  );
  app.post("/api/projects/:id/boards", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { title?: string; category?: string };
    try {
      return c.json(
        docs.createBoard(c.req.param("id"), { title: String(body.title ?? ""), category: body.category || undefined }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.get("/api/boards/:id", (c) => {
    try {
      return c.json(docs.board(c.req.param("id")));
    } catch (err) {
      return c.json(fail(err), 404);
    }
  });
  app.put("/api/boards/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { scene?: string; title?: string; category?: string | null };
    try {
      return c.json(docs.saveBoard(c.req.param("id"), body));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.delete("/api/boards/:id", (c) => {
    try {
      docs.removeBoard(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return c.json(fail(err), 404);
    }
  });
  app.get("/api/boards/:id/versions", (c) => c.json(docs.versions(c.req.param("id"))));
  app.post("/api/boards/:id/versions/:version/restore", (c) => {
    try {
      return c.json(docs.restoreVersion(c.req.param("id"), c.req.param("version")));
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/boards/:id/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      mode?: string;
      png?: string;
      language?: string;
      question?: string;
      elements?: unknown[];
    };
    const mode = ["explain", "missing", "code", "tidy", "question"].includes(String(body.mode)) ? body.mode : "explain";
    const png =
      typeof body.png === "string" && body.png.length < 12_000_000
        ? body.png.replace(/^data:image\/png;base64,/, "")
        : undefined;
    try {
      return c.json(
        await docs.askBoard(
          c.req.param("id"),
          mode as "explain",
          png,
          String(body.language ?? "en"),
          body.question,
          Array.isArray(body.elements) ? (body.elements.slice(0, 5000) as SceneElement[]) : undefined,
        ),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
  app.post("/api/projects/:id/draw", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      what?: string;
      connectionId?: string;
      prompt?: string;
      language?: string;
    };
    const what = ["schema", "architecture", "flow"].includes(String(body.what)) ? body.what : "architecture";
    try {
      return c.json(
        await docs.draw(c.req.param("id"), what as "schema", {
          connectionId: body.connectionId,
          prompt: body.prompt,
          language: String(body.language ?? "en"),
        }),
      );
    } catch (err) {
      return c.json(fail(err), 400);
    }
  });
}
