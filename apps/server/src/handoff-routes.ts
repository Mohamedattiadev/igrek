import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import type { Bus } from "./bus";
import {
  applyCode,
  checkBundle,
  fromParts,
  type HandoffBundle,
  type HandoffProblem,
  makeBundle,
  placeTranscript,
  stashChanges,
  toParts,
} from "./handoff";

/** A received bundle as the page lists it (the bundle itself stays on disk). */
export interface HandoffItem {
  id: string;
  title: string;
  from: string;
  at: number;
  branch: string;
  changes: number;
  projectId?: string;
  /** The project folder's name on the other computer, to find the same project here. */
  folder: string;
}

const KEEP = 14 * 86_400_000;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Hand-offs between computers (handoff.ts): made here from a session, sent through the team hub in
 * parts or saved as a file; received ones wait in the data folder until the user goes on with them.
 */
export class Handoffs {
  constructor(
    private readonly dir: string,
    private readonly bus: Bus,
  ) {
    mkdirSync(join(dir, "parts"), { recursive: true });
  }

  private file(id: string): string {
    return join(this.dir, `${id.replace(/[^\w-]/g, "")}.json`);
  }

  save(bundle: HandoffBundle, projectId?: string): HandoffItem {
    writeFileSync(this.file(bundle.id), JSON.stringify({ bundle, projectId }));
    this.bus.publish({ type: "handoffs-changed" });
    return this.item(bundle, projectId);
  }

  private item(b: HandoffBundle, projectId?: string): HandoffItem {
    const changes = (b.diff.match(/^diff --git /gm) ?? []).length + b.untracked.length;
    const folder = b.cwd.split(/[\\/]/).filter(Boolean).pop() ?? "";
    return { id: b.id, title: b.title, from: b.from, at: b.at, branch: b.branch, changes, projectId, folder };
  }

  get(id: string): { bundle: HandoffBundle; projectId?: string } | undefined {
    try {
      return JSON.parse(readFileSync(this.file(id), "utf8")) as { bundle: HandoffBundle; projectId?: string };
    } catch {
      return undefined;
    }
  }

  list(now = Date.now()): HandoffItem[] {
    const out: HandoffItem[] = [];
    for (const name of readdirSync(this.dir).filter((n) => n.endsWith(".json"))) {
      const path = join(this.dir, name);
      if (now - statSync(path).mtimeMs > KEEP) {
        rmSync(path, { force: true });
        continue;
      }
      const got = this.get(name.slice(0, -5));
      if (got) out.push(this.item(got.bundle, got.projectId));
    }
    return out.sort((a, b) => b.at - a.at);
  }

  remove(id: string): void {
    rmSync(this.file(id), { force: true });
    this.bus.publish({ type: "handoffs-changed" });
  }

  /** One part from the hub; when all are here and their checksum matches, the bundle is kept. */
  receivePart(projectId: string, part: { id: string; i: number; n: number; sum: string; data: string }): void {
    if (!/^[\w-]{6,64}$/.test(part.id) || part.n < 1 || part.n > 400 || part.i < 0 || part.i >= part.n) return;
    const folder = join(this.dir, "parts", part.id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, String(part.i)), part.data);
    const have = readdirSync(folder).length;
    if (have < part.n) return;
    const parts = Array.from({ length: part.n }, (_, i) => readFileSync(join(folder, String(i)), "utf8"));
    rmSync(folder, { recursive: true, force: true });
    if (sha(parts.join("")) !== part.sum) return;
    this.save(fromParts(parts), projectId);
  }
}

export function partsWithSum(bundle: HandoffBundle): { parts: string[]; sum: string } {
  const parts = toParts(bundle);
  return { parts, sum: sha(parts.join("")) };
}

interface Deps {
  db: Database;
  handoffs: Handoffs;
  projectPath: (id: string) => string | undefined;
  /** Sends the parts through the hub; false when the project is not shared with a team. */
  send: (projectId: string, id: string, parts: string[], sum: string) => Promise<boolean>;
  /** Where this computer's Claude Code keeps its sessions: the default folder, then each extra account's. */
  claudeProjects?: () => string[];
}

function problemStatus(p: HandoffProblem): 409 | 400 {
  return p.code === "dirty" || p.code === "file-exists" || p.code === "missing-commit" ? 409 : 400;
}

