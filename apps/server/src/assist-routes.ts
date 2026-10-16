import type { Hono } from "hono";
import type { Assist } from "./assist";

export function registerAssistRoutes(app: Hono, assist: Assist): void {
  app.post("/api/quick-ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      question?: unknown;
      projectId?: unknown;
      sessionId?: unknown;
      mode?: unknown;
      history?: unknown;
      attachment?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return c.json({ error: "Ask something" }, 400);
    const history = Array.isArray(body.history)
      ? (body.history as { q?: unknown; a?: unknown }[])
          .filter((h) => typeof h.q === "string" && typeof h.a === "string")
          .map((h) => ({ q: String(h.q), a: String(h.a) }))
      : undefined;
    const attachment =
      body.attachment && typeof body.attachment === "object"
        ? (body.attachment as { name?: unknown; text?: unknown })
        : undefined;
    try {
      return c.json(
        await assist.quickAsk({
          question: question.slice(0, 2000),
          projectId: typeof body.projectId === "string" ? body.projectId : undefined,
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          mode: body.mode === "full" ? "full" : "quick",
          history,
          attachment:
            attachment && typeof attachment.name === "string" && typeof attachment.text === "string"
              ? { name: attachment.name, text: attachment.text }
              : undefined,
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.get("/api/ideas", (c) => c.json(assist.listIdeas()));
  app.post("/api/ideas", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; projectId?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "Write the idea" }, 400);
    return c.json(assist.addIdea(text.slice(0, 2000), typeof body.projectId === "string" ? body.projectId : undefined));
  });
  app.patch("/api/ideas/:id", async (c) => {
    assist.updateIdea(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, unknown>);
    return c.json({ ok: true });
  });
  app.delete("/api/ideas/:id", (c) => {
    assist.deleteIdea(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/ideas/triage", async (c) => {
    try {
      return c.json(await assist.triageIdeas());
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  app.get("/api/prompts", (c) => c.json(assist.listPrompts()));
  app.post("/api/prompts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      id?: unknown;
      title?: unknown;
      body?: unknown;
      tags?: unknown;
    };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!title || !text) return c.json({ error: "Title and text are required" }, 400);
    return c.json(
      assist.savePrompt({
        id: typeof body.id === "string" ? body.id : undefined,
        title: title.slice(0, 120),
        body: text.slice(0, 20_000),
        tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [],
      }),
    );
  });
  app.post("/api/prompts/:id/use", (c) => {
    assist.usePrompt(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.delete("/api/prompts/:id", (c) => {
    assist.deletePrompt(c.req.param("id"));
    return c.json({ ok: true });
  });
}
