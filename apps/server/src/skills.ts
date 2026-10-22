import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type { InstalledSkill, SkillHit, SkillPreview } from "@igrek/core";
import type { Hono } from "hono";

/**
 * Skills for Claude Code: found in the official Anthropic catalog (github.com/anthropics/skills)
 * and on skills.sh, read before anything is installed, then copied into the Claude skills folder, where
 * every chat can use them and the "/" menu lists them. Everything is read from public GitHub, for free;
 * nothing runs while installing. Only files of the skill's own folder are copied.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const OFFICIAL = "anthropics/skills";
const SOURCE = /^[\w-][\w.-]{0,59}\/[\w-][\w.-]{0,99}$/;
const SKILL = /^[\w-][\w.-]{0,79}$/;
const DAY = 24 * 3600_000;
const MAX_FILES = 80;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const SCRIPT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|pl|ps1|bat|cmd|exe|bin)$/i;
/** Written next to an installed skill, so Igrek knows where it came from. */
const ORIGIN = ".igrek-source";

interface TreeItem {
  path: string;
  type: string;
  size?: number;
}

/** The front matter of a SKILL.md: name, description, license. */
export function frontMatter(text: string): { name?: string; description?: string; license?: string } {
  const head = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const field = (key: string) =>
    head
      .match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  return { name: field("name"), description: field("description"), license: field("license") };
}

/** The skill folders of a repository tree: "skills/pdf" for skills/pdf/SKILL.md, by folder name. */
export function skillFolders(tree: TreeItem[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of tree) {
    if (item.type !== "blob" || !/(^|\/)SKILL\.md$/.test(item.path)) continue;
    const dir = dirname(item.path);
    const name = dir === "." ? "" : (dir.split("/").pop() ?? "");
    if (name && name !== "template" && !out.has(name)) out.set(name, dir);
  }
  return out;
}

export class Skills {
  private trees = new Map<string, { at: number; tree: TreeItem[] }>();
  private official?: { at: number; hits: Omit<SkillHit, "installed">[] };

  constructor(
    /** The Claude skills folder (~/.claude/skills, or the active account's). */
    private readonly dir: () => string,
    private readonly get: Fetch = fetch,
  ) {}

