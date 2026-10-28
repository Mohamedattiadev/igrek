import { occurrences } from "./meetings";
import { fold, isOpen, type OrgState, type OrgStructure } from "./org";

/**
 * Everything that happened, on one timeline (plan.md 20.9): work sessions, cards and their steps,
 * messages, meetings and what was said in them, decisions, announcements, what the bots did. Each
 * Igrek and the hub's web page build it from what they could decrypt, so nobody's timeline holds
 * anything they could not read anyway (private sessions, others' direct messages, closed projects).
 */
export interface TimelineItem {
  id: string;
  at: number;
  kind: "session" | "card" | "message" | "meeting" | "said" | "decision" | "announcement" | "bot" | "commit";
  /** Who did it (hub id, or a name for older items). */
  who: string;
  text: string;
  project?: string;
  team?: string;
  /** Where it opens: "card:<id>", "meeting:<id>", "session:<project>:<id>", "channel:<id>". */
  link?: string;
  /** Earlier versions, for whoever may see what changed. */
  previous?: { text: string; at: number }[];
}

/** The company stream's part of the timeline: card steps, posts, meetings and their lines. */
export function orgItems(state: OrgState): TimelineItem[] {
  return [
    ...Object.values(state.cards).flatMap(cardItems),
    ...Object.values(state.posts).flatMap(postItems),
    ...Object.values(state.meetings).flatMap(meetingItems),
  ];
}

function cardItems(c: OrgState["cards"][string]): TimelineItem[] {
  return c.history.map((h) => ({
    id: `card:${c.id}:${h.at}`,
    at: h.at,
    kind: "card" as const,
    who: h.by,
    text: `${c.title} (${h.what})`,
    ...(c.project ? { project: c.project } : {}),
    ...(c.team ? { team: c.team } : {}),
    link: `card:${c.id}`,
  }));
}

/** A message, an announcement or the bot's words; what people wrote to the bot stays between them. */
function postItems(p: OrgState["posts"][string]): TimelineItem[] {
  if (p.channel.startsWith("bot:") && !p.bot) return [];
  const text = p.say ? `${p.say.key}: ${Object.values(p.say.vars ?? {}).join(" · ")}` : p.text;
  const kind = p.announce ? "announcement" : p.bot ? "bot" : "message";
  return [
    {
      id: `post:${p.id}`,
      at: p.at,
      kind,
      who: p.by,
      text: p.deleted ? "" : text,
      ...(p.channel.startsWith("team:") ? { team: p.channel.slice(5) } : {}),
      link: `channel:${p.channel}`,
      ...(p.previous?.length ? { previous: p.previous } : {}),
    },
  ];
}

function meetingItems(m: OrgState["meetings"][string]): TimelineItem[] {
  const link = `meeting:${m.id}`;
  return [
    {
      id: link,
      at: m.start,
      kind: "meeting",
      who: m.by,
      text: [m.title, m.agenda, m.summary, ...m.decisions].filter(Boolean).join(" · "),
      ...(m.project ? { project: m.project } : {}),
      link,
    },
    ...m.decisions.map((d) => ({
      id: `${link}:d:${d.slice(0, 20)}`,
      at: m.updatedAt,
      kind: "decision" as const,
      who: m.by,
      text: `${d} (${m.title})`,
      link,
    })),
    ...m.transcript.map((l) => ({
      id: `said:${m.id}:${l.at}:${l.who}`,
      at: l.at,
      kind: "said" as const,
      who: l.who,
      text: l.text,
      link,
    })),
  ];
}

// ---- asking the past and the future -----------------------------------------------------------

const DAY = 86_400_000;
const STOP = new Set(
  "ne zaman kim kimin hangi nasil neler neyi icin ile ve veya bu su o bir mi mu mı mü da de ki the a an of to in on at for and or is was were did does do what when who which how this that".split(
    " ",
  ),
);

/**
 * Words that mean the same thing for a question, Turkish and English, by their roots: "sorun"
 * meets "çöktü" and "bug", "çözmüştü" meets "düzelttim" and "fixed", "bitti" meets "done".
 */
const SAME: string[][] = [
  ["sorun", "proble", "hata", "cokme", "coktu", "cokmu", "issue", "bug", "down", "crash", "ariza"],
  ["coz", "cozd", "cozmu", "duzel", "onar", "fix", "repair", "sildi", "kurdu", "solve"],
  ["bitti", "bitir", "tamam", "done", "finis", "compl", "kapan", "close"],
  ["sunuc", "serve", "makin", "host"],
  ["karar", "decis", "decid"],
  ["toplan", "meeti", "gorus"],
];

/** A word's root: its group's first root when it has one, else its first five letters. */
function rootOf(word: string): string {
  const group = SAME.find((g) => g.some((r) => word.startsWith(r)));
  return group?.[0] ?? word.slice(0, 5);
}

