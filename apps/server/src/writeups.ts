import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { languages } from "@godeye/i18n";
import JSZip from "jszip";
import type { Flows } from "./flows";
import type { Store } from "./store";

type Ask = (prompt: string) => Promise<string>;

const DAY = 86_400_000;
/** A model sometimes wraps Markdown in a code fence; the text itself is wanted. */
export function unfence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/);
  return (m?.[1] ?? t).trim();
}

const languageName = (code: string) => languages.find((l) => l.code === code)?.english ?? "English";

function git(cwd: string, args: string[]): string {
  const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", timeout: 15_000 });
  return p.exitCode === 0 ? p.stdout.toString().trim() : "";
}

export interface AdrRecord {
  number: number;
  title: string;
  date: string;
  context: string;
  decision: string;
  consequences: string;
}

/** An ADR in the usual Michael Nygard format. */
export function adrMarkdown(a: AdrRecord): string {
  return `# ${a.number}. ${a.title}

Date: ${a.date}

## Status

Accepted

## Context

${a.context}

## Decision

${a.decision}

## Consequences

${a.consequences}
`;
}

export function adrFileName(a: Pick<AdrRecord, "number" | "title">): string {
  const slug = a.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${String(a.number).padStart(4, "0")}-${slug || "decision"}.md`;
}

/**
 * Things God Eye writes up from what already happened (plan.md 13.2): release notes from commits,
 * sessions and merged team runs; ADRs from the decisions in memory; the end-of-day note.
 */
export class Writeups {
  constructor(
    private readonly db: Database,
    private readonly store: Store,
    private readonly flows: Flows,
    private readonly ask: Ask,
  ) {}

  /** Release notes since the last tag (or two weeks), in words users understand. */
  async releaseNotes(
    projectId: string,
    language: string,
  ): Promise<{ markdown: string; since: string; commits: number }> {
    const project = this.store.projectRow(projectId);
    if (!project) throw new Error("Project not found");
    const isGit = existsSync(join(project.path, ".git"));
    const tag = isGit ? git(project.path, ["describe", "--tags", "--abbrev=0"]) : "";
    const tagAt = tag ? Number(git(project.path, ["log", "-1", "--format=%ct", tag])) * 1000 : 0;
    const from = tagAt || Date.now() - 14 * DAY;
    const commits = this.store.commitsBetween(projectId, from, Date.now());
    const sessions = this.store.sessionsBetween(projectId, from, Date.now());
    const runs = this.flows.list(projectId).filter((r) => r.status === "merged" && r.updatedAt >= from);
    if (!commits.length && !runs.length) throw new Error("Nothing changed since the last release");
    const prompt = [
      `Write release notes for the users of "${project.name}" in ${languageName(language)}.`,
      "Sections (skip empty ones): New, Improved, Fixed. Short bullet points in plain words a user understands: what they can do now, not how the code changed. Merge related commits into one point. Leave out internal changes (refactors, tests, tooling) unless users notice them. No invented features. Markdown only, starting with a level-2 heading with today's date.",
      `Commits since ${tag || new Date(from).toISOString().slice(0, 10)}:`,
      ...commits.slice(0, 200).map((c) => `- ${c.subject}`),
      runs.length ? "Work the AI team finished and you merged:" : "",
      ...runs.slice(0, 30).map((r) => `- ${r.request.split("\n")[0]}`),
      sessions.length ? "Session titles (context only):" : "",
      ...sessions.slice(0, 40).map((s) => `- ${s.summary?.title ?? s.title ?? ""}`),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      markdown: unfence(await this.ask(prompt)),
      since: tag || new Date(from).toISOString().slice(0, 10),
      commits: commits.length,
    };
  }

  /** The decisions in memory as ADRs: context and consequences written by the small model, the decision kept as it is. */
  async adrs(projectId: string, language: string): Promise<AdrRecord[]> {
    const decisions = this.db
      .query(
        "SELECT id, text, created_at, source_session FROM memory_items WHERE project_id = ? AND section = 'decision' AND status = 'active' ORDER BY created_at",
      )
      .all(projectId) as { id: string; text: string; created_at: number; source_session: string | null }[];
    if (!decisions.length) throw new Error("No decisions in this project's memory yet");
    const list = decisions.slice(0, 40);
    let written: { title?: string; context?: string; consequences?: string }[] = [];
    try {
      const reply = await this.ask(
        [
          `These are architecture decisions of a software project. For each, in ${languageName(language)}, write a short title (max 8 words), the context (why the decision was needed, 1-3 sentences) and the consequences (what follows from it, good and bad, 1-3 sentences). Only what the text supports; when unknown, say what would need to be checked.`,
          'Answer with a JSON array, one object per decision in the same order: [{"title":"…","context":"…","consequences":"…"}]',
          ...list.map((d, i) => `${i + 1}. ${d.text}`),
        ].join("\n"),
      );
      const start = reply.indexOf("[");
      const end = reply.lastIndexOf("]");
      written = start >= 0 ? (JSON.parse(reply.slice(start, end + 1)) as typeof written) : [];
    } catch {
      written = [];
    }
    return list.map((d, i) => ({
      number: i + 1,
      title: written[i]?.title?.trim() || d.text.split(/[.!?\n]/)[0]?.slice(0, 80) || "Decision",
      date: new Date(d.created_at).toISOString().slice(0, 10),
      context: written[i]?.context?.trim() || "Recorded from an AI session in God Eye.",
      decision: d.text,
      consequences: written[i]?.consequences?.trim() || "To be written.",
    }));
  }

  async adrZip(records: AdrRecord[], projectName: string): Promise<Uint8Array> {
    const zip = new JSZip();
    const folder = zip.folder("docs/adr") as JSZip;
    for (const r of records) folder.file(adrFileName(r), adrMarkdown(r));
    folder.file(
      "README.md",
      `# Architecture decisions of ${projectName}\n\n${records.map((r) => `- [${r.number}. ${r.title}](${adrFileName(r)}) (${r.date})`).join("\n")}\n`,
    );
    return zip.generateAsync({ type: "uint8array" });
  }

  /** The end-of-day note: what got done today, what's next, where it's stuck. */
  async dayNote(language: string, now = Date.now()): Promise<string> {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const lines: string[] = [];
    for (const p of this.store.listProjects().filter((x) => !x.hidden && x.status !== "archived")) {
      const commits = this.store.commitsBetween(p.id, start.getTime(), now);
      const sessions = this.store.sessionsBetween(p.id, start.getTime(), now);
      const runs = this.flows.list(p.id).filter((r) => r.updatedAt >= start.getTime());
      if (!commits.length && !sessions.length && !runs.length) continue;
      lines.push(`Project ${p.name}:`);
      for (const c of commits.slice(0, 20)) lines.push(`- commit: ${c.subject}`);
      for (const s of sessions.slice(0, 10)) {
        const text = s.summary?.texts[language] ?? s.summary?.texts.en;
        lines.push(
          `- session: ${s.summary?.title ?? s.title ?? ""}${text?.left.length ? ` (left: ${text.left.join("; ")})` : ""}`,
        );
      }
      for (const r of runs.slice(0, 10)) lines.push(`- team run (${r.status}): ${r.request.split("\n")[0]}`);
    }
    if (!lines.length) throw new Error("Nothing happened in your projects today");
    return unfence(
      await this.ask(
        [
          `Write my end-of-day note for the team in ${languageName(language)}, from today's work below. Three short sections whose headings mean "Today", "Tomorrow" and "Stuck", written in ${languageName(language)} (write the word for "nothing" when nothing is stuck). Group by project, at most five bullet points per project per section, plain words, merge small related items. Only what the data supports. Plain Markdown, no code fence.`,
          ...lines,
        ].join("\n"),
      ),
    ).trim();
  }
}