  installed(): InstalledSkill[] {
    const root = this.dir();
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(root, e.name, "SKILL.md")))
      .map((e) => {
        const meta = frontMatter(readFileSync(join(root, e.name, "SKILL.md"), "utf8").slice(0, 8000));
        const origin = join(root, e.name, ORIGIN);
        return {
          name: e.name,
          description: meta.description ?? "",
          ...(existsSync(origin) ? { source: readFileSync(origin, "utf8").trim() } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async json<T>(url: string): Promise<T> {
    const res = await this.get(url, { headers: { accept: "application/json", "user-agent": "igrek" } });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return (await res.json()) as T;
  }

  private async raw(source: string, path: string): Promise<string> {
    const res = await this.get(`https://raw.githubusercontent.com/${source}/HEAD/${path}`);
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
    return res.text();
  }

  private async tree(source: string): Promise<TreeItem[]> {
    const cached = this.trees.get(source);
    if (cached && Date.now() - cached.at < DAY) return cached.tree;
    const data = await this.json<{ tree?: TreeItem[] }>(
      `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`,
    );
    const tree = data.tree ?? [];
    this.trees.set(source, { at: Date.now(), tree });
    return tree;
  }

  /** The official catalog with each skill's description; read once a day. */
  private async officialHits(): Promise<Omit<SkillHit, "installed">[]> {
    if (this.official && Date.now() - this.official.at < DAY) return this.official.hits;
    const folders = skillFolders(await this.tree(OFFICIAL));
    const hits = await Promise.all(
      [...folders].map(async ([skill, path]) => {
        const meta = frontMatter(await this.raw(OFFICIAL, `${path}/SKILL.md`).catch(() => ""));
        return {
          id: `${OFFICIAL}/${skill}`,
          source: OFFICIAL,
          skill,
          name: meta.name ?? skill,
          ...(meta.description ? { description: meta.description } : {}),
          official: true,
        };
      }),
    );
    this.official = { at: Date.now(), hits };
    return hits;
  }

  /** skills.sh's own search (the one its site uses; no account needed). */
  private async community(q: string): Promise<Omit<SkillHit, "installed">[]> {
    const data = await this.json<{
      skills?: { source?: string; skillId?: string; name?: string; installs?: number }[];
    }>(`https://skills.sh/api/search?q=${encodeURIComponent(q)}`);
    return (data.skills ?? []).flatMap((s) =>
      s.source && s.skillId && SOURCE.test(s.source) && SKILL.test(s.skillId)
        ? [
            {
              id: `${s.source}/${s.skillId}`,
              source: s.source,
              skill: s.skillId,
              name: s.name ?? s.skillId,
              ...(s.installs !== undefined ? { installs: s.installs } : {}),
              official: s.source === OFFICIAL,
            },
          ]
        : [],
    );
  }

  /**
   * Official skills first (all of them for an empty search), then skills.sh's most installed.
   * One source failing leaves the other's results.
   */
  async search(query: string): Promise<{ hits: SkillHit[]; errors: string[] }> {
    const q = query.trim().toLowerCase().slice(0, 100);
    const errors: string[] = [];
    const official = await this.officialHits().catch((err: Error) => {
      errors.push(err.message);
      return [];
    });
    const matches = official.filter(
      (h) => !q || h.skill.includes(q) || (h.description ?? "").toLowerCase().includes(q),
    );
    const others =
      q.length >= 2
        ? await this.community(q).catch((err: Error) => {
            errors.push(err.message);
            return [];
          })
        : [];
    const have = new Set(this.installed().map((s) => s.name));
    const seen = new Set(matches.map((h) => h.id));
    const hits = [...matches, ...others.filter((h) => !seen.has(h.id))]
      .slice(0, 40)
      .map((h) => ({ ...h, installed: have.has(h.skill) }));
    return { hits, errors };
  }

  async preview(source: string, skill: string): Promise<SkillPreview> {
    if (!SOURCE.test(source) || !SKILL.test(skill)) throw new Error("Unknown skill");
    const tree = await this.tree(source);
    const path = skillFolders(tree).get(skill);
    if (!path) throw new Error("This repository has no such skill");
    const text = await this.raw(source, `${path}/SKILL.md`);
    const meta = frontMatter(text);
    const files = tree
      .filter((t) => t.type === "blob" && t.path.startsWith(`${path}/`))
      .map((t) => ({ path: t.path.slice(path.length + 1), size: t.size ?? 0 }));
    return {
      id: `${source}/${skill}`,
      source,
      skill,
      name: meta.name ?? skill,
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.license ? { license: meta.license } : {}),
      official: source === OFFICIAL,
      installed: existsSync(join(this.dir(), skill, "SKILL.md")),
      path,
      text: text.slice(0, 60_000),
      files,
      scripts: files.filter((f) => SCRIPT.test(f.path)).map((f) => f.path),
    };
  }

  /** Copies the skill's folder into the skills folder: whole or not at all. Nothing in it runs now. */
  async install(source: string, skill: string): Promise<InstalledSkill> {
    const preview = await this.preview(source, skill);
    if (preview.files.length > MAX_FILES) throw new Error(`The skill has more than ${MAX_FILES} files`);
    const total = preview.files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_TOTAL || preview.files.some((f) => f.size > MAX_FILE)) throw new Error("The skill is too big");
    const root = this.dir();
    const target = join(root, skill);
    const temp = join(root, `.${skill}.installing`);
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp, { recursive: true });
    try {
      for (const file of preview.files) {
        const rel = normalize(file.path);
        if (rel.startsWith("..") || rel.startsWith("/")) throw new Error("A file points outside the skill");
        const res = await this.get(`https://raw.githubusercontent.com/${source}/HEAD/${preview.path}/${file.path}`);
        if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${file.path}`);
        mkdirSync(dirname(join(temp, rel)), { recursive: true });
        writeFileSync(join(temp, rel), new Uint8Array(await res.arrayBuffer()));
      }
      writeFileSync(join(temp, ORIGIN), `${source}/${skill}\n`);
      rmSync(target, { recursive: true, force: true });
      renameSync(temp, target);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    return { name: skill, description: preview.description ?? "", source: `${source}/${skill}` };
  }

  remove(name: string): void {
    if (!SKILL.test(name)) throw new Error("Unknown skill");
    const target = join(this.dir(), name);
    if (!existsSync(join(target, "SKILL.md"))) throw new Error("Skill not found");
    rmSync(target, { recursive: true, force: true });
  }
}

export function registerSkillRoutes(app: Hono, skills: Skills): void {
  const fail = (err: unknown) => Response.json({ error: (err as Error).message }, { status: 400 });
  const body = async (c: { req: { json: () => Promise<unknown> } }) =>
    ((await c.req.json().catch(() => ({}))) ?? {}) as { source?: unknown; skill?: unknown };
  app.get("/api/skills", (c) => c.json(skills.installed()));
  app.get("/api/skills/search", async (c) => c.json(await skills.search(c.req.query("q") ?? "")));
  app.get("/api/skills/preview", async (c) =>
    skills
      .preview(c.req.query("source") ?? "", c.req.query("skill") ?? "")
      .then((p) => c.json(p))
      .catch(fail),
  );
  app.post("/api/skills/install", async (c) => {
    const b = await body(c);
    return skills
      .install(String(b.source ?? ""), String(b.skill ?? ""))
      .then((s) => c.json(s))
      .catch(fail);
  });
  app.delete("/api/skills/:name", (c) => {
    try {
      skills.remove(c.req.param("name"));
      return c.json({ ok: true });
    } catch (err) {
      return fail(err);
    }
  });
}