/** The words of a text that carry meaning, folded (no accents, lower case). */
function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** "geçen ay", "last week", "dün", "in March": the time a question is about, if it says. */
export function periodOf(question: string, now = Date.now()): { from: number; to: number } | undefined {
  const q = fold(question);
  if (/\b(dun|yesterday)\b/.test(q)) return { from: now - 2 * DAY, to: now - 0 };
  if (/\b(gecen hafta|last week)\b/.test(q)) return { from: now - 14 * DAY, to: now - 6 * DAY };
  if (/\b(bu hafta|this week)\b/.test(q)) return { from: now - 7 * DAY, to: now };
  if (/\b(gecen ay|last month)\b/.test(q)) return { from: now - 62 * DAY, to: now - 25 * DAY };
  if (/\b(bu ay|this month)\b/.test(q)) return { from: now - 31 * DAY, to: now };
  if (/\b(gelecek hafta|next week|haftaya)\b/.test(q)) return { from: now, to: now + 14 * DAY };
  return undefined;
}

/** Whether a question is about what is coming rather than what happened. */
export const aboutFuture = (question: string) =>
  /\b(gelecek|yaklasan|yetismeli|yetişmeli|var mi|kimin izni|izinde|next|coming|upcoming|due|on leave|tomorrow|yarin)\b/.test(
    fold(question),
  );

export interface Found {
  item: TimelineItem;
  score: number;
}

/**
 * The items that answer a question best: shared words (roots too, "çözmüştü" meets "çözdü"), more
 * for rarer words, and only within the time the question names. Newer ones win a tie.
 */
export function search(items: TimelineItem[], question: string, now = Date.now(), limit = 8): Found[] {
  const asked = [...new Set(words(question))];
  if (!asked.length) return [];
  const period = periodOf(question, now);
  const roots = [...new Set(asked.map(rootOf))];
  const docs = items.map((item) => ({ item, words: new Set(words(item.text).map(rootOf)) }));
  const df = roots.map((r) => docs.filter((d) => d.words.has(r)).length);
  const found: Found[] = [];
  for (const d of docs) {
    if (period && (d.item.at < period.from || d.item.at > period.to)) continue;
    let score = 0;
    roots.forEach((r, i) => {
      if (d.words.has(r)) score += Math.log(1 + items.length / (1 + (df[i] ?? 0)));
    });
    if (score > 0) found.push({ item: d.item, score });
  }
  return found.sort((a, b) => b.score - a.score || b.item.at - a.item.at).slice(0, limit);
}

/** "What is coming next week?", "what must be done by Friday?", "who is on leave?": from the calendar and due dates. */
export function upcoming(state: OrgState, question: string, now = Date.now()): TimelineItem[] {
  const q = fold(question);
  const period = periodOf(question, now) ?? { from: now, to: now + 7 * DAY };
  const out: TimelineItem[] = [];
  if (/\b(izin|izni|leave|away|vacation|tatil)/.test(q)) {
    for (const [who, a] of Object.entries(state.availability))
      for (const l of a.leave)
        if (l.to > now && l.from < period.to)
          out.push({
            id: `leave:${who}:${l.from}`,
            at: l.from,
            kind: "card",
            who,
            text: `leave until ${new Date(l.to).toDateString()}`,
          });
    return out.sort((a, b) => a.at - b.at);
  }
  for (const c of Object.values(state.cards))
    if (isOpen(c) && c.due && c.due >= period.from - DAY && c.due <= period.to)
      out.push({
        id: `due:${c.id}`,
        at: c.due,
        kind: "card",
        who: c.assignee ?? "",
        text: c.title,
        link: `card:${c.id}`,
      });
  for (const m of Object.values(state.meetings))
    for (const at of occurrences(m, period.from, period.to))
      out.push({ id: `meet:${m.id}:${at}`, at, kind: "meeting", who: m.by, text: m.title, link: `meeting:${m.id}` });
  return out.sort((a, b) => a.at - b.at);
}

/** A question's facts for whoever answers it (a person's own Claude in Igrek): numbered, dated, sourced. */
export function factsFor(found: TimelineItem[], nameOf: (id: string) => string): string {
  return found
    .map(
      (x, i) =>
        `[${i + 1}] ${new Date(x.at).toISOString().slice(0, 16).replace("T", " ")} ${x.kind} by ${nameOf(x.who) || x.who}: ${x.text}`,
    )
    .join("\n");
}

/** Who is in which team, for a timeline filtered by team. */
export function teamOfPerson(s: OrgStructure, who: string): string[] {
  return s.teams.filter((t) => t.members.includes(who)).map((t) => t.id);
}
