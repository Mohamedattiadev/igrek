import type { Database } from "bun:sqlite";
import type { TimelineItem } from "@igrek/core";

const LIMIT = 2000;

/**
 * The projects' part of the timeline on this computer (plan.md 20.9): work sessions (never private
 * ones), commits, decisions and the team chat's messages. With the company stream's part
 * (orgItems) it makes the one timeline the company page shows and answers questions from.
 */
export function projectHistory(db: Database, projects: { id: string; key: string }[], me: string): TimelineItem[] {
  if (!projects.length) return [];
  const ids = JSON.stringify(projects.map((p) => p.id));
  const keyOf = new Map(projects.map((p) => [p.id, p.key]));
  const sessions = db
    .query(
      `SELECT id, project_id, title, author_id, updated_at FROM sessions
       WHERE private = 0 AND project_id IN (SELECT value FROM json_each(?)) ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(ids, LIMIT) as {
    id: string;
    project_id: string;
    title: string | null;
    author_id: string | null;
    updated_at: number;
  }[];
  const commits = db
    .query(
      `SELECT project_id, hash, author, subject, at FROM commits
       WHERE project_id IN (SELECT value FROM json_each(?)) ORDER BY at DESC LIMIT ?`,
    )
    .all(ids, LIMIT) as { project_id: string; hash: string; author: string; subject: string; at: number }[];
  const decisions = db
    .query(
      `SELECT id, project_id, text, author_id, COALESCE(updated_at, created_at) AS at FROM memory_items
       WHERE section IN ('decision', 'convention') AND status != 'rejected' AND project_id IN (SELECT value FROM json_each(?))
       ORDER BY at DESC LIMIT ?`,
    )
    .all(ids, LIMIT) as { id: string; project_id: string; text: string; author_id: string | null; at: number }[];
  const messages = db
    .query(
      `SELECT id, project_id, target_id, author_id, text, at, previous FROM comments
       WHERE target_kind = 'channel' AND bot = 0 AND project_id IN (SELECT value FROM json_each(?))
       ORDER BY at DESC LIMIT ?`,
    )
    .all(ids, LIMIT) as {
    id: string;
    project_id: string;
    target_id: string;
    author_id: string | null;
    text: string;
    at: number;
    previous: string | null;
  }[];
  const project = (id: string) => keyOf.get(id) ?? "";
  return [
    ...sessions.map((s) => ({
      id: `session:${s.id}`,
      at: s.updated_at,
      kind: "session" as const,
      who: s.author_id ?? me,
      text: s.title ?? "",
      project: project(s.project_id),
      link: `session:${s.project_id}:${s.id}`,
    })),
    ...commits.map((c) => ({
      id: `commit:${c.hash}`,
      at: c.at,
      kind: "commit" as const,
      who: c.author,
      text: c.subject,
      project: project(c.project_id),
    })),
    ...decisions.map((d) => ({
      id: `decision:${d.id}`,
      at: d.at,
      kind: "decision" as const,
      who: d.author_id ?? me,
      text: d.text,
      project: project(d.project_id),
    })),
    ...messages.map((m) => ({
      id: `message:${m.id}`,
      at: m.at,
      kind: "message" as const,
      who: m.author_id ?? me,
      text: m.text,
      project: project(m.project_id),
      link: `channel:${m.target_id}`,
      ...(m.previous ? { previous: JSON.parse(m.previous) as { text: string; at: number }[] } : {}),
    })),
  ];
}
