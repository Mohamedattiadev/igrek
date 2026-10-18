import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LibraryHit, LibraryItem, LibraryKind, LibraryStatus } from "@igrek/core";
import type { Bus } from "./bus";
import type { Embed } from "./embedder";
import { EMBED_MODEL } from "./embedder";
import {
  chunk,
  type Extracted,
  extractEpub,
  extractHtml,
  extractPdf,
  extractRepo,
  extractUrl,
  GITHUB_REPO,
  markdownSections,
} from "./extract";

type ItemRow = {
  id: string;
  kind: LibraryKind;
  title: string;
  author: string | null;
  source: string;
  url: string | null;
  persona_ids: string;
  status: LibraryStatus;
  progress: number;
  chunks: number;
  embedded: number;
  error: string | null;
  size: number | null;
  hash: string | null;
  file: string | null;
  uses: number;
  added_at: number;
  published_at: number | null;
};

const KINDS: LibraryKind[] = ["book", "doc", "article", "web", "repo", "note", "example", "news", "lesson"];
/** Shared knowledge every persona may read, whoever the item was added for. */
const FOR_EVERYONE = new Set<LibraryKind>(["example", "lesson"]);
const MAX_FILE = 120 * 1024 * 1024;

export interface AddOptions {
  personaIds?: string[];
  kind?: LibraryKind;
  title?: string;
  author?: string;
}

function toItem(row: ItemRow): LibraryItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    ...(row.author ? { author: row.author } : {}),
    source: row.source,
    ...(row.url ? { url: row.url } : {}),
    personaIds: JSON.parse(row.persona_ids) as string[],
    status: row.status,
    progress: row.progress,
    chunks: row.chunks,
    embedded: !!row.embedded,
    ...(row.error ? { error: row.error } : {}),
    ...(row.size ? { size: row.size } : {}),
    uses: row.uses,
    addedAt: row.added_at,
    ...(row.published_at ? { publishedAt: row.published_at } : {}),
  };
}

/** The title God Eye made up from the file name or address, which the source's own title may replace. */
function autoTitle(row: Pick<ItemRow, "title" | "source" | "url">): boolean {
  if (row.title === row.source.replace(/\.[^.]+$/, "")) return true;
  try {
    const url = new URL(row.url ?? "");
    return row.title === url.hostname + url.pathname;
  } catch {
    return false;
  }
}

/** Words that say nothing about the topic (Turkish and English), left out of the word search. */
const STOP = new Set(
  "a an and are as at be but by can do does for from how i in is it its my of on or should so that the this to was what when where which who why will with you your bir bu şu ve veya ile için gibi ne nasıl neden hangi mı mi mu mü mıdır midir da de ki ama çok daha en olan olarak var yok ben sen biz siz o onlar ise kadar sonra önce her hiç şey".split(
    " ",
  ),
);

/** Words of a question as an FTS query: any of them, each as a phrase (nothing the user types is syntax). */
export function ftsQuery(text: string): string | undefined {
  const words = [
    ...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => !STOP.has(w)).slice(0, 16)),
  ];
  return words.length ? words.map((w) => `"${w}"`).join(" OR ") : undefined;
}

function vecBytes(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

function fromBytes(blob: Uint8Array | null): Float32Array | undefined {
  if (!blob || blob.byteLength !== EMBED_MODEL.dims * 4) return undefined;
  return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));
}

/**
 * The library (plan.md 7.1): books, documents, pages, repos and notes, cut into parts and indexed
 * twice: by words (SQLite FTS5) and by meaning (local vectors, sqlite-vec when it loads). Search
 * fuses both, so a Turkish question still finds the right page of an English book.
 */
