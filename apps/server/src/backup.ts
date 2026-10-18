import type { Database } from "bun:sqlite";
import { APP_VERSION } from "@igrek/core";

/** What a backup holds (plan.md 11): memory, lessons, the library's texts, personas and their notebooks, plans. Never accounts, keys or .env backups. */
const TABLES = [
  "memory_items",
  "lessons",
  "library_items",
  "personas",
  "persona_opinions",
  "schedules",
  "meetings",
  "prompts",
  "ideas",
  "board_tasks",
] as const;

/** Columns that are not worth carrying (vectors are made again on this computer). */
const SKIP_COLUMNS: Record<string, string[]> = { lessons: ["vector"], library_items: ["file"] };

interface BackupData {
  tables: Record<string, Record<string, unknown>[]>;
  /** Library parts: text and where it is, per item. */
  chunks: { item_id: string; ord: number; location: string | null; text: string }[];
}

export interface BackupFile {
  format: "godeye-backup";
  version: 1;
  app: string;
  at: number;
  encrypted: boolean;
  /** Base64 when encrypted (AES-256-GCM, key from the password with PBKDF2-SHA256), the data itself otherwise. */
  data: string | BackupData;
  salt?: string;
  iv?: string;
}

const ITERATIONS = 310_000;
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

async function keyFrom(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function columns(db: Database, table: string): string[] {
  return (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

/**
 * Backup and export (plan.md 11): one file with everything God Eye learned about your work,
 * optionally locked with a password. Restoring adds what is missing and never overwrites.
 */
export class Backups {
  constructor(private readonly db: Database) {}

  private collect(): BackupData {
    const tables: BackupData["tables"] = {};
    for (const table of TABLES) {
      const cols = columns(this.db, table).filter((c) => !(SKIP_COLUMNS[table] ?? []).includes(c));
      if (!cols.length) continue;
      tables[table] = this.db.query(`SELECT ${cols.join(", ")} FROM ${table}`).all() as Record<string, unknown>[];
    }
    const chunks = this.db
      .query("SELECT item_id, ord, location, text FROM library_chunks ORDER BY item_id, ord")
      .all() as BackupData["chunks"];
    return { tables, chunks };
  }

  async export(password?: string): Promise<BackupFile> {
    const data = this.collect();
    const base = { format: "godeye-backup" as const, version: 1 as const, app: APP_VERSION, at: Date.now() };
    if (!password) return { ...base, encrypted: false, data };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await keyFrom(password, salt),
      new TextEncoder().encode(JSON.stringify(data)),
    );
    return { ...base, encrypted: true, data: b64(new Uint8Array(sealed)), salt: b64(salt), iv: b64(iv) };
  }

  async open(file: BackupFile, password?: string): Promise<BackupData> {
    if (file?.format !== "godeye-backup") throw new Error("This is not a God Eye backup");
    if (!file.encrypted) return file.data as BackupData;
    if (!password) throw new Error("This backup is locked with a password");
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(file.iv ?? "") as unknown as BufferSource },
        await keyFrom(password, unb64(file.salt ?? "")),
        unb64(file.data as string) as unknown as BufferSource,
      );
      return JSON.parse(new TextDecoder().decode(plain)) as BackupData;
    } catch {
      throw new Error("Wrong password, or the file is damaged");
    }
  }

  /** Adds what this computer doesn't have yet; returns how many rows were added per table. */
  async restore(file: BackupFile, password?: string): Promise<Record<string, number>> {
    const data = await this.open(file, password);
    const added: Record<string, number> = {};
    const newItems = new Set<string>();
    this.db.transaction(() => {
      for (const table of TABLES) {
        const rows = data.tables[table] ?? [];
        const have = new Set(columns(this.db, table));
        let n = 0;
        for (const row of rows) {
          const cols = Object.keys(row).filter((c) => have.has(c));
          if (!cols.length) continue;
          const result = this.db
            .query(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
            .run(...cols.map((c) => row[c] as string | number | null));
          n += result.changes;
          if (table === "library_items" && result.changes) newItems.add(String(row.id));
        }
        added[table] = n;
      }
      // Library parts only for items that are new here; their meaning vectors are made again later.
      const chunk = this.db.query("INSERT INTO library_chunks (item_id, ord, location, text) VALUES (?, ?, ?, ?)");
      const fts = this.db.query("INSERT INTO library_fts (rowid, text) VALUES (?, ?)");
      let parts = 0;
      for (const c of data.chunks ?? []) {
        if (!newItems.has(c.item_id)) continue;
        const r = chunk.run(c.item_id, c.ord, c.location, c.text);
        fts.run(Number(r.lastInsertRowid), c.text);
        parts++;
      }
      for (const id of newItems)
        this.db.query("UPDATE library_items SET embedded = 0, status = 'ready' WHERE id = ?").run(id);
      added.library_chunks = parts;
    })();
    return added;
  }
}
