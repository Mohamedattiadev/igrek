import type { Database } from "bun:sqlite";
import {
  type Board,
  type BoardVersion,
  describeScene,
  mermaidFrom,
  type SceneElement,
  sceneText,
  schemaFlowchart,
  slugify,
  type WikiPage,
  wikiLinks,
} from "@igrek/core";
import type { Bus } from "./bus";
import type { Databases } from "./databases";
import type { Store } from "./store";
import { mergeText, saveText } from "./ydoc";

/** A new version is kept when the last one is older than this, or the board changed a lot. */
const VERSION_EVERY = 10 * 60_000;
const MAX_VERSIONS = 50;
const MAX_SCENE = 8 * 1024 * 1024;

type Ask = (prompt: string, images: { mediaType: string; data: string }[]) => Promise<string>;

interface PageRow {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  body: string;
  /** The page's Yjs state (base64); null for pages last written before pages merged. */
  ydoc: string | null;
  updated_at: number;
  author_name: string | null;
}

interface BoardRow {
  id: string;
  project_id: string;
  category: string | null;
  title: string;
  scene: string;
  updated_at: number;
  author_name: string | null;
}

function elementCount(scene: string): number {
  try {
    return ((JSON.parse(scene) as { elements?: { isDeleted?: boolean }[] }).elements ?? []).filter((e) => !e.isDeleted)
      .length;
  } catch {
    return 0;
  }
}

/** Words worth matching memory with: no short or common ones. */
function keywords(text: string): string[] {
  const stop = new Set(
    "the and for with that this from into have will your what when where which bir ile için olan gibi daha veya ama çok".split(
      " ",
    ),
  );
  const words = text.toLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) if (!stop.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);
}

/**
 * Project wiki and whiteboards (plan.md 12). Pages are Markdown with [[links]] and Mermaid
 * diagrams; boards are Excalidraw scenes with a version history. Both are linked to memory and
 * shared with the team like memory (end to end encrypted). The AI reads a board as structure and
 * picture together, and can draw on it (Mermaid that becomes editable boxes and arrows).
 */
