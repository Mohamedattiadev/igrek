import type { Database } from "bun:sqlite";
import type { UiElement, UiNote } from "@igrek/core";
import type { Hono } from "hono";

/**
 * Notes on a part of a screen (plan.md 19.5): pick something in the live preview (or in Igrek
 * itself) and write what is wrong with it, without changing anything yet. A note is a comment
 * with target "ui": the picked element's description is its target, so it reaches teammates
 * end-to-end encrypted like every comment, and a teammate's notes show here too. Notes are sent
 * to a chat one by one or all together; one that was dealt with is closed (on this computer).
 */

/** Only what describes the element, cut to size: it travels to teammates as the comment's target. */
export function cleanElement(value: unknown): UiElement | undefined {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.selector !== "string" || !v.selector.trim() || typeof v.url !== "string") return undefined;
  return {
    url: v.url.slice(0, 300),
    selector: v.selector.slice(0, 300),
    tag: String(v.tag ?? "").slice(0, 30),
    ...(typeof v.text === "string" && v.text.trim() ? { text: v.text.trim().slice(0, 160) } : {}),
    ...(typeof v.source === "string" && v.source ? { source: v.source.slice(0, 200) } : {}),
  };
}

export class UiNotes {
  constructor(private readonly db: Database) {}

  /** The open notes of a project, oldest first; a teammate's arrive as comments and show here alike. */
  list(projectId: string): UiNote[] {
    const rows = this.db
      .query(
        `SELECT id, target_id, author_id, author_name, text, at FROM comments
         WHERE target_kind = 'ui' AND project_id = ? AND deleted = 0 ORDER BY at`,
      )
      .all(projectId) as {
      id: string;
      target_id: string;
      author_id: string | null;
      author_name: string | null;
      text: string;
      at: number;
    }[];
    return rows.flatMap((r) => {
      let element: UiElement | undefined;
      try {
        element = cleanElement(JSON.parse(r.target_id));
      } catch {
        element = undefined;
      }
      return element
        ? [
            {
              id: r.id,
              element,
              text: r.text,
              mine: r.author_id === null,
              at: r.at,
              ...(r.author_name ? { author: r.author_name } : {}),
            },
          ]
        : [];
    });
  }

  add(projectId: string, element: UiElement, text: string, author?: string): string {
    const id = crypto.randomUUID();
    this.db
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read)
         VALUES (?, ?, 'ui', ?, NULL, ?, ?, '[]', ?, 1)`,
      )
      .run(id, projectId, JSON.stringify(element), author ?? null, text.slice(0, 2000), Date.now());
    return id;
  }

  /** Dealt with: it leaves the list here (a teammate keeps theirs until they close it). */
  close(ids: string[]): void {
    this.db
      .query("UPDATE comments SET deleted = 1 WHERE target_kind = 'ui' AND id IN (SELECT value FROM json_each(?))")
      .run(JSON.stringify(ids));
  }
}

export function registerUiNoteRoutes(
  app: Hono,
  notes: UiNotes,
  deps: { author: () => string | undefined; flush: () => void; changed: (projectId: string) => void },
): void {
  app.get("/api/projects/:id/ui-notes", (c) => c.json(notes.list(c.req.param("id"))));

  app.post("/api/projects/:id/ui-notes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { element?: unknown; text?: string };
    const element = cleanElement(body.element);
    const text = (body.text ?? "").trim();
    if (!element || !text) return c.json({ error: "Pick something and write what to change" }, 400);
    const id = notes.add(c.req.param("id"), element, text, deps.author());
    deps.flush();
    deps.changed(c.req.param("id"));
    return c.json({ id });
  });

  app.post("/api/projects/:id/ui-notes/close", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
    notes.close(Array.isArray(body.ids) ? body.ids.map(String) : []);
    deps.changed(c.req.param("id"));
    return c.json({ ok: true });
  });
}
