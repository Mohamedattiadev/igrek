import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RICH_BLOCKS_HINT, slugify, type WikiPage } from "@godeye/core";
import { languages } from "@godeye/i18n";
import JSZip from "jszip";
import type { Docs } from "./docs";
import type { Flows } from "./flows";
import type { Store } from "./store";
import { unfence, type Writeups } from "./writeups";

type Ask = (prompt: string, system?: string) => Promise<string>;
const languageName = (code: string) => languages.find((l) => l.code === code)?.english ?? "English";
const DAY = 86_400_000;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "2026-W42", Monday based. */
export function isoWeek(at: number): string {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d.getTime() - week1.getTime()) / DAY - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(n).padStart(2, "0")}`;
}

const SITE_CSS = `:root{--bg:#fff;--fg:#1d1f24;--muted:#6b7079;--border:#e4e6ea;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8e9ec;--muted:#9a9ea6;--border:#2b2e35;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 system-ui,sans-serif}
.wrap{display:flex;max-width:1100px;margin:0 auto;min-height:100vh}nav{width:240px;flex-shrink:0;border-right:1px solid var(--border);padding:24px 16px}
nav a{display:block;padding:4px 8px;border-radius:6px;color:var(--fg);text-decoration:none;font-size:14px}nav a:hover,nav a.on{background:color-mix(in srgb,var(--accent) 12%,transparent)}
nav input{width:100%;padding:6px 8px;margin:8px 0 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg)}
main{flex:1;min-width:0;padding:32px 40px}main img{max-width:100%}a{color:var(--accent)}pre{overflow:auto;padding:12px;border-radius:8px;background:color-mix(in srgb,var(--fg) 6%,transparent)}
code{font-family:ui-monospace,monospace;font-size:.9em}table{border-collapse:collapse}td,th{border:1px solid var(--border);padding:4px 8px}
.brand{font-weight:700;margin-bottom:4px}#hits:not(:empty){margin-top:12px;padding-top:8px;border-top:1px solid var(--border)}#hits a{font-size:13px;color:var(--muted)}.foot{color:var(--muted);font-size:12px;margin-top:48px}
@media (max-width:720px){.wrap{flex-direction:column}nav{width:auto;border-right:0;border-bottom:1px solid var(--border)}main{padding:20px 16px}}`;

/**
 * The product side (plan.md 13.5): a documentation site from the wiki, launch materials written
 * by the Growth persona with real screenshots, and the weekly report for the CEO.
 */
export class Product {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly docs: Docs,
    private readonly flows: Flows,
    private readonly writeups: Writeups,
    private readonly ask: Ask,
    private readonly shotsDir: string,
    private readonly persona: (id: string, projectId: string | null) => string | undefined,
  ) {
    mkdirSync(shotsDir, { recursive: true });
  }

  // ---- documentation site --------------------------------------------------------------

  /**
   * A static site (one HTML page per wiki page, the README as the home page, search) as a zip
   * you can put on any static host: GitHub Pages, Netlify, your own server.
   */
  async docsSite(projectId: string, language: string): Promise<Uint8Array> {
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    // Internal pages (postmortems, launch drafts) stay out of the public site.
    const pages = this.docs
      .pages(projectId)
      .filter((p) => !/^(postmortem|launch-materials|lansman-materyalleri)/.test(p.slug));
    const readme = ["README.md", "readme.md", "Readme.md"].map((f) => join(project.path, f)).find((f) => existsSync(f));
    if (!pages.length && !readme) throw new Error("The project has no wiki pages and no README to make a site from");
    const tr = language === "tr";
    const home: WikiPage = {
      id: "home",
      projectId,
      slug: "index",
      title: tr ? "Giriş" : "Home",
      body: readme ? readFileSync(readme, "utf8") : (pages[0]?.body ?? ""),
      updatedAt: Date.now(),
    };
    const all = [home, ...pages];
    const file = (p: WikiPage) => (p.slug === "index" ? "index.html" : `${p.slug}.html`);
    const slugs = new Set(all.map((p) => p.slug));
    const toHtml = (body: string) =>
      Bun.markdown
        .html(
          body.replace(/\[\[([^\]\n|]{1,80})(?:\|([^\]\n]*))?\]\]/g, (_m, title: string, shown?: string) => {
            const slug = slugify(title);
            return slugs.has(slug) ? `[${shown || title}](${slug}.html)` : shown || title;
          }),
        )
        // Links to pages that don't exist yet stay plain text, so the site has no broken links.
        .replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, '<pre class="mermaid">$1</pre>');
    const nav = (current: WikiPage) =>
      all
        .map((p) => `<a href="${file(p)}"${p.slug === current.slug ? ' class="on"' : ""}>${esc(p.title)}</a>`)
        .join("");
    const usesMermaid = all.some((p) => /```mermaid/.test(p.body));
    const page = (p: WikiPage) => `<!doctype html>
<html lang="${esc(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.title)} · ${esc(project.name)}</title><link rel="stylesheet" href="style.css"></head>
<body><div class="wrap"><nav><div class="brand">${esc(project.name)}</div>
<input id="q" placeholder="${tr ? "Ara…" : "Search…"}" aria-label="${tr ? "Ara" : "Search"}">${nav(p)}<div id="hits"></div></nav>
<main>${toHtml(p.body)}<p class="foot">${tr ? "Son güncelleme" : "Last updated"}: ${new Date(p.updatedAt).toISOString().slice(0, 10)}</p></main></div>
<script src="search.js"></script>${usesMermaid ? '<script type="module">import m from "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs";m.initialize({startOnLoad:true});</script>' : ""}
</body></html>`;
    const index = all.map((p) => ({
      title: p.title,
      file: file(p),
      text: p.body
        .replace(/[#*`>[\]()_-]/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 4000),
    }));
    const search = `const idx=${JSON.stringify(index)};const q=document.getElementById("q"),h=document.getElementById("hits");
q.addEventListener("input",()=>{const w=q.value.toLowerCase().trim();h.innerHTML="";if(w.length<2)return;
for(const p of idx){const i=p.text.toLowerCase().indexOf(w);if(i<0&&!p.title.toLowerCase().includes(w))continue;
const a=document.createElement("a");a.href=p.file;a.textContent=p.title+(i>=0?" · "+p.text.slice(Math.max(0,i-20),i+40):"");h.append(a);}});`;
    const zip = new JSZip();
    zip.file("style.css", SITE_CSS);
    zip.file("search.js", search);
    for (const p of all) zip.file(file(p), page(p));
    return zip.generateAsync({ type: "uint8array" });
  }

  // ---- launch materials ----------------------------------------------------------------

  /** Pictures of the running app (desktop and phone), from the live preview or a URL you give. */
  async screenshots(projectId: string, url: string): Promise<string[]> {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error("Give an http(s) address");
    const { chromium } = await import("playwright-core");
    const executablePath = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find((p) =>
      existsSync(p),
    );
    if (!executablePath) throw new Error("Chromium or Google Chrome is needed for screenshots");
    const browser = await chromium.launch({ executablePath });
    const names: string[] = [];
    try {
      for (const [kind, viewport] of [
        ["desktop", { width: 1440, height: 900 }],
        ["phone", { width: 390, height: 844 }],
      ] as const) {
        const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
        await page.goto(u.toString(), { waitUntil: "networkidle", timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        const name = `${projectId}-${kind}-${Date.now().toString(36)}.png`;
        await page.screenshot({ path: join(this.shotsDir, name) });
        names.push(name);
        await page.close();
      }
    } finally {
      await browser.close();
    }
    return names;
  }

  shotFile(name: string): string | undefined {
    if (!/^[\w.-]+\.png$/.test(name)) return undefined;
    const file = join(this.shotsDir, name);
    return existsSync(file) ? file : undefined;
  }

  /** Landing page copy, an announcement and short posts, written by the Growth persona; saved to the wiki. */
  async launchKit(projectId: string, language: string, url?: string): Promise<WikiPage> {
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    const readme = ["README.md", "readme.md"].map((f) => join(project.path, f)).find((f) => existsSync(f));
    const wiki = this.docs.pages(projectId).slice(0, 8);
    const notes = await this.writeups.releaseNotes(projectId, language).catch(() => undefined);
    const shots = url ? await this.screenshots(projectId, url).catch(() => []) : [];
    const material = [
      readme ? `README:\n${readFileSync(readme, "utf8").slice(0, 6000)}` : "",
      ...wiki.map((p) => `Wiki page "${p.title}":\n${p.body.slice(0, 2000)}`),
      notes ? `Latest release notes:\n${notes.markdown}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!material.trim()) throw new Error("Write a README or a wiki page about the product first");
    const text = unfence(
      await this.ask(
        [
          `Write launch materials for "${project.name}" in ${languageName(language)}, only from the material below; never promise features it doesn't mention.`,
          "Sections (Markdown, headings in that language): 1) Landing page: hero headline (max 8 words), subheadline, three benefits with one sentence each, call to action, three FAQ with answers. 2) Announcement post (about 200 words, plain and honest, no hype words). 3) A short social post (max 280 characters). 4) A one-line tagline.",
          material,
        ].join("\n\n"),
        this.persona("growth", projectId),
      ),
    );
    const pictures = shots
      .map((n) => `![${n.includes("phone") ? "Phone" : "Desktop"}](/api/launch-shots/${n})`)
      .join("\n\n");
    return this.docs.savePage(projectId, {
      title: `${language === "tr" ? "Lansman materyalleri" : "Launch materials"} ${new Date().toISOString().slice(0, 10)}`,
      body: `${text}${pictures ? `\n\n## ${language === "tr" ? "Ekran görüntüleri" : "Screenshots"}\n\n${pictures}` : ""}`,
    });
  }

  // ---- weekly CEO report ---------------------------------------------------------------

  weekly(week: string): { week: string; text: string; at: number } | undefined {
    return (
      (this.db.query("SELECT * FROM weekly_reports WHERE week = ?").get(week) as {
        week: string;
        text: string;
        at: number;
      } | null) ?? undefined
    );
  }

  weeks(): string[] {
    return (
      this.db.query("SELECT week FROM weekly_reports ORDER BY week DESC LIMIT 26").all() as { week: string }[]
    ).map((r) => r.week);
  }

  /** One page for the CEO: every project's state this week, risks, decisions, and what to do next. */
  async writeWeekly(language: string, now = Date.now()): Promise<{ week: string; text: string; at: number }> {
    const from = now - 7 * DAY;
    const lines: string[] = [];
    for (const p of this.store.listProjects().filter((x) => !x.hidden && x.status !== "archived")) {
      const commits = this.store.commitsBetween(p.id, from, now);
      const sessions = this.store.sessionsBetween(p.id, from, now);
      const runs = this.flows.list(p.id).filter((r) => r.updatedAt >= from);
      const decisions = this.db
        .query(
          "SELECT text FROM memory_items WHERE project_id = ? AND section = 'decision' AND created_at >= ? LIMIT 10",
        )
        .all(p.id, from) as { text: string }[];
      const issues = this.db
        .query("SELECT text FROM memory_items WHERE project_id = ? AND section = 'issue' AND status = 'active' LIMIT 8")
        .all(p.id) as { text: string }[];
      if (!commits.length && !sessions.length && !runs.length && !decisions.length) continue;
      lines.push(`Project ${p.name} (status ${p.status}, health ${p.health?.level ?? "unknown"}):`);
      lines.push(
        `- ${commits.length} commits, ${sessions.length} AI sessions, team runs: ${runs.map((r) => r.status).join(", ") || "none"}`,
      );
      for (const c of commits.slice(0, 12)) lines.push(`- commit: ${c.subject}`);
      for (const d of decisions) lines.push(`- decision: ${d.text}`);
      for (const i of issues) lines.push(`- open problem: ${i.text}`);
    }
    if (!lines.length) throw new Error("Nothing happened in your projects this week");
    const text = unfence(
      await this.ask(
        [
          `Period: the last 7 days, ${new Date(from).toISOString().slice(0, 10)} to ${new Date(now).toISOString().slice(0, 10)}. All numbers below are for this period.`,
          `Write my weekly CEO report in ${languageName(language)}: one page. Sections with headings in that language: The week in three sentences; Projects (one line each: where it stands, green/yellow/red with the reason); Risks; Decisions made; What I should do next week (at most five, ordered). Plain words, no filler, only what the data supports.`,
          RICH_BLOCKS_HINT,
          ...lines,
        ].join("\n"),
        this.persona("ceo-coach", null),
      ),
    );
    const week = isoWeek(now);
    const at = Date.now();
    this.db
      .query(
        "INSERT INTO weekly_reports (week, text, at) VALUES (?, ?, ?) ON CONFLICT(week) DO UPDATE SET text = excluded.text, at = excluded.at",
      )
      .run(week, text, at);
    return { week, text, at };
  }
}
