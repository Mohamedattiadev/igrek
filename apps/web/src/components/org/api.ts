import type { OrgState, OrgStructure, ProjectGlance, TeamMember } from "@igrek/core";

/**
 * What the company pages (plan.md 20.2-20.7) read: the same shape from Igrek's server (GET
 * /api/org) and from the hub's web page (built from its own decrypted copy), so one set of
 * components serves both.
 */
export interface OrgView {
  me: TeamMember;
  people: TeamMember[];
  online: string[];
  structure: OrgStructure;
  state: OrgState;
  /** Changes of mine still waiting for the hub. */
  waiting: number;
  projects: ProjectGlance[];
  live: { userId: string; project: string; title: string; tool: string }[];
}

/** How the pages write: the same calls in Igrek and in the browser. */
export interface OrgApi {
  view?: OrgView;
  act: (kind: string, value: Record<string, unknown>) => Promise<unknown>;
  post: (input: {
    channel: string;
    text: string;
    announce?: boolean;
    audience?: string[];
    card?: string;
  }) => Promise<unknown>;
  /** The hub's teams: "teams", "teams/<id>", "teams/<id>/members/<user>", "teams/<id>/projects/<key>". */
  teams: (method: string, path: string, body?: unknown) => Promise<unknown>;
  /** A short summary by this person's own Claude; only in Igrek on a computer. */
  summarize?: (facts: string, ask: string) => Promise<string>;
  /** Where a project opens: its page in Igrek or in the browser. */
  openProject?: (key: string) => void;
}

export const nameOf = (view: OrgView, id?: string): string => {
  if (!id) return "";
  if (id.startsWith("bot:")) return `@${id.slice(4)}`;
  const p = view.people.find((x) => x.id === id);
  return p?.displayName || p?.username || id.slice(0, 6);
};

export const teamName = (view: OrgView, id?: string): string =>
  view.structure.teams.find((t) => t.id === id)?.name ?? "";
