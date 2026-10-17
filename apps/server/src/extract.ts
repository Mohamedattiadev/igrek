import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CODE } from "./insight/checks";
import { SENSITIVE } from "./insight/snapshot";

/** A piece of a source with where it is ("p. 12", "Chapter 3", "src/app.ts"). */
export interface Section {
  location?: string;
  text: string;
}

export interface Extracted {
  title?: string;
  author?: string;
  sections: Section[];
  publishedAt?: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Plain text from HTML: scripts, styles and navigation dropped, blocks become lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level: string, inner: string) =>
        `\n\n${"#".repeat(Number(level))} ${inner
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()}\n\n`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|h[4-6]|tr|blockquote|pre|table|ul|ol)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlTitle(html: string): string | undefined {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return t ? htmlToText(t).slice(0, 200) || undefined : undefined;
}

/** Markdown and plain text, split at headings so each part knows its section. */
export function markdownSections(text: string, fallback?: string): Section[] {
  const out: Section[] = [];
  let heading = fallback;
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) out.push({ location: heading, text: body });
    buffer = [];
  };
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,3}\s+(.+)/);
    if (h) {
      flush();
      heading = (h[1] as string).trim().slice(0, 120);
    }
    buffer.push(line);
  }
  flush();
  return out;
}

export async function extractPdf(bytes: Uint8Array): Promise<Extracted> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const info = ((await doc.getMetadata().catch(() => undefined))?.info ?? {}) as { Title?: string; Author?: string };
  const sections: Section[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as { str?: string; hasEOL?: boolean }[])
      .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : " "))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (text) sections.push({ location: `p. ${i}`, text });
    page.cleanup();
  }
  await doc.cleanup();
  const title = info.Title?.trim();
  // Titles some tools write for every file ("about:blank", "Untitled", "Microsoft Word - x.docx") say nothing.
  const junk = !title || /^(about:blank|untitled|document\d*|microsoft word - .*|.*\.(docx?|pdf))$/i.test(title);
  return { title: junk ? undefined : title, author: info.Author?.trim() || undefined, sections };
}

/** EPUB is a zip of XHTML chapters in the order the OPF spine gives. */
export async function extractEpub(bytes: Uint8Array): Promise<Extracted> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("Not a valid EPUB file");
  const opf = (await zip.file(opfPath)?.async("string")) ?? "";
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = m[0].match(/\bid="([^"]+)"/)?.[1];
    const href = m[0].match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => m[1] as string);
  const sections: Section[] = [];
  let n = 0;
  for (const idref of spine) {
    const href = manifest.get(idref);
    const html = href ? await zip.file(base + href)?.async("string") : undefined;
    if (!html) continue;
    const text = htmlToText(html);
    if (text.length < 40) continue;
    n++;
    const heading = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)?.[1];
    const name = heading ? htmlToText(heading).slice(0, 100) : htmlTitle(html);
    sections.push({ location: name ? `Chapter ${n}: ${name}` : `Chapter ${n}`, text });
  }
  const tag = (name: string) => {
    const v = opf.match(new RegExp(`<dc:${name}[^>]*>([\\s\\S]*?)</dc:${name}>`, "i"))?.[1];
    return v ? htmlToText(v) : undefined;
  };
  return { title: tag("title"), author: tag("creator"), sections };
}

export function extractHtml(html: string): Extracted {
  const main = html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html;
  const published = html.match(/<meta[^>]+(?:article:published_time|datePublished)[^>]+content="([^"]+)"/i)?.[1];
  const at = published ? Date.parse(published) : Number.NaN;
  return {
    title: htmlTitle(html),
    sections: markdownSections(htmlToText(main)),
    ...(Number.isFinite(at) ? { publishedAt: at } : {}),
  };
}

const MAX_PAGE = 8 * 1024 * 1024;

