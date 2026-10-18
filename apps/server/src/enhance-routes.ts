import type { AiTool } from "@godeye/core";
import type { Hono } from "hono";
import type { EnhanceRequest, Enhancer } from "./enhance";

const KINDS = ["memory", "session", "git", "file", "error", "log", "team"] as const;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Prompt enhancer (plan.md Faz 4.5). */
export function registerEnhanceRoutes(app: Hono, enhancer: Enhancer): void {
  app.post("/api/enhance", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = str(body.text, 4000)?.trim();
    if (!text) return c.json({ error: "Write something first" }, 400);
    const file = body.file && typeof body.file === "object" ? (body.file as Record<string, unknown>) : undefined;
    const req: EnhanceRequest = {
      text,
      projectId: str(body.projectId, 64),
      sessionId: str(body.sessionId, 128),
      tool: body.tool === "codex" ? "codex" : ("claude" as AiTool),
      template: body.template === true,
      personaId: str(body.personaId, 64),
      file:
        file && typeof file.path === "string"
          ? {
              path: file.path.slice(0, 1000),
              selection: str(file.selection, 6000),
              startLine: typeof file.startLine === "number" ? file.startLine : undefined,
              endLine: typeof file.endLine === "number" ? file.endLine : undefined,
            }
          : undefined,
      answers: Array.isArray(body.answers)
        ? (body.answers as { question?: unknown; answer?: unknown }[])
            .filter((a) => typeof a.question === "string" && typeof a.answer === "string")
            .slice(0, 6)
            .map((a) => ({ question: String(a.question).slice(0, 300), answer: String(a.answer).slice(0, 300) }))
        : undefined,
      exclude: Array.isArray(body.exclude) ? KINDS.filter((k) => (body.exclude as unknown[]).includes(k)) : undefined,
    };
    return c.json(await enhancer.enhance(req));
  });

  app.get("/api/enhance/stats", (c) => c.json(enhancer.stats()));

  app.post("/api/enhance/:id/used", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { choice?: string; final?: string; sessionId?: string };
    const choice =
      body.choice === "enhanced" || body.choice === "edited" || body.choice === "original" ? body.choice : undefined;
    if (!choice) return c.json({ error: "Unknown choice" }, 400);
    enhancer.record(c.req.param("id"), choice, str(body.final, 20_000), str(body.sessionId, 128));
    return c.json({ ok: true });
  });
}
