import type { Database } from "bun:sqlite";
import {
  fillPrivate,
  findPrivateShapes,
  PRIVATE_KINDS,
  PRIVATE_NAME,
  type PrivateKind,
  type PrivateValueInfo,
} from "@igrek/core";
import type { Hono } from "hono";
import type { Sealer } from "./seal";

type Row = { name: string; label: string; kind: string; value: string; created_at: number };

/**
 * The user's private details (core/private.ts): kept sealed in the database, and in memory once
 * opened, so a chat can hide them in a message before it leaves without waiting. The interface only
 * ever gets names and labels; the values go only to the steps that put them back on this computer.
 */
export class PrivateValues {
  private cache = new Map<string, string>();
  readonly ready: Promise<void>;

  constructor(
    private readonly db: Database,
    private readonly sealer: Sealer,
  ) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const rows = this.db.query("SELECT name, value FROM private_values").all() as Pick<Row, "name" | "value">[];
    for (const row of rows) {
      try {
        this.cache.set(row.name, await this.sealer.open(row.value, `private:${row.name}`));
      } catch {
        // Sealed with another key (a data folder from elsewhere): left out until saved again.
      }
    }
  }

  list(): PrivateValueInfo[] {
    return (
      this.db.query("SELECT name, label, kind, created_at FROM private_values ORDER BY label").all() as Omit<
        Row,
        "value"
      >[]
    ).map((r) => ({ name: r.name, label: r.label, kind: r.kind as PrivateKind, createdAt: r.created_at }));
  }

  /** Names with their values, for hiding and filling in on this computer only. */
  values(): { name: string; value: string }[] {
    return [...this.cache].map(([name, value]) => ({ name, value }));
  }

  async save(input: { name?: unknown; label?: unknown; kind?: unknown; value?: unknown }): Promise<PrivateValueInfo[]> {
    const name = typeof input.name === "string" ? input.name.trim().toLowerCase() : "";
    if (!PRIVATE_NAME.test(name)) throw new Error("The short name may use a-z, 0-9 and _ (2 to 40 characters)");
    const label = typeof input.label === "string" ? input.label.trim().slice(0, 80) : "";
    const kind = PRIVATE_KINDS.find((k) => k === input.kind) ?? "other";
    const value = typeof input.value === "string" ? input.value.trim() : "";
    const existing = this.cache.has(name);
    if (!value && !existing) throw new Error("Write the value");
    if (value && value.length < 3) throw new Error("The value is too short to hide reliably");
    if (value.length > 4000) throw new Error("The value is too long");
    const sealed = value ? await this.sealer.seal(value, `private:${name}`) : undefined;
    this.db
      .query(
        `INSERT INTO private_values (name, label, kind, value, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET label = excluded.label, kind = excluded.kind,
           value = CASE WHEN ? THEN excluded.value ELSE private_values.value END`,
      )
      .run(name, label || name, kind, sealed ?? "", Date.now(), sealed ? 1 : 0);
    if (value) this.cache.set(name, value);
    return this.list();
  }

  remove(name: string): PrivateValueInfo[] {
    this.db.query("DELETE FROM private_values WHERE name = ?").run(name);
    this.cache.delete(name);
    return this.list();
  }
}

/** What a "hide here only" names: a kind and a value each, as findPrivateShapes gives them. */
export function cleanFound(found: unknown): { kind: string; value: string }[] {
  if (!Array.isArray(found)) return [];
  return found
    .filter((f): f is { kind: string; value: string } => typeof f?.kind === "string" && typeof f?.value === "string")
    .slice(0, 50)
    .map((f) => ({ kind: f.kind, value: f.value.slice(0, 4000) }));
}

/**
 * The private details from the interface: names and labels to list, the value only when saving,
 * and "fill in" for text the user copies or a form the browser extension fills (on this computer).
 */
export function registerPrivateRoutes(
  app: Hono,
  values: PrivateValues,
  /** What a chat hid for itself only (Chats.onceValues), for text copied from that chat. */
  onceValues: (chatId: string) => { name: string; value: string }[] = () => [],
): void {
  const fail = (err: unknown) => Response.json({ error: (err as Error).message }, { status: 400 });
  app.get("/api/private", async (c) => {
    await values.ready;
    return c.json(values.list());
  });
  app.post("/api/private", async (c) => {
    try {
      await values.ready;
      return c.json(await values.save((await c.req.json().catch(() => ({}))) as Record<string, unknown>));
    } catch (err) {
      return fail(err);
    }
  });
  app.delete("/api/private/:name", (c) => c.json(values.remove(c.req.param("name"))));
  // Identity numbers, IBANs and cards in a message that are not saved yet (saved ones are hidden anyway).
  app.post("/api/private/check", async (c) => {
    await values.ready;
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; chatId?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    // What the chat already hid for itself counts as saved there: it is not asked about again.
    const once = typeof body.chatId === "string" ? onceValues(body.chatId) : [];
    const saved = new Set([...values.values(), ...once].map((v) => v.value.replace(/[\s-]/g, "").toUpperCase()));
    return c.json(findPrivateShapes(text).filter((f) => !saved.has(f.value.replace(/[\s-]/g, "").toUpperCase())));
  });
  app.post("/api/private/fill", async (c) => {
    await values.ready;
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown; chatId?: unknown };
    const once = typeof body.chatId === "string" ? onceValues(body.chatId) : [];
    return c.json({ text: fillPrivate(typeof body.text === "string" ? body.text : "", [...values.values(), ...once]) });
  });
}
