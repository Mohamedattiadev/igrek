import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { InboxNotice, ProjectListItem } from "@igrek/core";

/**
 * A comment that asks the AI for something, written in the user's own editor (plan.md 16.4, after
 * Aider's watch mode): "// ai: make this faster!" or "# cache this ai!" asks for a change, the same
 * with "?" asks a question. Any comment style: //, #, --, ;, /* and <!--.
 */
const MARKER = /\/\/|#|--|;|\/\*|<!--/g;
const ASK = /^ai[:,]?\s+(.+?)\s*([!?])$|^(.+?)\s+ai([!?])$/i;
const TEXT_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|dart|rb|php|cs|c|h|cpp|hpp|css|scss|html|vue|svelte|sql|sh|yaml|yml|toml|md)$/;
const POLL_MS = 20_000;
/** Projects worked on within this long are watched; others are left alone. */
const ACTIVE_FOR = 24 * 60 * 60_000;

export interface AiComment {
  file: string;
  line: number;
  ask: string;
  kind: "change" | "question";
}

export function findAiComments(file: string, text: string): AiComment[] {
  const out: AiComment[] = [];
  for (const [i, line] of text.split("\n").entries()) {
    // Every place a comment could start; the first whose text is a request wins.
    const m = [...line.matchAll(MARKER)]
      .map((marker) =>
        line
          .slice((marker.index ?? 0) + marker[0].length)
          .replace(/\s*(\*\/|-->)\s*$/, "")
          .trim(),
      )
      .map((body) => body.match(ASK))
      .find(Boolean);
    if (!m) continue;
    const ask = (m[1] ?? m[3] ?? "").trim();
    if (ask) out.push({ file, line: i + 1, ask, kind: (m[2] ?? m[4]) === "?" ? "question" : "change" });
  }
  return out;
}

/** Files git sees as changed or new: where a comment the user just typed can be. */
function changedFiles(root: string): string[] {
  const p = Bun.spawnSync(["git", "-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=normal"], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 5_000,
  });
  if (p.exitCode !== 0) return [];
  return p.stdout
    .toString()
    .split("\0")
    .filter((entry) => entry.length > 3 && entry[0] !== "D" && entry[1] !== "D")
    .map((entry) => entry.slice(3))
    .filter((file) => TEXT_FILE.test(file))
    .slice(0, 200);
}

/** The AI comments in one file; a file too large or gone by now has none. */
function commentsIn(path: string, file: string): AiComment[] {
  try {
    return statSync(path).size > 512_000 ? [] : findAiComments(file, readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/** Looks at the changed files of active projects every POLL_MS and turns AI comments into inbox items. */
export class AiComments {
  private found = new Map<string, { projectId: string; projectName: string; comment: AiComment; at: number }>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly projects: () => ProjectListItem[],
    /** The interface language, so the chat's draft reads in it. */
    private readonly language: () => string = () => "en",
  ) {}

  start(): void {
    this.timer = setInterval(() => this.scan(), POLL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  scan(now = Date.now()): void {
    const seen = new Set<string>();
    for (const project of this.projects())
      if (!project.hidden && now - project.lastActivity <= ACTIVE_FOR && existsSync(join(project.path, ".git")))
        this.scanProject(project, now, seen);
    // A comment that is gone (done, or deleted) is no longer asked about.
    for (const key of this.found.keys()) if (!seen.has(key)) this.found.delete(key);
  }

  private scanProject(project: ProjectListItem, now: number, seen: Set<string>): void {
    for (const file of changedFiles(project.path)) {
      for (const comment of commentsIn(join(project.path, file), file)) {
        const key = `${project.id}:${file}:${comment.ask}`;
        seen.add(key);
        if (!this.found.has(key))
          this.found.set(key, { projectId: project.id, projectName: project.name, comment, at: now });
      }
    }
  }

  notices(): InboxNotice[] {
    return [...this.found.entries()].map(([key, f]) => ({
      id: `ai-comment:${key}`,
      kind: "aiComment" as const,
      projectId: f.projectId,
      projectName: f.projectName,
      detail: `${f.comment.file}:${f.comment.line} ${f.comment.ask}`,
      at: f.at,
      link: `/c/new?project=${encodeURIComponent(f.projectId)}&draft=${encodeURIComponent(draftFor(f.comment, this.language()))}`,
    }));
  }
}

/** The message a chat starts with: where, what, and to remove the comment afterwards. */
export function draftFor(c: AiComment, language = "en"): string {
  if (language === "tr")
    return c.kind === "question"
      ? `${c.file} dosyasında, ${c.line}. satırda bir yorumla soru bıraktım: ${c.ask}? Cevapla; hiçbir şeyi değiştirme.`
      : `${c.file} dosyasında, ${c.line}. satırda bir yorum bıraktım: ${c.ask}. Bunu yap, sonra o yorumu sil.`;
  return c.kind === "question"
    ? `In ${c.file}, line ${c.line}, I left a question in a comment: ${c.ask}? Answer it; change nothing.`
    : `In ${c.file}, line ${c.line}, I left a comment: ${c.ask}. Do it, then remove that comment.`;
}