export class Library {
  private queue: string[] = [];
  private working = false;
  private vec = false;

  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
    private readonly dir: string,
    private readonly embedder: Embed,
    /** Injectable so tests never touch the network. */
    private readonly clone: (url: string, target: string) => Promise<void> = cloneRepo,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    mkdirSync(join(dir, "files"), { recursive: true });
    try {
      const sqliteVec = require("sqlite-vec") as { load: (db: Database) => void };
      sqliteVec.load(db);
      db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS library_vec USING vec0(embedding float[${EMBED_MODEL.dims}])`);
      this.vec = true;
    } catch {
      // No loadable extensions here (e.g. the system SQLite on macOS): meaning search scans the vectors in memory.
      this.vec = false;
    }
  }

  /** Items cut off by a restart are read again. */
  resume(): void {
    const rows = this.db
      .query("SELECT id FROM library_items WHERE status IN ('queued', 'reading', 'embedding') ORDER BY added_at")
      .all() as { id: string }[];
    for (const row of rows) this.enqueue(row.id);
    void this.embedMissing();
  }

  // ---- items --------------------------------------------------------------------

  list(personaId?: string): LibraryItem[] {
    const rows = this.db.query("SELECT * FROM library_items ORDER BY added_at DESC").all() as ItemRow[];
    const items = rows.map(toItem);
    return personaId ? items.filter((i) => this.allowed(i, personaId)) : items;
  }

  get(id: string): LibraryItem | undefined {
    const row = this.db.query("SELECT * FROM library_items WHERE id = ?").get(id) as ItemRow | undefined;
    return row ? toItem(row) : undefined;
  }

  private allowed(item: Pick<LibraryItem, "kind" | "personaIds">, personaId?: string): boolean {
    return (
      !personaId || FOR_EVERYONE.has(item.kind) || item.personaIds.length === 0 || item.personaIds.includes(personaId)
    );
  }

  update(
    id: string,
    patch: { personaIds?: unknown; title?: unknown; author?: unknown; kind?: unknown },
  ): LibraryItem | undefined {
    if (Array.isArray(patch.personaIds))
      this.db
        .query("UPDATE library_items SET persona_ids = ? WHERE id = ?")
        .run(JSON.stringify(patch.personaIds.filter((x) => typeof x === "string").slice(0, 50)), id);
    if (typeof patch.title === "string" && patch.title.trim())
      this.db.query("UPDATE library_items SET title = ? WHERE id = ?").run(patch.title.trim().slice(0, 300), id);
    if (typeof patch.author === "string")
      this.db
        .query("UPDATE library_items SET author = ? WHERE id = ?")
        .run(patch.author.trim().slice(0, 200) || null, id);
    if (KINDS.includes(patch.kind as LibraryKind))
      this.db.query("UPDATE library_items SET kind = ? WHERE id = ?").run(patch.kind as string, id);
    this.changed();
    return this.get(id);
  }

  remove(id: string): void {
    const row = this.db.query("SELECT file FROM library_items WHERE id = ?").get(id) as
      | { file: string | null }
      | undefined;
    this.dropChunks(id);
    this.db.query("DELETE FROM library_items WHERE id = ?").run(id);
    if (row?.file) rmSync(join(this.dir, row.file), { recursive: true, force: true });
    this.changed();
  }

  private dropChunks(id: string): void {
    const ids = (this.db.query("SELECT id FROM library_chunks WHERE item_id = ?").all(id) as { id: number }[]).map(
      (r) => r.id,
    );
    const delFts = this.db.query("DELETE FROM library_fts WHERE rowid = ?");
    const delVec = this.vec ? this.db.query("DELETE FROM library_vec WHERE rowid = ?") : undefined;
    this.db.transaction(() => {
      for (const cid of ids) {
        delFts.run(cid);
        delVec?.run(cid);
      }
      this.db.query("DELETE FROM library_chunks WHERE item_id = ?").run(id);
    })();
  }

  private insertItem(item: {
    id?: string;
    kind: LibraryKind;
    title: string;
    author?: string;
    source: string;
    url?: string;
    personaIds?: string[];
    file?: string;
    size?: number;
    publishedAt?: number;
    hash?: string;
  }): string {
    const id = item.id ?? crypto.randomUUID().slice(0, 12);
    this.db
      .query(
        `INSERT OR REPLACE INTO library_items (id, kind, title, author, source, url, persona_ids, status, progress, file, size, hash, added_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        item.kind,
        item.title.slice(0, 300),
        item.author?.slice(0, 200) ?? null,
        item.source.slice(0, 1000),
        item.url ?? null,
        JSON.stringify(item.personaIds ?? []),
        item.file ?? null,
        item.size ?? null,
        item.hash ?? null,
        Date.now(),
        item.publishedAt ?? null,
      );
    this.changed();
    return id;
  }

