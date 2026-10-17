import type { TaskStatus } from "@godeye/core";
import type { Board } from "./board";

export type ImportSource = "trello" | "jira" | "linear" | "notion" | "github";
export interface ImportedCard {
  title: string;
  description: string;
  status: TaskStatus;
  /** "jira PROJ-12", a link back. */
  origin: string;
}

/** CSV as exported by Jira, Linear and Notion: quoted fields, commas and newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  // Jira repeats some column names (several "Labels"): the first one wins.
  return body.map((r) => {
    const out: Record<string, string> = {};
    head.forEach((h, i) => {
      if (!(h in out)) out[h.trim()] = r[i] ?? "";
    });
    return out;
  });
}

/** Columns and states of other tools mapped to the board's four columns. */
export function mapStatus(status: string): TaskStatus {
  const s = status.toLowerCase();
  // "Not started" contains "started": the waiting states are checked first.
  if (/not started|unstarted|backlog|to ?do|planned|başlanmadı|yapılacak/.test(s)) return "todo";
  if (/done|closed|complete|resolved|shipped|merged|bitti|tamam|kapandı|canceled|cancelled/.test(s)) return "done";
  if (/review|qa|testing|incele/.test(s)) return "review";
  if (/progress|doing|started|active|develop|yapılıyor|devam/.test(s)) return "doing";
  return "todo";
}

const pick = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.toLowerCase() === n.toLowerCase());
    if (key && row[key]?.trim()) return row[key]?.trim() ?? "";
  }
  return "";
};

export function readImport(source: ImportSource, text: string): ImportedCard[] {
  if (source === "trello") {
    const data = JSON.parse(text) as {
      lists?: { id: string; name: string; closed?: boolean }[];
      cards?: { name: string; desc?: string; idList: string; closed?: boolean; shortUrl?: string }[];
    };
    const lists = new Map((data.lists ?? []).map((l) => [l.id, l]));
    return (data.cards ?? [])
      .filter((c) => !c.closed && !lists.get(c.idList)?.closed)
      .map((c) => ({
        title: c.name,
        description: [c.desc ?? "", c.shortUrl ?? ""].filter(Boolean).join("\n\n"),
        status: mapStatus(lists.get(c.idList)?.name ?? ""),
        origin: `trello ${lists.get(c.idList)?.name ?? ""}`.trim(),
      }));
  }
  if (source === "github") {
    const data = JSON.parse(text) as {
      items?: {
        title?: string;
        status?: string;
        content?: { title?: string; body?: string; url?: string; number?: number };
      }[];
    };
    return (data.items ?? []).map((it) => ({
      title: it.content?.title ?? it.title ?? "",
      description: [it.content?.body ?? "", it.content?.url ?? ""].filter(Boolean).join("\n\n"),
      status: mapStatus(it.status ?? ""),
      origin: it.content?.number ? `github #${it.content.number}` : "github project",
    }));
  }
  const rows = parseCsv(text);
  return rows.map((r) => {
    if (source === "jira")
      return {
        title: pick(r, "Summary"),
        description: [pick(r, "Description"), pick(r, "Issue key") ? `Jira: ${pick(r, "Issue key")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        status: mapStatus(pick(r, "Status")),
        origin: `jira ${pick(r, "Issue key")}`.trim(),
      };
    if (source === "linear")
      return {
        title: pick(r, "Title"),
        description: [pick(r, "Description"), pick(r, "ID") ? `Linear: ${pick(r, "ID")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        status: mapStatus(pick(r, "Status")),
        origin: `linear ${pick(r, "ID")}`.trim(),
      };
    // Notion: the title column is "Name" (or the first column); other columns become the description.
    const title = pick(r, "Name", "Title", "Task") || (Object.values(r)[0] ?? "");
    const status = pick(r, "Status", "State");
    const rest = Object.entries(r)
      .filter(([k, v]) => v && !/^(name|title|task|status|state)$/i.test(k) && v !== title)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    return { title, description: rest, status: mapStatus(status), origin: "notion" };
  });
}

/** Cards already on the board (same title) are skipped, so an import can be repeated. */
export function importCards(
  board: Board,
  projectId: string,
  cards: ImportedCard[],
): { added: number; skipped: number } {
  const have = new Set(board.list(projectId).map((t) => t.title.trim().toLowerCase()));
  let added = 0;
  let skipped = 0;
  for (const c of cards.slice(0, 1000)) {
    const title = c.title.trim();
    if (!title || have.has(title.toLowerCase())) {
      skipped++;
      continue;
    }
    board.addImported(projectId, {
      title,
      description: c.description.slice(0, 4000),
      status: c.status,
      origin: c.origin.slice(0, 100),
    });
    have.add(title.toLowerCase());
    added++;
  }
  return { added, skipped };
}