export class Docs {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly databases: Databases,
    private readonly ask: Ask,
    private readonly me: () => string | undefined = () => undefined,
  ) {}

  private changed(projectId: string): void {
    this.bus.publish({ type: "docs-changed", projectId });
  }

  // ---- wiki ---------------------------------------------------------------------------------

  private toPage(r: PageRow): WikiPage {
    return {
      id: r.id,
      projectId: r.project_id,
      slug: r.slug,
      title: r.title,
      body: r.body,
      updatedAt: r.updated_at,
      ...(r.author_name ? { author: r.author_name } : {}),
    };
  }

  pages(projectId: string): WikiPage[] {
    return (
      this.db
        .query("SELECT * FROM wiki_pages WHERE project_id = ? AND deleted = 0 ORDER BY title COLLATE NOCASE")
        .all(projectId) as PageRow[]
    ).map((r) => this.toPage(r));
  }

  page(id: string): WikiPage | undefined {
    const r = this.db.query("SELECT * FROM wiki_pages WHERE id = ? AND deleted = 0").get(id) as PageRow | null;
    return r ? this.toPage(r) : undefined;
  }

  savePage(projectId: string, input: { id?: string; title: string; body: string }): WikiPage {
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new Error("Give the page a title");
    if (input.body.length > 500_000) throw new Error("The page is too long");
    const slug = slugify(title);
    const clash = this.db
      .query("SELECT id FROM wiki_pages WHERE project_id = ? AND slug = ? AND deleted = 0 AND id != ?")
      .get(projectId, slug, input.id ?? "") as { id: string } | null;
    if (clash) throw new Error("A page with this title already exists");
    const id = input.id ?? crypto.randomUUID().slice(0, 12);
    const now = Date.now();
    // The change is recorded as a Yjs edit, so a teammate's edit made at the same time merges in.
    const before = this.db.query("SELECT body, ydoc FROM wiki_pages WHERE id = ?").get(id) as {
      body: string;
      ydoc: string | null;
    } | null;
    const { state, text } = saveText(before?.ydoc, before?.body ?? "", input.body);
    this.db
      .query(
        `INSERT INTO wiki_pages (id, project_id, slug, title, body, ydoc, updated_at, author_name, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, body = excluded.body, ydoc = excluded.ydoc,
           updated_at = excluded.updated_at, author_name = excluded.author_name, dirty = 1`,
      )
      .run(id, projectId, slug, title, text, state, now, this.me() ?? null);
    this.changed(projectId);
    return this.page(id) as WikiPage;
  }

  removePage(id: string): void {
    const page = this.page(id);
    if (!page) return;
    this.db.query("UPDATE wiki_pages SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?").run(Date.now(), id);
    this.changed(page.projectId);
  }

  /** Pages that link to this one, links that point to no page yet, and memory about the same things. */
  context(id: string): {
    backlinks: { id: string; title: string }[];
    missing: string[];
    memory: { id: string; section: string; text: string }[];
  } {
    const page = this.page(id);
    if (!page) return { backlinks: [], missing: [], memory: [] };
    const all = this.pages(page.projectId);
    const backlinks = all
      .filter((p) => p.id !== id && wikiLinks(p.body).includes(page.slug))
      .map((p) => ({ id: p.id, title: p.title }));
    const slugs = new Set(all.map((p) => p.slug));
    const missing = [...new Set(wikiLinks(page.body).filter((s) => !slugs.has(s)))];
    const words = keywords(`${page.title} ${page.title} ${page.body}`);
    const memory = this.store
      .memoryForPrompt(page.projectId, 200)
      .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
      .filter((x) => x.score >= 2 || (x.score === 1 && words.length <= 3))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.m);
    return { backlinks, missing, memory };
  }

  /** For the MCP tool: pages that mention the words, with a short excerpt. */
  search(projectId: string, query: string, limit = 5): { title: string; excerpt: string }[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return this.pages(projectId)
      .map((p) => {
        const text = `${p.title}\n${p.body}`.toLowerCase();
        return { p, score: words.filter((w) => text.includes(w)).length };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ p }) => {
        const at = Math.max(0, p.body.toLowerCase().indexOf(words[0] ?? "") - 200);
        return { title: p.title, excerpt: p.body.slice(at, at + 1200) };
      });
  }

  // ---- boards -------------------------------------------------------------------------------

  private toBoard(r: BoardRow): Board {
    return {
      id: r.id,
      projectId: r.project_id,
      ...(r.category ? { category: r.category } : {}),
      title: r.title,
      updatedAt: r.updated_at,
      ...(r.author_name ? { author: r.author_name } : {}),
      elements: elementCount(r.scene),
    };
  }

  boards(projectId: string, category?: string): Board[] {
    const rows = this.db
      .query(
        `SELECT * FROM boards WHERE project_id = ? AND deleted = 0 ${category ? "AND category = ?" : ""} ORDER BY updated_at DESC`,
      )
      .all(...(category ? [projectId, category] : [projectId])) as BoardRow[];
    return rows.map((r) => this.toBoard(r));
  }

  private boardRow(id: string): BoardRow {
    const r = this.db.query("SELECT * FROM boards WHERE id = ? AND deleted = 0").get(id) as BoardRow | null;
    if (!r) throw new Error("Board not found");
    return r;
  }

  board(id: string): Board & { scene: string } {
    const r = this.boardRow(id);
    return { ...this.toBoard(r), scene: r.scene };
  }

  createBoard(projectId: string, input: { title: string; category?: string; scene?: string }): Board {
    if (!this.store.projectRow(projectId)) throw new Error("Project not found");
    const id = crypto.randomUUID().slice(0, 12);
    const scene = input.scene ?? JSON.stringify({ elements: [], appState: {}, files: {} });
    this.db
      .query(
        "INSERT INTO boards (id, project_id, category, title, scene, updated_at, author_name, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
      )
      .run(
        id,
        projectId,
        input.category ?? null,
        input.title.trim().slice(0, 120) || "Board",
        scene,
        Date.now(),
        this.me() ?? null,
      );
    this.changed(projectId);
    return this.toBoard(this.boardRow(id));
  }

  /** Saves the scene; keeps a version every few minutes so the history stays useful, not huge. */
  saveBoard(id: string, input: { scene?: string; title?: string; category?: string | null }): Board {
    const r = this.boardRow(id);
    if (input.scene !== undefined) {
      if (input.scene.length > MAX_SCENE) throw new Error("The board is too big (pasted images?)");
      JSON.parse(input.scene);
      const last = this.db
        .query("SELECT at, scene FROM board_versions WHERE board_id = ? ORDER BY at DESC LIMIT 1")
        .get(id) as {
        at: number;
        scene: string;
      } | null;
      const now = Date.now();
      const before = elementCount(r.scene);
      const after = elementCount(input.scene);
      if (
        before > 0 &&
        r.scene !== input.scene &&
        (!last || now - last.at > VERSION_EVERY || Math.abs(after - before) >= 10)
      ) {
        // The version is the state before this change: what you would go back to.
        this.db
          .query("INSERT INTO board_versions (id, board_id, at, scene, author_name) VALUES (?, ?, ?, ?, ?)")
          .run(crypto.randomUUID().slice(0, 12), id, r.updated_at, r.scene, r.author_name);
        this.db
          .query(
            "DELETE FROM board_versions WHERE board_id = ? AND id NOT IN (SELECT id FROM board_versions WHERE board_id = ? ORDER BY at DESC LIMIT ?)",
          )
          .run(id, id, MAX_VERSIONS);
      }
    }
    this.db
      .query(
        "UPDATE boards SET scene = ?, title = ?, category = ?, updated_at = ?, author_name = ?, dirty = 1 WHERE id = ?",
      )
      .run(
        input.scene ?? r.scene,
        input.title?.trim().slice(0, 120) || r.title,
        input.category === undefined ? r.category : input.category,
        Date.now(),
        this.me() ?? r.author_name,
        id,
      );
    this.changed(r.project_id);
    return this.toBoard(this.boardRow(id));
  }

  removeBoard(id: string): void {
    const r = this.boardRow(id);
    this.db.query("UPDATE boards SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ?").run(Date.now(), id);
    this.changed(r.project_id);
  }

  versions(id: string): BoardVersion[] {
    return (
      this.db
        .query("SELECT id, board_id, at, scene, author_name FROM board_versions WHERE board_id = ? ORDER BY at DESC")
        .all(id) as {
        id: string;
        board_id: string;
        at: number;
        scene: string;
        author_name: string | null;
      }[]
    ).map((v) => ({
      id: v.id,
      boardId: v.board_id,
      at: v.at,
      elements: elementCount(v.scene),
      ...(v.author_name ? { author: v.author_name } : {}),
    }));
  }

  /** Puts an old version back; the current state becomes a version itself, so nothing is lost. */
  restoreVersion(boardId: string, versionId: string): Board {
    const v = this.db
      .query("SELECT scene FROM board_versions WHERE id = ? AND board_id = ?")
      .get(versionId, boardId) as {
      scene: string;
    } | null;
    if (!v) throw new Error("Version not found");
    const r = this.boardRow(boardId);
    this.db
      .query("INSERT INTO board_versions (id, board_id, at, scene, author_name) VALUES (?, ?, ?, ?, ?)")
      .run(crypto.randomUUID().slice(0, 12), boardId, Date.now(), r.scene, r.author_name);
    this.db
      .query("UPDATE boards SET scene = ?, updated_at = ?, dirty = 1 WHERE id = ?")
      .run(v.scene, Date.now(), boardId);
    this.changed(r.project_id);
    return this.toBoard(this.boardRow(boardId));
  }

  /**
   * The AI reads the board: its structure (as exact lines) and its picture together.
   * explain: what is drawn; missing: what a reviewer would add; code: folders, API and schema;
   * tidy: hand drawing turned into clean boxes (answered as Mermaid, drawn next to it).
   */
  async askBoard(
    id: string,
    mode: "explain" | "missing" | "code" | "tidy" | "question",
    png: string | undefined,
    language: string,
    question?: string,
    /** The board as it is on screen right now (it may not be saved yet). */
    current?: SceneElement[],
  ): Promise<{ answer: string; mermaid?: string }> {
    const r = this.boardRow(id);
    const elements = current ?? (JSON.parse(r.scene) as { elements?: SceneElement[] }).elements ?? [];
    if (!elements.some((e) => !e.isDeleted)) throw new Error("The board is empty: draw something first");
    const structure = sceneText(describeScene(elements));
    const project = this.store.projectRow(r.project_id);
    const memory = this.store
      .memoryForPrompt(r.project_id, 15)
      .map((m) => `- [${m.section}] ${m.text}`)
      .join("\n");
    const task = {
      explain:
        "Explain what this board shows: the parts, how they connect, and what the drawing is for. Name every labeled shape and connection; don't invent ones that are not there.",
      missing:
        "Review this drawing like a senior engineer: what is missing or risky (error paths, auth, data stores, queues, monitoring, unclear arrows)? A short list, most important first, each tied to a part of the drawing.",
      code: "Turn this drawing into a starting point for code: 1) a folder structure, 2) the API endpoints (method, path, what it does), 3) the database tables with their columns and relations. Only what the drawing supports; mark guesses as guesses.",
      tidy: "The board has hand drawing and loose shapes. Work out what it means and answer with ONE Mermaid flowchart (```mermaid … ```) that says the same thing with clean, labeled boxes and arrows. After the diagram, one sentence on anything you could not read.",
      question: `Answer this question about the board: ${question ?? ""}`,
    }[mode];
    const prompt = [
      `You are looking at a whiteboard of the project "${project?.name ?? ""}". You get its exact structure below and a picture of it. Trust the structure for names and connections; use the picture for layout and hand drawing.`,
      `Board: ${r.title}${r.category ? ` (category: ${r.category})` : ""}`,
      "Structure:",
      structure,
      memory ? `What the project already decided (memory):\n${memory}` : "",
      `Task: ${task}`,
      `Answer in the language with code "${language}". Use Markdown.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const answer = await this.ask(prompt, png ? [{ mediaType: "image/png", data: png }] : []);
    return { answer, ...(mode === "tidy" && mermaidFrom(answer) ? { mermaid: mermaidFrom(answer) } : {}) };
  }

  /**
   * The other way round: the AI (or Igrek itself) draws on the board. The answer is Mermaid,
   * which the board turns into editable shapes. A database schema is drawn without AI.
   */
  async draw(
    projectId: string,
    what: "schema" | "architecture" | "flow",
    opts: { connectionId?: string; prompt?: string; language: string },
  ): Promise<{ mermaid: string }> {
    if (what === "schema") {
      const conn = opts.connectionId ?? this.databases.list().find((c) => c.projectId === projectId)?.id;
      if (!conn) throw new Error("Connect this project's database on Tools > Databases first");
      return { mermaid: schemaFlowchart(await this.databases.tables(conn)) };
    }
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    const memory = this.store
      .memoryForPrompt(projectId, 40)
      .map((m) => `- [${m.section}] ${m.text}`)
      .join("\n");
    const files = Bun.spawnSync(["git", "-C", project.path, "ls-files"], { stdout: "pipe", timeout: 10_000 })
      .stdout.toString()
      .split("\n")
      .filter((f) => f && !/(^|\/)(test|tests|__tests__|fixtures)\/|\.(png|jpg|svg|lock|map)$/.test(f))
      .slice(0, 400)
      .join("\n");
    const prompt = [
      `Project "${project.name}". Files (git ls-files, trimmed):\n${files || "(not a git repository)"}`,
      memory ? `Memory:\n${memory}` : "",
      what === "architecture"
        ? "Draw the architecture of this project: its main parts (apps, services, databases, external APIs, queues) and how they talk. Only parts the files or memory show."
        : `Draw this flow: ${opts.prompt ?? ""}`,
      "Answer with ONE Mermaid flowchart (flowchart LR or TD) in a ```mermaid block, at most 25 nodes, short labels, labeled arrows where it helps. Labels in the language with code " +
        `"${opts.language}". Nothing else.`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const mermaid = mermaidFrom(await this.ask(prompt, []));
    if (!mermaid) throw new Error("The answer had no diagram; try again");
    return { mermaid };
  }

  // ---- team sync ----------------------------------------------------------------------------

  /**
   * A page with a Yjs state on either side merges whatever the timestamps say: both edits are kept.
   * Returns false for plain pages from an older Igrek, which take the last-writer path.
   */
  private mergePage(projectId: string, value: Record<string, unknown>, author: string): boolean {
    const id = String(value.id ?? "");
    const local = this.db.query("SELECT body, ydoc, updated_at, deleted FROM wiki_pages WHERE id = ?").get(id) as {
      body: string;
      ydoc: string | null;
      updated_at: number;
      deleted: number;
    } | null;
    const remoteState = typeof value.y === "string" ? value.y : undefined;
    if (!remoteState && !local?.ydoc) return false;
    const at = Number(value.updatedAt ?? 0);
    const newer = !local || at > local.updated_at;
    // Plain text from an older Igrek can't merge: only a newer one is applied (as an edit).
    if (!remoteState && !newer) return true;
    const { state, text } = mergeText(local?.ydoc, local?.body ?? "", {
      state: remoteState,
      text: String(value.body ?? "").slice(0, 500_000),
    });
    this.db
      .query(
        `INSERT INTO wiki_pages (id, project_id, slug, title, body, ydoc, updated_at, author_name, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET body = excluded.body, ydoc = excluded.ydoc,
           slug = CASE WHEN ? THEN excluded.slug ELSE slug END, title = CASE WHEN ? THEN excluded.title ELSE title END,
           updated_at = MAX(updated_at, excluded.updated_at), author_name = CASE WHEN ? THEN excluded.author_name ELSE author_name END,
           deleted = CASE WHEN ? THEN excluded.deleted ELSE deleted END,
           dirty = CASE WHEN ? THEN dirty ELSE 0 END`,
      )
      .run(
        id,
        projectId,
        slugify(String(value.title ?? "")),
        String(value.title ?? "").slice(0, 120),
        text,
        state,
        at,
        author,
        value.deleted ? 1 : 0,
        newer ? 1 : 0,
        newer ? 1 : 0,
        newer ? 1 : 0,
        newer ? 1 : 0,
        // A merge keeps our own unsent edit queued; plain text that replaced ours leaves nothing to send.
        remoteState ? 1 : 0,
      );
    this.changed(projectId);
    return true;
  }

  dirtyPages(projectId: string): (PageRow & { deleted: number })[] {
    return this.db
      .query("SELECT * FROM wiki_pages WHERE project_id = ? AND dirty = 1 LIMIT 50")
      .all(projectId) as (PageRow & {
      deleted: number;
    })[];
  }

  dirtyBoards(projectId: string): (BoardRow & { deleted: number })[] {
    return this.db
      .query("SELECT * FROM boards WHERE project_id = ? AND dirty = 1 LIMIT 20")
      .all(projectId) as (BoardRow & {
      deleted: number;
    })[];
  }

  markSent(table: "wiki_pages" | "boards", id: string, updatedAt: number): void {
    this.db.query(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`).run(id, updatedAt);
  }

  /** A teammate's page or board: pages merge (Yjs), boards and titles go to the last writer. */
  apply(kind: "wiki" | "board", projectId: string, value: Record<string, unknown>, author: string): void {
    if (kind === "wiki" && this.mergePage(projectId, value, author)) return;
    const table = kind === "wiki" ? "wiki_pages" : "boards";
    const existing = this.db.query(`SELECT updated_at FROM ${table} WHERE id = ?`).get(String(value.id)) as {
      updated_at: number;
    } | null;
    const at = Number(value.updatedAt ?? 0);
    if (existing && existing.updated_at >= at) return;
    if (kind === "wiki")
      this.db
        .query(
          `INSERT INTO wiki_pages (id, project_id, slug, title, body, updated_at, author_name, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, body = excluded.body, updated_at = excluded.updated_at,
             author_name = excluded.author_name, deleted = excluded.deleted, dirty = 0`,
        )
        .run(
          String(value.id),
          projectId,
          slugify(String(value.title ?? "")),
          String(value.title ?? "").slice(0, 120),
          String(value.body ?? "").slice(0, 500_000),
          at,
          author,
          value.deleted ? 1 : 0,
        );
    else
      this.db
        .query(
          `INSERT INTO boards (id, project_id, category, title, scene, updated_at, author_name, deleted, dirty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT(id) DO UPDATE SET category = excluded.category, title = excluded.title, scene = excluded.scene,
             updated_at = excluded.updated_at, author_name = excluded.author_name, deleted = excluded.deleted, dirty = 0`,
        )
        .run(
          String(value.id),
          projectId,
          (value.category as string | null) ?? null,
          String(value.title ?? "Board").slice(0, 120),
          String(value.scene ?? '{"elements":[]}').slice(0, MAX_SCENE),
          at,
          author,
          value.deleted ? 1 : 0,
        );
    this.changed(projectId);
  }
}