  /** A dropped file: PDF, EPUB, Markdown, text or HTML. */
  addFile(name: string, bytes: Uint8Array, opts: AddOptions = {}): LibraryItem {
    if (bytes.byteLength > MAX_FILE) throw new Error("The file is too big (120 MB at most)");
    const ext = name.toLowerCase().match(/\.(pdf|epub|md|mdx|markdown|txt|html?)$/)?.[1];
    if (!ext) throw new Error("PDF, EPUB, Markdown, text and HTML files can be added");
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const same = this.db.query("SELECT id FROM library_items WHERE hash = ?").get(hash) as { id: string } | undefined;
    if (same) throw new Error("This file is already in the library");
    const id = crypto.randomUUID().slice(0, 12);
    const file = `files/${id}.${ext}`;
    writeFileSync(join(this.dir, file), bytes);
    this.insertItem({
      id,
      kind: opts.kind ?? (ext === "pdf" || ext === "epub" ? "book" : "doc"),
      title: opts.title?.trim() || name.replace(/\.[^.]+$/, ""),
      author: opts.author,
      source: name,
      personaIds: opts.personaIds,
      file,
      size: bytes.byteLength,
      hash,
    });
    this.enqueue(id);
    return this.get(id) as LibraryItem;
  }

  /** A web page, an X post or a GitHub repository. */
  addUrl(url: string, opts: AddOptions = {}): LibraryItem {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only http and https addresses");
    const repo = parsed.toString().match(GITHUB_REPO);
    const id = this.insertItem({
      kind: opts.kind ?? (repo ? "repo" : "web"),
      title: opts.title?.trim() || (repo ? `${repo[1]}/${repo[2]}` : parsed.hostname + parsed.pathname),
      author: opts.author,
      source: parsed.toString(),
      url: parsed.toString(),
      personaIds: opts.personaIds,
      file: repo ? `repos/${crypto.randomUUID().slice(0, 12)}` : undefined,
    });
    this.enqueue(id);
    return this.get(id) as LibraryItem;
  }

  /**
   * Text God Eye writes itself (notes, lessons, news, example projects). Same id again replaces it,
   * and nothing is redone when the text did not change.
   */
  upsertText(args: {
    id: string;
    kind: LibraryKind;
    title: string;
    text: string;
    author?: string;
    url?: string;
    personaIds?: string[];
    publishedAt?: number;
  }): void {
    const hash = createHash("sha256").update(args.title).update(args.text).digest("hex").slice(0, 32);
    const existing = this.db.query("SELECT hash FROM library_items WHERE id = ?").get(args.id) as
      | { hash: string | null }
      | undefined;
    if (existing?.hash === hash) return;
    if (existing) this.dropChunks(args.id);
    const file = `files/${args.id.replace(/[^\w-]/g, "_")}.md`;
    writeFileSync(join(this.dir, file), args.text);
    this.insertItem({ ...args, source: args.url ?? args.kind, file, size: args.text.length, hash });
    this.enqueue(args.id);
  }

  reindex(id: string): void {
    if (!this.get(id)) return;
    this.db.query("UPDATE library_items SET status = 'queued', progress = 0, error = NULL WHERE id = ?").run(id);
    this.enqueue(id);
    this.changed();
  }

  // ---- reading ---------------------------------------------------------------------

  private enqueue(id: string): void {
    if (!this.queue.includes(id)) this.queue.push(id);
    void this.work();
  }

  /** Waits until everything queued is read (tests and the retrospective use it). */
  async idle(): Promise<void> {
    while (this.working || this.queue.length) await Bun.sleep(10);
  }