/** A web page or an X post (through the free public oEmbed, no account needed). */
export async function extractUrl(raw: string, fetcher: typeof fetch = fetch): Promise<Extracted & { url: string }> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https addresses");
  const headers = {
    "user-agent": "GodEye/0.1 (personal library)",
    accept: "text/html,application/xhtml+xml,text/plain",
  };
  if (/^(www\.)?(x|twitter)\.com$/i.test(url.hostname)) {
    const res = await fetcher(
      `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url.toString())}`,
      {
        headers,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) throw new Error(`X post could not be read (${res.status})`);
    const data = (await res.json()) as { html?: string; author_name?: string };
    const text = htmlToText(data.html ?? "");
    return {
      url: url.toString(),
      title: `X: ${data.author_name ?? url.pathname.split("/")[1] ?? "post"}`,
      author: data.author_name,
      sections: [{ text }],
    };
  }
  const res = await fetcher(url.toString(), { headers, redirect: "follow", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`The page answered ${res.status}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_PAGE) throw new Error("The page is too big");
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/pdf"))
    return { url: url.toString(), ...(await extractPdf(new Uint8Array(await res.arrayBuffer()))) };
  const body = (await res.text()).slice(0, MAX_PAGE);
  if (type.includes("text/plain") || /\.(md|txt)$/i.test(url.pathname))
    return { url: url.toString(), title: url.pathname.split("/").pop(), sections: markdownSections(body) };
  return { url: url.toString(), ...extractHtml(body) };
}

export const GITHUB_REPO = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const REPO_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "target",
  ".next",
  "coverage",
  "__pycache__",
]);
const DOC_FILE = /\.(md|mdx|txt|rst|adoc)$/i;

/** Docs and source of a cloned repo; secrets and generated folders are never read. */
export function extractRepo(dir: string, maxFiles = 1500, maxBytes = 25 * 1024 * 1024): Extracted {
  const sections: Section[] = [];
  let bytes = 0;
  let files = 0;
  const walk = (folder: string) => {
    if (files >= maxFiles || bytes >= maxBytes) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(folder).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (files >= maxFiles || bytes >= maxBytes) return;
      const path = join(folder, name);
      const rel = relative(dir, path);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (!REPO_SKIP.has(name) && !name.startsWith(".")) walk(path);
        continue;
      }
      if (SENSITIVE.test(rel) || stat.size > 400_000 || !(DOC_FILE.test(name) || CODE.test(name))) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes("\0")) continue;
      files++;
      bytes += text.length;
      if (DOC_FILE.test(name))
        sections.push(
          ...markdownSections(text, rel).map((s) => ({
            ...s,
            location: s.location === rel ? rel : `${rel} > ${s.location}`,
          })),
        );
      else sections.push({ location: rel, text });
    }
  };
  walk(dir);
  const readme = ["README.md", "readme.md", "README"].find((f) => existsSync(join(dir, f)));
  return {
    title: readme ? markdownSections(readFileSync(join(dir, readme), "utf8"))[0]?.location : undefined,
    sections,
  };
}

/** Lines, and very long lines cut at sentence ends, so a part never starts in the middle of a word. */
function units(text: string, size: number): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.length <= size) {
      out.push(t);
      continue;
    }
    let rest = t;
    while (rest.length > size) {
      const window = rest.slice(0, size);
      const cut = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! "),
        window.lastIndexOf("; "),
      );
      const at = cut > size * 0.4 ? cut + 1 : window.lastIndexOf(" ") > size * 0.4 ? window.lastIndexOf(" ") : size;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

/** Parts of about `size` characters made of whole lines, the last line repeated so no idea is cut in half. */
export function chunk(sections: Section[], size = 1100, overlap = 150): Section[] {
  const out: Section[] = [];
  for (const section of sections) {
    let current: string[] = [];
    let length = 0;
    const push = () => {
      const text = current.join("\n").trim();
      if (text) out.push({ location: section.location, text });
    };
    for (const unit of units(section.text, size)) {
      if (length && length + unit.length + 1 > size) {
        push();
        const last = current.at(-1) ?? "";
        current = last.length <= overlap ? [last] : [];
        length = current.join("\n").length;
      }
      current.push(unit);
      length += unit.length + 1;
    }
    push();
  }
  return out;
}
