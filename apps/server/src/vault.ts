import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { InboxNotice, VaultEntry } from "@igrek/core";
import { type EnvFiles, parse } from "./envfiles";
import type { Sealer } from "./seal";
import type { Store } from "./store";

const DAY = 86_400_000;
/** Keys that look like settings, not secrets, are left out of the vault. */
const SECRETISH =
  /(KEY|SECRET|TOKEN|PASS|PWD|PRIVATE|CREDENTIAL|AUTH|DSN|DATABASE_URL|_URL$|_URI$|WEBHOOK|SALT|SIGNING)/i;
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/**
 * Secret vault (plan.md 12): every key of every project's .env files in one list, plus secrets you
 * keep only here (encrypted with the local key). Values are never listed or sent anywhere; they
 * are compared by hash to show the same key reused in several places, and each key can have a
 * rotation reminder. A .env value that changes resets its clock by itself.
 */
export class Vault {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly env: EnvFiles,
    private readonly sealer: Sealer,
    private readonly now: () => number = Date.now,
  ) {}

  private rotation(
    ref: string,
  ): { every_days: number; last_hash: string | null; changed_at: number | null } | undefined {
    return (
      (this.db.query("SELECT every_days, last_hash, changed_at FROM vault_rotation WHERE ref = ?").get(ref) as {
        every_days: number;
        last_hash: string | null;
        changed_at: number | null;
      } | null) ?? undefined
    );
  }

  /** Remembers the value's hash; a different hash than last time means the key was changed. */
  private seen(ref: string, valueHash: string, fallbackAt: number): number {
    const r = this.rotation(ref);
    if (!r) {
      this.db
        .query("INSERT INTO vault_rotation (ref, every_days, last_hash, changed_at) VALUES (?, 0, ?, ?)")
        .run(ref, valueHash, fallbackAt);
      return fallbackAt;
    }
    if (r.last_hash !== valueHash) {
      const at = this.now();
      this.db.query("UPDATE vault_rotation SET last_hash = ?, changed_at = ? WHERE ref = ?").run(valueHash, at, ref);
      return at;
    }
    return r.changed_at ?? fallbackAt;
  }

  list(): VaultEntry[] {
    const rows: (Omit<VaultEntry, "sameAs" | "due" | "rotateDays"> & { hash: string })[] = [];
    // A folder added as a project can hold other projects: each .env file belongs to the deepest one.
    const owner = new Map<string, { projectId: string; root: string; file: string }>();
    for (const p of this.store.allProjectRows()) {
      if (p.hidden || !existsSync(p.path)) continue;
      for (const file of this.env.list(p.path)) {
        if (/\.(example|sample|template|dist)$/.test(file)) continue;
        const full = join(p.path, file);
        const seen = owner.get(full);
        if (!seen || p.path.length > seen.root.length) owner.set(full, { projectId: p.id, root: p.path, file });
      }
    }
    for (const [full, { projectId, file }] of owner) {
      let text = "";
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const mtime = statSync(full).mtimeMs;
      for (const e of parse(text)) {
        if (!e.key || !e.value || !SECRETISH.test(e.key)) continue;
        const ref = `env:${projectId}:${file}:${e.key}`;
        const h = hash(e.value);
        rows.push({ ref, kind: "env", name: e.key, projectId, file, changedAt: this.seen(ref, h, mtime), hash: h });
      }
    }
    const items = this.db.query("SELECT * FROM vault_items ORDER BY name").all() as {
      id: string;
      name: string;
      value: string;
      note: string | null;
      project_id: string | null;
      changed_at: number;
    }[];
    for (const it of items)
      rows.push({
        ref: `item:${it.id}`,
        kind: "item",
        name: it.name,
        ...(it.project_id ? { projectId: it.project_id } : {}),
        ...(it.note ? { note: it.note } : {}),
        changedAt: it.changed_at,
        // Item values are sealed; their hash is kept beside them in the rotation table.
        hash: this.rotation(`item:${it.id}`)?.last_hash ?? `item-${it.id}`,
      });
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.hash, (counts.get(r.hash) ?? 0) + 1);
    const now = this.now();
    return rows
      .map(({ hash: h, ...r }) => {
        const rotateDays = this.rotation(r.ref)?.every_days ?? 0;
        return {
          ...r,
          rotateDays,
          due: rotateDays > 0 && !!r.changedAt && now - r.changedAt > rotateDays * DAY,
          sameAs: (counts.get(h) ?? 1) - 1,
        };
      })
      .sort((a, b) => Number(b.due) - Number(a.due) || a.name.localeCompare(b.name));
  }

  setRotation(ref: string, days: number): void {
    const every = Math.max(0, Math.min(3650, Math.round(days)));
    this.db
      .query(
        "INSERT INTO vault_rotation (ref, every_days, changed_at) VALUES (?, ?, ?) ON CONFLICT(ref) DO UPDATE SET every_days = excluded.every_days",
      )
      .run(ref, every, this.now());
  }

  /** "I changed it" for a key whose change Igrek can't see (a dashboard-only secret). */
  markRotated(ref: string): void {
    this.db
      .query(
        "INSERT INTO vault_rotation (ref, every_days, changed_at) VALUES (?, 0, ?) ON CONFLICT(ref) DO UPDATE SET changed_at = excluded.changed_at",
      )
      .run(ref, this.now());
    if (ref.startsWith("item:"))
      this.db.query("UPDATE vault_items SET changed_at = ? WHERE id = ?").run(this.now(), ref.slice(5));
  }

  async addItem(input: { name: string; value: string; note?: string; projectId?: string }): Promise<string> {
    const name = input.name.trim().slice(0, 100);
    if (!name || !input.value) throw new Error("Give the secret a name and a value");
    const id = crypto.randomUUID().slice(0, 12);
    this.db
      .query("INSERT INTO vault_items (id, name, value, note, project_id, changed_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        id,
        name,
        await this.sealer.seal(input.value, `vault:${id}`),
        input.note?.slice(0, 300) || null,
        input.projectId || null,
        this.now(),
      );
    this.db
      .query("INSERT INTO vault_rotation (ref, every_days, last_hash, changed_at) VALUES (?, 0, ?, ?)")
      .run(`item:${id}`, hash(input.value), this.now());
    return id;
  }

  async updateItem(id: string, value: string): Promise<void> {
    if (!value) throw new Error("Empty value");
    this.db
      .query("UPDATE vault_items SET value = ?, changed_at = ? WHERE id = ?")
      .run(await this.sealer.seal(value, `vault:${id}`), this.now(), id);
    this.db
      .query("UPDATE vault_rotation SET last_hash = ?, changed_at = ? WHERE ref = ?")
      .run(hash(value), this.now(), `item:${id}`);
  }

  removeItem(id: string): void {
    this.db.transaction(() => {
      this.db.query("DELETE FROM vault_items WHERE id = ?").run(id);
      this.db.query("DELETE FROM vault_rotation WHERE ref = ?").run(`item:${id}`);
    })();
  }

  /** The value, for the reveal button only. .env values are read from the file at that moment. */
  async reveal(ref: string): Promise<string> {
    if (ref.startsWith("item:")) {
      const row = this.db.query("SELECT value FROM vault_items WHERE id = ?").get(ref.slice(5)) as {
        value: string;
      } | null;
      if (!row) throw new Error("Not found");
      return this.sealer.open(row.value, `vault:${ref.slice(5)}`);
    }
    const [, projectId = "", ...rest] = ref.split(":");
    const key = rest.pop() ?? "";
    const file = rest.join(":");
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Not found");
    return this.env.reveal(project.path, file, key);
  }

  notices(): InboxNotice[] {
    return this.list()
      .filter((e) => e.due)
      .slice(0, 10)
      .map((e) => ({
        id: `rotate:${e.ref}:${e.changedAt}`,
        kind: "rotate" as const,
        projectId: e.projectId ?? "",
        projectName: e.projectId ? (this.store.projectRow(e.projectId)?.name ?? "") : "",
        detail: `${e.name}${e.file ? ` · ${e.file}` : ""}`,
        at: (e.changedAt ?? 0) + e.rotateDays * DAY,
        link: "/tools?tab=vault",
      }));
  }
}
