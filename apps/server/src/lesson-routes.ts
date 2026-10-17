import type { Hono } from "hono";
import type { Lessons } from "./lessons";
import type { Personas } from "./personas";
import type { Store } from "./store";

export function registerLessonRoutes(
  app: Hono,
  {
    lessons,
    personas,
    store,
    scan,
  }: { lessons: Lessons; personas: Personas; store: Store; scan: () => Promise<number> },
): void {
  const fail = (err: unknown) =>
    new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  app.get("/api/lessons", (c) =>
    c.json(
      lessons.list({
        projectId: c.req.query("projectId") || undefined,
        q: c.req.query("q") || undefined,
      }),
    ),
  );
  /** For the MCP tool: lessons that fit what the AI is about to do, by working folder. */
  app.get("/api/lessons/relevant", async (c) => {
    const projectId = store.projectForCwd(c.req.query("cwd") ?? "") ?? null;
    return c.json({ context: (await lessons.promptContext(c.req.query("q") ?? "", projectId)) ?? "" });
  });
  app.post("/api/lessons", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const prevent = typeof body.prevent === "string" ? body.prevent.trim() : "";
    if (!title || !prevent) return c.json({ error: "A title and how to avoid it are needed" }, 400);
    return c.json(
      await lessons.add({
        title,
        prevent,
        what: typeof body.what === "string" ? body.what : "",
        why: typeof body.why === "string" ? body.why : "",
        fix: typeof body.fix === "string" ? body.fix : "",
        projectId: typeof body.projectId === "string" && store.projectRow(body.projectId) ? body.projectId : null,
      }),
    );
  });
  app.patch("/api/lessons/:id", async (c) => {
    const lesson = lessons.update(c.req.param("id"), (await c.req.json().catch(() => ({}))) as Record<string, never>);
    return lesson ? c.json(lesson) : c.json({ error: "Not found" }, 404);
  });
  app.delete("/api/lessons/:id", (c) => {
    lessons.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  /** "Make it a rule": a project convention, or one persona's own rule. */
  app.post("/api/lessons/:id/rule", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { target?: unknown };
    const target = typeof body.target === "string" ? body.target : "project";
    try {
      const lesson = lessons.makeRule(c.req.param("id"), target, (personaId, rule) => {
        const persona = personas.get(personaId);
        if (!persona) throw new Error("Persona not found");
        personas.save(
          { ...persona, profile: { ...persona.profile, rules: [...persona.profile.rules, rule].slice(-10) } },
          persona.id,
        );
      });
      return lesson ? c.json(lesson) : c.json({ error: "Not found" }, 404);
    } catch (err) {
      return fail(err);
    }
  });
  /** Look for new mistakes now instead of waiting for the next round. */
  app.post("/api/lessons/scan", async (c) => {
    try {
      return c.json({ written: await scan() });
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/projects/:id/retrospective", async (c) => {
    try {
      return c.json({ id: await lessons.retrospective(c.req.param("id")) });
    } catch (err) {
      return fail(err);
    }
  });
}