export function registerHandoffRoutes(app: Hono, deps: Deps): void {
  const { db, handoffs } = deps;
  const defaultProjects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
  // Every account's folder (the list holds the default one too): the chat may resume under any of them.
  const projectDirs = () => {
    const dirs = deps.claudeProjects?.() ?? [];
    return dirs.length ? [...new Set(dirs)] : [defaultProjects];
  };

  // On the computer that has the chat: pack it, and send it through the hub or hand it over as a file.
  app.post("/api/sessions/:id/elsewhere", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { via?: unknown };
    const id = c.req.param("id");
    const session = db
      .query("SELECT id, project_id, cwd, title, first_prompt FROM sessions WHERE id = ? AND author_id IS NULL")
      .get(id) as
      | { id: string; project_id: string | null; cwd: string | null; title: string | null; first_prompt: string | null }
      | undefined;
    const source = db.query("SELECT path FROM source_files WHERE session_id = ? ORDER BY mtime DESC").get(id) as
      | { path: string }
      | undefined;
    const cwd = session?.cwd ?? (session?.project_id ? deps.projectPath(session.project_id) : undefined);
    if (!session || !source || !cwd || !existsSync(source.path)) return c.json({ error: "Session not found" }, 404);
    const made = makeBundle({
      id: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      sessionId: session.id,
      title: (session.title || session.first_prompt || "").slice(0, 120),
      from: hostname(),
      cwd,
      transcriptFile: source.path,
    });
    if (!("version" in made)) return c.json({ problem: made }, problemStatus(made));
    if (body.via === "file") return c.json(made);
    const { parts, sum } = partsWithSum(made);
    const sent = session.project_id ? await deps.send(session.project_id, made.id, parts, sum) : false;
    if (!sent) return c.json({ problem: { code: "not-shared" } }, 409);
    return c.json({ id: made.id, parts: parts.length });
  });

  app.get("/api/handoffs", (c) => c.json(handoffs.list()));
  app.delete("/api/handoffs/:id", (c) => {
    handoffs.remove(c.req.param("id"));
    return c.json({ ok: true });
  });
  // A bundle saved as a file on the other computer.
  app.post("/api/handoffs", async (c) => {
    const bundle = (await c.req.json().catch(() => undefined)) as HandoffBundle | undefined;
    if (bundle?.version !== 1 || typeof bundle.transcript !== "string" || typeof bundle.sessionId !== "string")
      return c.json({ error: "Not a hand-off file" }, 400);
    return c.json(handoffs.save(bundle));
  });

  const target = (id: string, projectId: unknown) => {
    const got = handoffs.get(id);
    const pid = typeof projectId === "string" && projectId ? projectId : got?.projectId;
    const path = pid ? deps.projectPath(pid) : undefined;
    return got && pid && path ? { bundle: got.bundle, projectId: pid, path } : undefined;
  };

  // What would happen, before anything is touched.
  app.post("/api/handoffs/:id/check", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: unknown };
    const t = target(c.req.param("id"), body.projectId);
    if (!t) return c.json({ error: "Hand-off or project not found" }, 404);
    const result = checkBundle(t.bundle, t.path);
    return "ok" in result ? c.json(result) : c.json({ problem: result }, problemStatus(result));
  });
  // The code as it was there, the session where Claude Code finds it; the page then resumes the chat.
  app.post("/api/handoffs/:id/continue", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { projectId?: unknown; stash?: unknown };
    const t = target(c.req.param("id"), body.projectId);
    if (!t) return c.json({ error: "Hand-off or project not found" }, 404);
    // Asked for: this computer's unsaved work is put aside first (git stash pop brings it back).
    if (body.stash === true) stashChanges(t.path, `igrek: before hand-off ${t.bundle.id}`);
    const code = applyCode(t.bundle, t.path);
    if (!("branch" in code)) return c.json({ problem: code }, problemStatus(code));
    for (const dir of projectDirs()) placeTranscript(t.bundle, t.path, dir);
    handoffs.remove(t.bundle.id);
    return c.json({ projectId: t.projectId, sessionId: t.bundle.sessionId, branch: code.branch });
  });
}
