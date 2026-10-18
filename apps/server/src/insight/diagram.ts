import type { DiagramSet } from "@igrek/core";
import type { Snapshot } from "./snapshot";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|py)$/;
const MAX_NODES = 16;

/** The part a file belongs to: a workspace package, or a top-level source folder. */
export function groupOf(path: string): string {
  const parts = path.split("/");
  if (parts.length > 2 && /^(apps|packages|services|libs|modules|crates)$/.test(parts[0] ?? ""))
    return `${parts[0]}/${parts[1]}`;
  if (parts.length > 2 && parts[0] === "src") return `src/${parts[1]}`;
  return parts.length > 1 ? (parts[0] ?? ".") : ".";
}

function resolveRelative(from: string, spec: string): string {
  const base = from.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "..") base.pop();
    else if (seg !== ".") base.push(seg);
  }
  return base.join("/");
}

const safeId = (name: string) => `n_${name.replace(/[^A-Za-z0-9]/g, "_")}`;
const label = (name: string) => name.replace(/"/g, "'");

/** Which part imports which, from the import statements themselves. */
function architectureDiagram(snap: Snapshot): string | undefined {
  const workspace = new Map<string, string>();
  for (const p of snap.packages) {
    const name = p.json.name;
    if (typeof name === "string" && p.path.includes("/")) workspace.set(name, groupOf(p.path));
  }
  const edges = new Map<string, number>();
  const sizes = new Map<string, number>();
  for (const f of snap.files) {
    if (!SOURCE.test(f.path) || !f.text || /\.(test|spec)\./.test(f.path)) continue;
    const from = groupOf(f.path);
    sizes.set(from, (sizes.get(from) ?? 0) + 1);
    for (const m of f.text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
      const spec = m[1] ?? "";
      let to: string | undefined;
      if (spec.startsWith(".")) to = groupOf(`${resolveRelative(f.path, spec)}/x`);
      else {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        to = pkg ? workspace.get(pkg) : undefined;
      }
      if (to && to !== from) edges.set(`${from}\0${to}`, (edges.get(`${from}\0${to}`) ?? 0) + 1);
    }
  }
  const nodes = [...sizes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NODES)
    .map(([n]) => n);
  if (nodes.length < 2) return undefined;
  const keep = new Set(nodes);
  const lines = ["flowchart LR"];
  for (const n of nodes) lines.push(`  ${safeId(n)}["${label(n)} (${sizes.get(n)})"]`);
  for (const [key, count] of edges) {
    const [from, to] = key.split("\0") as [string, string];
    if (keep.has(from) && keep.has(to)) lines.push(`  ${safeId(from)} -->|${count}| ${safeId(to)}`);
  }
  return lines.join("\n");
}

/** True when the match sits on a comment line (an example, not a real table). */
function inComment(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  return /^\s*(\/\/|\*|#|--)/.test(text.slice(lineStart, index));
}

/** Tables and their links, from SQL migrations and common ORM definitions. */
export function databaseDiagram(snap: Snapshot): string | undefined {
  const tables = new Map<string, Set<string>>();
  const links = new Set<string>();
  const add = (table: string, column?: string) => {
    const t = table.toLowerCase();
    if (!tables.has(t)) tables.set(t, new Set());
    if (column) tables.get(t)?.add(column);
  };
  for (const f of snap.files) {
    if (!f.text) continue;
    // CREATE TABLE name ( col type, … ) and ALTER TABLE name ADD COLUMN col
    for (const m of f.text.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\)\s*;?\s*(?:\n|`|$)/gi,
    )) {
      const table = m[1] ?? "";
      if (inComment(f.text, m.index ?? 0)) continue;
      add(table);
      for (const col of (m[2] ?? "").split(/,\s*\n|\n/)) {
        const c = col.trim().match(/^["`]?(\w+)["`]?\s+\w+/);
        if (c?.[1] && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|INDEX)$/i.test(c[1])) add(table, c[1]);
        const ref = col.match(/REFERENCES\s+["`]?(\w+)/i);
        if (ref?.[1]) links.add(`${table.toLowerCase()}\0${ref[1].toLowerCase()}`);
      }
    }
    for (const m of f.text.matchAll(/ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+COLUMN\s+["`]?(\w+)/gi))
      if (m[1] && !inComment(f.text, m.index ?? 0)) add(m[1], m[2]);
    // Prisma: model Name { field Type … @relation }
    if (f.path.endsWith(".prisma"))
      for (const m of f.text.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
        const model = m[1] ?? "";
        add(model);
        for (const line of (m[2] ?? "").split("\n")) {
          const field = line.trim().match(/^(\w+)\s+(\w+)/);
          if (field?.[1] && !field[1].startsWith("@")) add(model, field[1]);
          if (field?.[2] && /@relation/.test(line)) links.add(`${model.toLowerCase()}\0${field[2].toLowerCase()}`);
        }
      }
    // Drizzle: sqliteTable("name", …) / pgTable / mysqlTable
    for (const m of f.text.matchAll(/(?:sqlite|pg|mysql)Table\(\s*["'](\w+)["']/g))
      if (m[1] && !inComment(f.text, m.index ?? 0)) add(m[1]);
  }
  if (tables.size === 0) return undefined;
  const lines = ["erDiagram"];
  for (const [table, columns] of [...tables.entries()].slice(0, 30)) {
    const cols = [...columns].slice(0, 8);
    lines.push(
      cols.length ? `  ${table} {\n${cols.map((c) => `    x ${c}`).join("\n")}\n  }` : `  ${table} {\n    x id\n  }`,
    );
  }
  for (const key of links) {
    const [from, to] = key.split("\0") as [string, string];
    if (tables.has(from) && tables.has(to)) lines.push(`  ${to} ||--o{ ${from} : has`);
  }
  return lines.join("\n");
}

export function diagrams(snap: Snapshot): DiagramSet {
  return { architecture: architectureDiagram(snap), database: databaseDiagram(snap) };
}
