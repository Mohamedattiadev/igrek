/**
 * Project wiki and the whiteboard AI understands (plan.md 12). A drawing is read two ways: its
 * structure (boxes, arrows between them, texts, groups, frames) and its picture. Both go to the
 * model together, so "what is in this drawing" has an exact answer, not a guess from pixels.
 */
import type { DbTable } from "./data";

export interface WikiPage {
  id: string;
  projectId: string;
  /** "getting-started"; [[Getting started]] links resolve to it. */
  slug: string;
  title: string;
  body: string;
  updatedAt: number;
  author?: string;
}

export interface Board {
  id: string;
  projectId: string;
  /** A category page (plan.md 5) the board belongs to, if any. */
  category?: string;
  title: string;
  updatedAt: number;
  author?: string;
  /** Number of elements, for the list. */
  elements: number;
}

export interface BoardVersion {
  id: string;
  boardId: string;
  at: number;
  author?: string;
  elements: number;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

/** [[Page title]] links in a wiki page. */
export function wikiLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]\n|]{1,80})(?:\|[^\]\n]*)?\]\]/g)].map((m) => slugify(m[1] ?? ""));
}

/** The parts of an Excalidraw element Igrek reads. Anything else is ignored. */
export interface SceneElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  groupIds?: string[];
  frameId?: string | null;
  name?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  link?: string | null;
}

export interface SceneShape {
  id: string;
  kind: string;
  label: string;
  /** Rough place on the board, so "top left" and "below X" make sense. */
  at: { x: number; y: number };
  group?: string;
  frame?: string;
  link?: string;
}

export interface SceneStructure {
  shapes: SceneShape[];
  arrows: { from?: string; to?: string; label: string; kind: "arrow" | "line" }[];
  /** Text that is not inside a shape or on an arrow. */
  notes: { text: string; at: { x: number; y: number }; frame?: string }[];
  frames: { id: string; name: string }[];
  /** Hand-drawn strokes: only the picture shows what they mean. */
  freehand: number;
  images: number;
}

const SHAPES = new Set(["rectangle", "ellipse", "diamond", "frame", "magicframe", "image", "embeddable", "iframe"]);

export function describeScene(elements: SceneElement[]): SceneStructure {
  const live = elements.filter((e) => !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id, e]));
  const textOf = (e: SceneElement) => (e.originalText ?? e.text ?? "").trim();
  // Text bound to a container (a box, an arrow) is that container's label.
  const labels = new Map<string, string>();
  for (const e of live) if (e.type === "text" && e.containerId) labels.set(e.containerId, textOf(e));
  const frames = live
    .filter((e) => e.type === "frame" || e.type === "magicframe")
    .map((e) => ({ id: e.id, name: e.name?.trim() || labels.get(e.id) || "Frame" }));
  const frameName = (id?: string | null) => (id ? frames.find((f) => f.id === id)?.name : undefined);
  const round = (n: number) => Math.round(n / 10) * 10;
  const shapes: SceneShape[] = live
    .filter((e) => SHAPES.has(e.type) && e.type !== "frame" && e.type !== "magicframe")
    .map((e) => ({
      id: e.id,
      kind: e.type,
      label: labels.get(e.id) ?? "",
      at: { x: round(e.x), y: round(e.y) },
      ...(e.groupIds?.length ? { group: e.groupIds[e.groupIds.length - 1] } : {}),
      ...(frameName(e.frameId) ? { frame: frameName(e.frameId) } : {}),
      ...(e.link ? { link: e.link } : {}),
    }));
  const name = (id?: string) => {
    if (!id) return undefined;
    const el = byId.get(id);
    if (!el) return undefined;
    return labels.get(id) || (el.type === "text" ? textOf(el) : `(${el.type} ${id.slice(0, 4)})`);
  };
  const arrows = live
    .filter((e) => e.type === "arrow" || e.type === "line")
    .map((e) => ({
      ...(name(e.startBinding?.elementId) ? { from: name(e.startBinding?.elementId) } : {}),
      ...(name(e.endBinding?.elementId) ? { to: name(e.endBinding?.elementId) } : {}),
      label: labels.get(e.id) ?? "",
      kind: e.type as "arrow" | "line",
    }));
  const notes = live
    .filter((e) => e.type === "text" && !e.containerId && textOf(e))
    .map((e) => ({
      text: textOf(e),
      at: { x: round(e.x), y: round(e.y) },
      ...(frameName(e.frameId) ? { frame: frameName(e.frameId) } : {}),
    }));
  return {
    shapes,
    arrows,
    notes,
    frames,
    freehand: live.filter((e) => e.type === "freedraw").length,
    images: live.filter((e) => e.type === "image").length,
  };
}

