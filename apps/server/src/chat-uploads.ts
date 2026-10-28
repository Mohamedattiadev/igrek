import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Hono } from "hono";

/** A transcript, a spreadsheet or a report is small; anything bigger belongs in the project. */
const MAX_UPLOAD = 25 * 1024 * 1024;

/**
 * Files added to a Claude chat with "+" (plan.md 19.1): a PDF, a text, a CSV, an Excel or Word file.
 * It is kept under Igrek's data folder for that chat and its path goes into the message, so
 * Claude Code reads it with its own tools (it reads PDFs as they are). Word, Excel and PowerPoint
 * are zip files of XML Claude cannot read directly: their text is written next to them, a CSV per
 * sheet, so a transcript's grades can be added up without converting anything by hand.
 */

/** The files of a zip, by name; only what is stored or deflated (what Office writes). */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const buf = Buffer.from(bytes);
  const out = new Map<string, Uint8Array>();
  // The end of central directory record: its signature, searched from the end.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return out;
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let n = 0; n < count && at + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, inflateRawSync(data));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#\d+|\w+);/g, (all, code: string) =>
    code[0] === "#" ? String.fromCodePoint(Number(code.slice(1))) : (ENTITIES[code] ?? all),
  );
const text = (xml: string) => decode(xml.replace(/<[^>]+>/g, ""));

/** A Word document's paragraphs, one per line, tables' cells split by tabs. */
function docxText(files: Map<string, Uint8Array>): string | undefined {
  const xml = files.get("word/document.xml");
  if (!xml) return undefined;
  return text(
    new TextDecoder()
      .decode(xml)
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:p>/g, "\n"),
  )
    .replace(/\t+\n/g, "\n")
    .trim();
}

/** "B12" → column 1 (0-based). */
const column = (ref: string) =>
  [...(ref.match(/^[A-Z]+/)?.[0] ?? "A")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** One row of a sheet as a CSV line: shared strings looked up, empty cells kept in their place. */
function csvRow(xml: string, shared: string[]): string {
  const cells: string[] = [];
  for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1] ?? "";
    const body = c[2] ?? "";
    const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
    const type = attrs.match(/\bt="(\w+)"/)?.[1];
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
    const value = type === "s" ? (shared[Number(raw)] ?? "") : type === "inlineStr" ? text(body) : decode(raw);
    cells[ref ? column(ref) : cells.length] = value;
  }
  return Array.from(cells, (v) => csvCell(v ?? "")).join(",");
}

/** Each sheet of a workbook as CSV, in the workbook's order, with its name. */
function xlsxSheets(files: Map<string, Uint8Array>): { name: string; csv: string }[] {
  const read = (path: string) => (files.has(path) ? new TextDecoder().decode(files.get(path)) : "");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text(m[1] ?? ""));
  const names = [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => decode(m[1] ?? ""));
  const sheets = [...files.keys()]
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  return sheets.map((path, i) => {
    const rows = [...read(path).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => csvRow(row[1] ?? "", shared));
    return { name: names[i] ?? `Sheet${i + 1}`, csv: rows.join("\n") };
  });
}

/** A presentation's slides, each under its number. */
function pptxText(files: Map<string, Uint8Array>): string | undefined {
  const slides = [...files.keys()]
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!slides.length) return undefined;
  return slides
    .map((f, i) => `# ${i + 1}\n${text(new TextDecoder().decode(files.get(f)).replace(/<\/a:p>/g, "\n")).trim()}`)
    .join("\n\n");
}

/** The readable copies of a Word, PowerPoint or Excel file: [suffix, content]; none for other files. */
function officeText(file: string, bytes: Uint8Array): [string, string][] {
  const ext = file.toLowerCase().split(".").pop();
  if (ext !== "docx" && ext !== "xlsx" && ext !== "pptx") return [];
  const files = unzip(bytes);
  if (ext === "docx") return [[".txt", docxText(files) ?? ""]];
  if (ext === "pptx") return [[".txt", pptxText(files) ?? ""]];
  return xlsxSheets(files).map((sheet) => [`.${safeName(sheet.name)}.csv`, sheet.csv]);
}

/** A name that is safe as a file name here. */
function safeName(name: string): string {
  const clean = [...name.replace(/[\\/:*?"<>|]/g, "_")].map((ch) => (ch.charCodeAt(0) < 32 ? "_" : ch)).join("");
  return clean.replace(/^\.+/, "_").trim().slice(0, 120) || "file";
}

/** Saves the file for the chat; returns its path and, for Office files, the readable copies beside it. */
export function saveUpload(dir: string, name: string, bytes: Uint8Array): { path: string; readable: string[] } {
  if (!bytes.length) throw new Error("The file is empty");
  if (bytes.length > MAX_UPLOAD) throw new Error("Files up to 25 MB can be added to a chat");
  mkdirSync(dir, { recursive: true });
  const file = safeName(name);
  const path = join(dir, file);
  writeFileSync(path, bytes);
  const readable: string[] = [];
  for (const [suffix, content] of officeText(file, bytes)) {
    if (!content.trim()) continue;
    const out = join(dir, `${file}${suffix}`);
    writeFileSync(out, content);
    readable.push(out);
  }
  return { path, readable };
}

/** "+" in a chat: the file is the body, its name the query; the answer names what Claude should read. */
export function registerChatUploadRoutes(app: Hono, dir: string): void {
  app.post("/api/chats/:id/files", async (c) => {
    const chat = c.req
      .param("id")
      .replace(/[^\w-]/g, "")
      .slice(0, 64);
    if (!chat) return c.json({ error: "Chat not found" }, 404);
    if (Number(c.req.header("content-length") ?? 0) > MAX_UPLOAD)
      return c.json({ error: "Files up to 25 MB can be added to a chat" }, 413);
    try {
      const saved = saveUpload(
        join(dir, chat),
        c.req.query("name") ?? "file",
        new Uint8Array(await c.req.arrayBuffer()),
      );
      return c.json({ name: c.req.query("name") ?? "file", ...saved });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