  private async work(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (let id = this.queue.shift(); id; id = this.queue.shift()) await this.read(id);
    } finally {
      this.working = false;
    }
  }

  private setStatus(id: string, status: LibraryStatus, progress: number, error?: string): void {
    this.db
      .query("UPDATE library_items SET status = ?, progress = ?, error = ? WHERE id = ?")
      .run(status, progress, error ?? null, id);
    this.changed();
  }

  private async extract(row: ItemRow): Promise<Extracted & { url?: string }> {
    if (row.kind === "repo" && row.url && row.file) {
      const target = join(this.dir, row.file);
      if (!existsSync(target)) await this.clone(row.url, target);
      return extractRepo(target);
    }
    if (row.file && existsSync(join(this.dir, row.file))) {
      const path = join(this.dir, row.file);
      const bytes = new Uint8Array(readFileSync(path));
      if (path.endsWith(".pdf")) return extractPdf(bytes);
      if (path.endsWith(".epub")) return extractEpub(bytes);
      const text = new TextDecoder().decode(bytes);
      if (/\.html?$/.test(path)) return extractHtml(text);
      return { sections: markdownSections(text) };
    }
    if (row.url) return extractUrl(row.url, this.fetcher);
    throw new Error("Nothing to read");
  }

  private async read(id: string): Promise<void> {
    const row = this.db.query("SELECT * FROM library_items WHERE id = ?").get(id) as ItemRow | undefined;
    if (!row) return;
    try {
      this.setStatus(id, "reading", 0.05);
      const extracted = await this.extract(row);
      const parts = chunk(extracted.sections).slice(0, 20_000);
      if (parts.length === 0) throw new Error("No readable text was found (a scanned PDF needs OCR first)");
      this.dropChunks(id);
      const insert = this.db.query("INSERT INTO library_chunks (item_id, ord, location, text) VALUES (?, ?, ?, ?)");
      const fts = this.db.query("INSERT INTO library_fts (rowid, text) VALUES (?, ?)");
      this.db.transaction(() => {
        parts.forEach((part, ord) => {
          const result = insert.run(id, ord, part.location ?? null, part.text);
          fts.run(Number(result.lastInsertRowid), part.text);
        });
      })();
      // Use what the source says about itself when the user didn't name it.
      const title = extracted.title && autoTitle(row) ? extracted.title : row.title;
      this.db
        .query(
          "UPDATE library_items SET chunks = ?, embedded = 0, title = ?, author = COALESCE(author, ?), published_at = COALESCE(published_at, ?) WHERE id = ?",
        )
        .run(parts.length, title.slice(0, 300), extracted.author ?? null, extracted.publishedAt ?? null, id);
      this.setStatus(id, "embedding", 0.3);
      await this.embedItem(id);
      this.setStatus(id, "ready", 1);
    } catch (err) {
      this.setStatus(id, "failed", 0, (err as Error).message.slice(0, 400));
    }
  }

  /** Meaning vectors for an item's parts; skipped (words still work) when the model isn't downloaded. */
  private async embedItem(id: string): Promise<void> {
    if (!this.embedder.ready()) return;
    const rows = this.db
      .query("SELECT id, text FROM library_chunks WHERE item_id = ? AND embedding IS NULL ORDER BY ord")
      .all(id) as { id: number; text: string }[];
    const set = this.db.query("UPDATE library_chunks SET embedding = ? WHERE id = ?");
    const vec = this.vec
      ? this.db.query("INSERT OR REPLACE INTO library_vec (rowid, embedding) VALUES (?, ?)")
      : undefined;
    for (let i = 0; i < rows.length; i += 32) {
      const batch = rows.slice(i, i + 32);
      const vectors = await this.embedder.embed(
        batch.map((r) => r.text),
        "passage",
      );
      this.db.transaction(() => {
        batch.forEach((r, j) => {
          const bytes = vecBytes(vectors[j] as Float32Array);
          set.run(bytes, r.id);
          vec?.run(BigInt(r.id), bytes);
        });
      })();
      this.db
        .query("UPDATE library_items SET progress = ? WHERE id = ?")
        .run(0.3 + 0.7 * Math.min(1, (i + batch.length) / rows.length), id);
      this.changed();
    }
    this.db.query("UPDATE library_items SET embedded = 1 WHERE id = ?").run(id);
  }

  /** After the model is downloaded: vectors for everything read before. */
  async embedMissing(): Promise<void> {
    if (!this.embedder.ready()) return;
    const rows = this.db.query("SELECT id FROM library_items WHERE status = 'ready' AND embedded = 0").all() as {
      id: string;
    }[];
    for (const row of rows) {
      try {
        await this.embedItem(row.id);
      } catch {
        // try again next time
      }
    }
    this.changed();
  }

  // ---- search ------------------------------------------------------------------------

  /** Best passages for a question: words and meaning fused (reciprocal rank), at most two per source. */
  async search(
    query: string,
    opts: { personaId?: string; limit?: number; kinds?: LibraryKind[]; markUsed?: boolean } = {},
  ): Promise<LibraryHit[]> {
    const limit = Math.max(1, Math.min(20, opts.limit ?? 5));
    const items = new Map(
      this.list()
        .filter((i) => this.allowed(i, opts.personaId))
        .map((i) => [i.id, i]),
    );
    const usable = (itemId: string) => {
      const item = items.get(itemId);
      return !!item && (!opts.kinds || opts.kinds.includes(item.kind));
    };
    if (!items.size) return [];
    const ranks = new Map<number, number>();
    const add = (ids: number[], weight: number) =>
      ids.forEach((cid, rank) => {
        ranks.set(cid, (ranks.get(cid) ?? 0) + weight / (60 + rank));
      });
    // With meaning vectors, words count less: they can't cross languages.
    const wordWeight = this.embedder.ready() ? 0.6 : 1;
    const fts = ftsQuery(query);
    if (fts) {
      try {
        add(
          (
            this.db
              .query(
                "SELECT rowid AS id FROM library_fts WHERE library_fts MATCH ? ORDER BY bm25(library_fts) LIMIT 80",
              )
              .all(fts) as { id: number }[]
          ).map((r) => r.id),
          wordWeight,
        );
      } catch {
        // a query FTS can't parse: meaning search still runs
      }
    }
    if (this.embedder.ready()) {
      try {
        const [q] = await this.embedder.embed([query], "query");
        if (q) add(this.nearest(q, 80), 1);
      } catch {
        // words only
      }
    }
    if (!ranks.size) return [];
    const get = this.db.query("SELECT id, item_id, location, text FROM library_chunks WHERE id = ?");
    // Notes about your own projects help, but a book on the topic should come first.
    const owner = this.db.query(
      "SELECT i.kind FROM library_chunks c JOIN library_items i ON i.id = c.item_id WHERE c.id = ?",
    );
    for (const [cid, score] of ranks) {
      const kind = (owner.get(cid) as { kind: LibraryKind } | undefined)?.kind;
      if (kind === "example") ranks.set(cid, score * 0.7);
    }
    const ordered = [...ranks.entries()].sort((a, b) => b[1] - a[1]);
    const perItem = new Map<string, number>();
    const hits: LibraryHit[] = [];
    for (const [cid, score] of ordered) {
      if (hits.length >= limit) break;
      const row = get.get(cid) as { id: number; item_id: string; location: string | null; text: string } | undefined;
      if (!row || !usable(row.item_id)) continue;
      const count = perItem.get(row.item_id) ?? 0;
      if (count >= 2) continue;
      perItem.set(row.item_id, count + 1);
      const item = items.get(row.item_id) as LibraryItem;
      hits.push({
        itemId: item.id,
        title: item.title,
        ...(item.author ? { author: item.author } : {}),
        kind: item.kind,
        ...(row.location ? { location: row.location } : {}),
        text: row.text,
        score: Math.round(score * 10_000) / 10_000,
        ...(item.url ? { url: item.url } : {}),
        ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      });
    }
    if (opts.markUsed && hits.length) {
      const bump = this.db.query("UPDATE library_items SET uses = uses + 1 WHERE id = ?");
      for (const id of new Set(hits.map((h) => h.itemId))) bump.run(id);
    }
    return hits;
  }

  /** Closest parts by meaning: sqlite-vec when loaded, otherwise a scan of the stored vectors. */
  private nearest(q: Float32Array, k: number): number[] {
    if (this.vec) {
      try {
        return (
          this.db
            .query("SELECT rowid AS id FROM library_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance")
            .all(vecBytes(q), k) as { id: number }[]
        ).map((r) => Number(r.id));
      } catch {
        // fall through to the scan
      }
    }
    const scored: [number, number][] = [];
    for (const row of this.db
      .query("SELECT id, embedding FROM library_chunks WHERE embedding IS NOT NULL")
      .iterate() as Iterable<{
      id: number;
      embedding: Uint8Array;
    }>) {
      const v = fromBytes(row.embedding);
      if (!v) continue;
      let dot = 0;
      for (let i = 0; i < v.length; i++) dot += (v[i] as number) * (q[i] as number);
      scored.push([row.id, dot]);
    }
    return scored
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id]) => id);
  }

  private changed(): void {
    this.bus.publish({ type: "library-changed" });
  }
}

/** Shallow clone of a public repository (no credentials are ever passed). */
async function cloneRepo(url: string, target: string): Promise<void> {
  if (!GITHUB_REPO.test(url)) throw new Error("Only github.com repositories can be added");
  mkdirSync(join(target, ".."), { recursive: true });
  const proc = Bun.spawn(["git", "clone", "--depth", "1", "--single-branch", "--no-tags", url, target], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
  });
  const timer = setTimeout(() => proc.kill(), 5 * 60_000);
  const code = await proc.exited;
  clearTimeout(timer);
  if (code !== 0) {
    rmSync(target, { recursive: true, force: true });
    throw new Error((await new Response(proc.stderr).text()).trim().slice(0, 300) || "git clone failed");
  }
  rmSync(join(target, ".git"), { recursive: true, force: true });
}