/** The structure as plain lines a model reads reliably. */
export function sceneText(s: SceneStructure): string {
  const out: string[] = [];
  if (s.frames.length) out.push(`Frames: ${s.frames.map((f) => f.name).join(", ")}`);
  if (s.shapes.length) {
    out.push("Shapes:");
    for (const sh of s.shapes)
      out.push(
        `- ${sh.kind} "${sh.label || "(no text)"}" at (${sh.at.x}, ${sh.at.y})${sh.frame ? ` in frame "${sh.frame}"` : ""}${sh.group ? ` group ${sh.group.slice(0, 6)}` : ""}${sh.link ? ` link ${sh.link}` : ""}`,
      );
  }
  if (s.arrows.length) {
    out.push("Connections:");
    for (const a of s.arrows)
      out.push(
        `- ${a.from ?? "(nothing)"} ${a.kind === "arrow" ? "->" : "--"} ${a.to ?? "(nothing)"}${a.label ? ` : "${a.label}"` : ""}`,
      );
  }
  if (s.notes.length) {
    out.push("Free text:");
    for (const n of s.notes)
      out.push(`- "${n.text}" at (${n.at.x}, ${n.at.y})${n.frame ? ` in frame "${n.frame}"` : ""}`);
  }
  if (s.freehand) out.push(`Hand-drawn strokes: ${s.freehand} (read them from the picture)`);
  if (s.images) out.push(`Pasted images: ${s.images}`);
  return out.join("\n") || "The board is empty.";
}

const mid = (s: string) => s.replace(/[^\w]/g, "_");
const label = (s: string) => s.replace(/"/g, "'").replace(/[[\]{}<>]/g, " ");

/**
 * A database schema as a Mermaid flowchart: one box per table with its key columns, an arrow per
 * foreign key. A flowchart (not an ER diagram) because it becomes editable boxes on the board.
 */
export function schemaFlowchart(tables: DbTable[], limit = 30): string {
  const shown = tables.filter((t) => t.kind !== "view").slice(0, limit);
  const names = new Set(shown.map((t) => t.name));
  const lines = ["flowchart LR"];
  for (const t of shown) {
    const cols = t.columns
      .filter((c) => c.primary || c.references)
      .concat(t.columns.filter((c) => !c.primary && !c.references).slice(0, 4))
      .slice(0, 8)
      .map((c) => `${c.name}${c.primary ? " PK" : c.references ? " FK" : ""}`);
    lines.push(`  ${mid(t.name)}["${label(t.name)}<br>${cols.map(label).join("<br>")}"]`);
  }
  for (const t of shown)
    for (const c of t.columns) {
      const target = c.references?.split(".")[0];
      if (target && names.has(target)) lines.push(`  ${mid(t.name)} -->|${label(c.name)}| ${mid(target)}`);
    }
  return lines.join("\n");
}

/** The Mermaid block from a model's answer (```mermaid … ``` or the whole answer). */
export function mermaidFrom(answer: string): string | undefined {
  const fenced = answer.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  const code = (fenced?.[1] ?? answer).trim();
  return /^(flowchart|graph|sequenceDiagram|classDiagram)\b/.test(code) ? code : undefined;
}
