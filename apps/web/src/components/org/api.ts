import type { OrgState, OrgStructure, ProjectGlance, TeamMember, TimelineItem } from "@igrek/core";
import type { CallTransport } from "../meet/call";

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
  /** The projects' part of the timeline (sessions, commits, decisions, messages); the company's part comes from state. */
  history: TimelineItem[];
  /** More that waits for a yes: runs ready to merge (Igrek) and people past their budget. */
  approvals?: { id: string; title: string; kind: "merge" | "budget"; link?: string }[];
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
  /** Meetings (plan.md 20.8): how a call reaches the hub. */
  call?: CallTransport;
  /** A big call's right to join the team's router (LiveKit), when one is set up. */
  sfu?: (room: string) => Promise<{ url: string; token: string }>;
  /** A one-time link for someone outside the team. */
  guestLink?: (room: string) => Promise<string>;
  /** The hub's web page, where a guest's link opens. */
  hubUrl?: string;
  /** The address that opens a meeting straight into its call, for "open in a new tab". */
  meetingLink?: (id: string) => string;
  /** Speech to text on this computer (Whisper); only in Igrek. */
  transcribe?: (audio: Blob) => Promise<string>;
  /** Questions to the history by words and by meaning (a local model); only in Igrek. */
  ask?: (question: string) => Promise<TimelineItem[]>;
  /** Test users (personas) try a project's preview; only in Igrek, which runs the browser for them. */
  testers?: (projectKey: string, url: string, task: string) => Promise<unknown>;
  /** A meeting's decision into the project's memory; only in Igrek. */
  addDecision?: (projectKey: string, text: string) => Promise<unknown>;
}

export const nameOf = (view: OrgView, id?: string): string => {
  if (!id) return "";
  if (id.startsWith("bot:")) return `@${id.slice(4)}`;
  const p = view.people.find((x) => x.id === id);
  return p?.displayName || p?.username || id.slice(0, 6);
};

export const teamName = (view: OrgView, id?: string): string =>
  view.structure.teams.find((t) => t.id === id)?.name ?? "";
