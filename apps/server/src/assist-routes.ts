import { fillPrivate, hidePrivate, namesForOnce, PRIVATE_HINT } from "@igrek/core";
import type { Hono } from "hono";
import type { Assist } from "./assist";
import { cleanFound, type PrivateValues } from "./private-values";

/**
 * A quick question hides the user's private details itself, as a chat does (chats.ts deliver), so
 * they stay here even with the privacy gateway off; the answer gets the real values back.
 */
function privately(values: { name: string; value: string }[]) {
  let hidden = false;
  const hide = (text: string) => {
    const r = hidePrivate(text, values);
    if (r.hidden.length) hidden = true;
    return r.text;
  };
  return { hide, hint: () => (hidden ? `\n\n${PRIVATE_HINT}` : "") };
}

type QuickBody = {
  question?: unknown;
  projectId?: unknown;
  sessionId?: unknown;
  mode?: unknown;
  history?: unknown;
  attachment?: unknown;
  /** Found in the question and hidden for it only, not saved ("hide here only"). */
  hideOnce?: unknown;
};

/** A quick question as Assist takes it, with the private details hidden (privately). */
function quickArgs(body: QuickBody, question: string, values: { name: string; value: string }[]) {
  const { hide, hint } = privately(values);
  const history = Array.isArray(body.history)
    ? (body.history as { q?: unknown; a?: unknown }[])
        .filter((h) => typeof h.q === "string" && typeof h.a === "string")
        .map((h) => ({ q: hide(String(h.q)), a: hide(String(h.a)) }))
    : undefined;
  const attachment =
    body.attachment && typeof body.attachment === "object"
      ? (body.attachment as { name?: unknown; text?: unknown })
      : undefined;
  const asked = hide(question.slice(0, 2000));
  const file =
    attachment && typeof attachment.name === "string" && typeof attachment.text === "string"
      ? { name: attachment.name, text: hide(attachment.text) }
      : undefined;
  return {
    question: asked + hint(),
    projectId: typeof body.projectId === "string" ? body.projectId : undefined,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    mode: body.mode === "full" ? ("full" as const) : ("quick" as const),
    history,
    attachment: file,
  };
}

export function registerAssistRoutes(app: Hono, assist: Assist, privacy?: PrivateValues): void {
  app.post("/api/quick-ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as QuickBody;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return c.json({ error: "Ask something" }, 400);
    await privacy?.ready;
    const saved = privacy?.values() ?? [];
    const values = [...saved, ...namesForOnce(cleanFound(body.hideOnce), saved)];
    try {
      const result = await assist.quickAsk(quickArgs(body, question, values));
      return c.json({ ...result, answer: fillPrivate(result.answer, values) });
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
