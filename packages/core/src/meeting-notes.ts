import type { OrgMeeting } from "./meetings";
import { newCard, type OrgCard } from "./org";

/** The summarizer's answer in its three parts (# Summary, # Decisions, # Actions), as it is asked to write it. */
export function parseNotes(text: string): { summary: string; decisions: string[]; actions: string[] } {
  const part = (name: string) => text.split(new RegExp(`^#+\\s*${name}\\s*$`, "im"))[1]?.split(/^#+\s/m)[0] ?? "";
  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
  return {
    summary: part("Summary").trim() || text.trim(),
    decisions: lines(part("Decisions")),
    actions: lines(part("Actions")),
  };
}

/**
 * Where a meeting's results go (plan.md 20.8): each action becomes a card for the person it names
 * (else the meeting's first team), the summary and decisions go to the teams' channels, and the
 * decisions into the project's memory. Actions already made into cards are left as they are.
 */
export function meetingFollowUp(
  m: OrgMeeting,
  people: { id: string; username: string; displayName: string }[],
  me: string,
): {
  cards: OrgCard[];
  posts: { channel: string; text: string }[];
  decisions: { project: string; text: string }[];
  actions: OrgMeeting["actions"];
} {
  const cards: OrgCard[] = [];
  const actions = m.actions.map((a) => {
    if (a.card) return a;
    const who = people.find((p) => a.text.toLowerCase().startsWith((p.displayName || p.username).toLowerCase()));
    const to = who ? { assignee: who.id } : m.teams[0] ? { team: m.teams[0] } : {};
    const card = newCard(
      { title: a.text.slice(0, 200), origin: "meeting", ...to, ...(m.project ? { project: m.project } : {}) },
      me,
    );
    cards.push(card);
    return { text: a.text, ...(who ? { who: who.id } : {}), card: card.id };
  });
  const notes = `${m.title}\n${m.summary ?? ""}\n${m.decisions.map((d) => `- ${d}`).join("\n")}`;
  return {
    cards,
    posts: m.teams.map((team) => ({ channel: `team:${team}`, text: notes })),
    decisions: m.project ? m.decisions.map((text) => ({ project: m.project as string, text })) : [],
    actions,
  };
}
