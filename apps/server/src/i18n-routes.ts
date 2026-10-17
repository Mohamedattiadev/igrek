import type { Hono } from "hono";
import { LanguagePacks } from "./langpacks";
import type { Translator } from "./translator";

/** Language packs, translation corrections, and teammates' notes in your language (plan.md 7.4). */
export function registerI18nRoutes(
  app: Hono,
  packs: LanguagePacks,
  translator: Translator,
  language: () => string,
): void {
  app.post("/api/translate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { texts?: unknown; to?: string; force?: boolean };
    const texts = Array.isArray(body.texts) ? body.texts.filter((t): t is string => typeof t === "string") : [];
    const to = body.to && LanguagePacks.known(body.to) ? body.to : language();
    try {
      return c.json({ to, texts: await translator.translate(texts, to, !!body.force) });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });
  const known = (code: string) => LanguagePacks.known(code);
  app.get("/api/i18n/:code", (c) => {
    const code = c.req.param("code");
    if (!known(code)) return c.json({ error: "Unknown language" }, 404);
    return c.json({ status: packs.status(code), messages: packs.messages(code) });
  });
  app.post("/api/i18n/:code/generate", (c) => {
    const code = c.req.param("code");
    if (!known(code)) return c.json({ error: "Unknown language" }, 404);
    return c.json(packs.generate(code));
  });
  app.get("/api/i18n/:code/rows", (c) => {
    const code = c.req.param("code");
    if (!known(code)) return c.json({ error: "Unknown language" }, 404);
    return c.json(packs.rows(code));
  });
  app.put("/api/i18n/:code/override", async (c) => {
    const code = c.req.param("code");
    if (!known(code)) return c.json({ error: "Unknown language" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { key?: string; text?: string | null };
    try {
      packs.setOverride(code, String(body.key ?? ""), body.text ?? null);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
