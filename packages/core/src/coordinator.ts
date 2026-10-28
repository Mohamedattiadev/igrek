import {
  fold,
  isOpen,
  isOverdue,
  loadOf,
  type OrgAvailability,
  type OrgCard,
  type OrgPriority,
  type OrgState,
  type OrgStructure,
  type OrgTeam,
} from "./org";

/**
 * The coordinator bot (plan.md 20.7): the manager writes a plain sentence, the bot opens the card,
 * picks the team and the person (the team's responsibility, the person's load, whether they are
 * away), says why in one line, and then follows it up so nobody has to chase anyone. It reads
 * Turkish and English without a model; what it says is a key and values, so each reader sees it in
 * their own language.
 */

export interface CoordPerson {
  id: string;
  username: string;
  displayName: string;
}

/** What the bot says: a text key (orgBot.<key>) and its values. */
export interface BotSay {
  key: string;
  vars?: Record<string, string | number>;
}

export type Understood =
  | {
      kind: "task";
      title: string;
      team?: string;
      person?: string;
      due?: number;
      priority: OrgPriority;
    }
  | { kind: "question"; text: string; team?: string; person?: string; since?: number }
  | { kind: "ask"; say: BotSay; draft: { title: string; due?: number; priority: OrgPriority; options: string[] } };

const DAYS: Record<string, number> = {
  pazar: 0,
  sunday: 0,
  pazartesi: 1,
  monday: 1,
  sali: 2,
  tuesday: 2,
  carsamba: 3,
  wednesday: 3,
  persembe: 4,
  thursday: 4,
  cuma: 5,
  friday: 5,
  cumartesi: 6,
  saturday: 6,
};
const QUESTION = /\?\s*$|^(ne|neler|neyi|kim|kimin|hangi|nasil|kac|what|which|who|how|when|ne zaman)\b/;
const FILLER =
  /\b(bitsin|bitirilsin|yapilsin|yapsin|baksin|halletsin|lazim|gerek|olsun|should|must|needs? to|be done|by|until|icin|ve|and|to|for)\b/g;

/** The end of a working day (18:00) that is `days` from now, on the reader's clock. */
function endOfDay(now: number, days: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
}

/** "Cuma'ya", "yarın", "friday", "next week", "30.10": when it should be done. */
export function dueIn(text: string, now = Date.now()): number | undefined {
  const t = fold(text);
  if (/\b(bugun|today)\b/.test(t)) return endOfDay(now, 0);
  if (/\b(yarin|tomorrow)\b/.test(t)) return endOfDay(now, 1);
  if (/\b(haftaya|next week|gelecek hafta)\b/.test(t)) return endOfDay(now, 7);
  const date = t.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (date) {
    const d = new Date(now);
    const at = new Date(d.getFullYear(), Number(date[2]) - 1, Number(date[1]), 18).getTime();
    return at < now - 86_400_000
      ? new Date(d.getFullYear() + 1, Number(date[2]) - 1, Number(date[1]), 18).getTime()
      : at;
  }
  for (const [word, day] of Object.entries(DAYS))
    if (new RegExp(`\\b${word}`).test(t)) {
      const today = new Date(now).getDay();
      return endOfDay(now, (day - today + 7) % 7 || 7);
    }
  return undefined;
}

function priorityIn(text: string): OrgPriority {
  const t = fold(text);
  if (/\b(acil|urgent|asap|hemen|immediately)\b/.test(t)) return "urgent";
  if (/\b(onemli|important|oncelikli|priority)\b/.test(t)) return "high";
  return "normal";
}

/** The people a text names: "@kerim", or "Kerim" as a word. */
function personIn(text: string, people: CoordPerson[]): string | undefined {
  const t = fold(text);
  for (const p of people) {
    const names = [p.username, ...p.displayName.split(/\s+/).filter((w) => w.length > 2)].map(fold);
    if (names.some((n) => new RegExp(`(^|[\\s@])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\b|'|’)`).test(t)))
      return p.id;
  }
  return undefined;
}

/** How well a team fits a text: its name, then the words of what it is responsible for. */
function teamScore(team: OrgTeam, text: string): number {
  const t = fold(text);
  if (new RegExp(`(^|[\\s@])${fold(team.name)}\\b`).test(t)) return 10;
  // Word roots (their first five letters), so "mobilde" meets "mobile" and "butonu" meets "buton".
  const root = (w: string) => w.slice(0, 5);
  const said = new Set(
    t
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3)
      .map(root),
  );
  const words = new Set(
    fold(team.description)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3)
      .map(root),
  );
  return [...words].filter((w) => said.has(w)).length;
}

function teamsFor(s: OrgStructure, text: string): { team: OrgTeam; score: number }[] {
  return s.teams
    .map((team) => ({ team, score: teamScore(team, text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** A card's title: the sentence without who, when and the words around them. */
function titleOf(text: string, people: CoordPerson[], s: OrgStructure): string {
  let t = text.replace(/(^|\s)@[\p{L}\p{N}._-]+/gu, " ");
  for (const p of people)
    t = t.replace(new RegExp(`\\b${p.displayName.split(/\s+/)[0]}\\b('[a-zığüşöç]+)?`, "giu"), " ");
  for (const team of s.teams) t = t.replace(new RegExp(`\\b${team.name}\\b('[a-zığüşöç]+)?`, "giu"), " ");
  t = t
    .replace(/\b(bugün|yarın|haftaya|today|tomorrow|next week|gelecek hafta)\b/giu, " ")
    .replace(
      /\b(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar|monday|tuesday|wednesday|thursday|friday|saturday|sunday)('[a-zığüşöç]+|ya|ye|a|e)?\b/giu,
      " ",
    )
    .replace(/\b(acil|urgent|asap|hemen)\b/giu, " ")
    .replace(/\b\d{1,2}[./]\d{1,2}\b/g, " ");
  const words = t.split(/\s+/).filter((w) => w && !new RegExp(`^${FILLER.source}$`).test(fold(w)));
  const title = words
    .join(" ")
    .replace(/[,.;:]+$/, "")
    .trim();
  return title ? title.charAt(0).toLocaleUpperCase() + title.slice(1) : text.trim().slice(0, 200);
}

/**
 * What the manager wants: a card (with team, person, due date, priority), a question about the
 * work, or, when it cannot tell whose it is, the one question to ask back.
 */
export function understand(
  raw: string,
  ctx: { structure: OrgStructure; people: CoordPerson[]; botHandle: string; now?: number },
): Understood {
  const now = ctx.now ?? Date.now();
  const text = raw.replace(new RegExp(`^\\s*@${ctx.botHandle}\\b[,:]?`, "i"), "").trim();
  const person = personIn(text, ctx.people);
  const teams = teamsFor(ctx.structure, text);
  if (QUESTION.test(fold(text)))
    return {
      kind: "question",
      text,
      ...(teams[0] ? { team: teams[0].team.id } : {}),
      ...(person ? { person } : {}),
      ...(/\b(gecen hafta|last week|bu hafta|this week)\b/.test(fold(text)) ? { since: now - 7 * 86_400_000 } : {}),
    };
  const base = { title: titleOf(text, ctx.people, ctx.structure), due: dueIn(text, now), priority: priorityIn(text) };
  const team = person
    ? (ctx.structure.teams.find((t) => t.members.includes(person) && teams.some((x) => x.team.id === t.id)) ??
      ctx.structure.teams.find((t) => t.members.includes(person)))
    : teams[0]?.team;
  const close = teams.length > 1 && teams[0]?.score === teams[1]?.score;
  if (!person && (!team || close)) {
    const options = (close ? teams.slice(0, 3).map((x) => x.team) : ctx.structure.teams.slice(0, 4)).map((t) => t.id);
    if (options.length)
      return {
        kind: "ask",
        say: { key: "whichTeam", vars: { teams: options.map((id) => teamName(ctx.structure, id)).join(" / ") } },
        draft: { ...base, options },
      };
  }
  return { kind: "task", ...base, ...(team ? { team: team.id } : {}), ...(person ? { person } : {}) };
}

const teamName = (s: OrgStructure, id: string) => s.teams.find((t) => t.id === id)?.name ?? id;

/** Whether someone is away now: on leave, or outside their working days. */
export function away(a: OrgAvailability | undefined, now = Date.now()): boolean {
  if (!a) return false;
  if (a.leave.some((l) => l.from <= now && now < l.to)) return true;
  return false;
}

/**
 * Who gets it: the person named; else, in the team, whoever is not away and holds the fewest
 * open cards (the lead last, they hand work out). The reason is one line the manager can read.
 */
export function pickAssignee(
  s: OrgStructure,
  state: OrgState,
  want: { team?: string; person?: string },
  now = Date.now(),
): { assignee?: string; say?: BotSay } {
  if (want.person) return { assignee: want.person, say: { key: "reasonNamed" } };
  const team = s.teams.find((t) => t.id === want.team);
  if (!team?.members.length) return {};
  const ranked = team.members
    .filter((m) => !away(state.availability[m], now))
    .map((m) => ({ m, load: loadOf(state, m) + (m === team.leadId ? 0.5 : 0) }))
    .sort((a, b) => a.load - b.load);
  const best = ranked[0];
  if (!best) return { say: { key: "reasonAllAway", vars: { team: team.name } } };
  return { assignee: best.m, say: { key: "reasonLoad", vars: { team: team.name, count: Math.floor(best.load) } } };
}

// ---- following up -----------------------------------------------------------------------

export interface FollowUp {
  card: string;
  stage: "nudge" | "soon" | "late" | "done" | "wait";
  to: string[];
  say: BotSay;
}

const HOUR = 3_600_000;

/** A card's lead: the lead of the team whose queue it is in, or of a team its person is in. */
function leadOf(s: OrgStructure, c: OrgCard): string | undefined {
  const team =
    s.teams.find((t) => t.id === c.team) ?? s.teams.find((t) => c.assignee && t.members.includes(c.assignee));
  return team?.leadId;
}

/** Half the time to its due date has gone by and it has not started. */
function halfway(c: OrgCard, now: number): boolean {
  return !!c.due && now - c.at > (c.due - c.at) / 2;
}

/**
 * Who should be reminded or told about what, now; each stage once per card (card.told). The bot
 * host sends them and records the stage on the card, so another computer does not send it again.
 */
export function followUps(s: OrgStructure, state: OrgState, now = Date.now()): FollowUp[] {
  return Object.values(state.cards).flatMap((c) => followUpsFor(s, c, now));
}

/** What one card needs now: word of it being done, late, waiting, due soon, or not started. */
function followUpsFor(s: OrgStructure, c: OrgCard, now: number): FollowUp[] {
  const told = c.told ?? {};
  const person = c.assignee && !c.assignee.startsWith("bot:") ? c.assignee : undefined;
  const say = (key: string, extra: Record<string, string> = {}) => ({ key, vars: { title: c.title, ...extra } });
  if (c.status === "done")
    return told.done
      ? []
      : [{ card: c.id, stage: "done", to: [c.requestedBy], say: say("done", { who: person ?? "" }) }];
  if (!isOpen(c)) return [];
  if (isOverdue(c, now)) {
    const to = [...new Set([leadOf(s, c), ...s.generalManagers].filter((x): x is string => !!x))];
    return told.late ? [] : [{ card: c.id, stage: "late", to, say: say("late", { who: person ?? "" }) }];
  }
  const waiting: FollowUp[] =
    c.waitingOn && now - c.waitingOn.since > 4 * HOUR && !told.wait
      ? [{ card: c.id, stage: "wait", to: [c.waitingOn.who], say: say("waiting", { what: c.waitingOn.what }) }]
      : [];
  return person ? [...waiting, ...reminders(s, c, person, now)] : waiting;
}

/** For whoever holds it: due within a day (them and their lead), or given and not started. */
function reminders(s: OrgStructure, c: OrgCard, person: string, now: number): FollowUp[] {
  const told = c.told ?? {};
  const vars = { title: c.title };
  const lead = leadOf(s, c);
  const dueSoon = !!c.due && c.status !== "review" && c.due - now < 24 * HOUR && halfway(c, now);
  if (dueSoon)
    return told.soon
      ? []
      : [
          {
            card: c.id,
            stage: "soon",
            to: [person, ...(lead && lead !== person ? [lead] : [])],
            say: { key: "soon", vars },
          },
        ];
  if (c.status === "accepted" && !told.nudge && (halfway(c, now) || now - c.at > 24 * HOUR))
    return [{ card: c.id, stage: "nudge", to: [person], say: { key: "nudge", vars } }];
  return [];
}

/** The manager's morning message: done yesterday, going on today, late, waiting for approval. */
export function morningReport(state: OrgState, now = Date.now(), days = 1): BotSay {
  const cards = Object.values(state.cards);
  const day = now - days * 24 * HOUR;
  const titles = (list: OrgCard[]) =>
    list
      .map((c) => c.title)
      .slice(0, 6)
      .join("; ") || "-";
  const done = cards.filter((c) => c.status === "done" && c.updatedAt > day);
  const doing = cards.filter((c) => c.status === "doing");
  const late = cards.filter((c) => isOverdue(c, now));
  const waiting = cards.filter((c) => c.status === "review" || (c.status === "open" && c.fromTeam));
  return {
    key: days > 1 ? "weekly" : "morning",
    vars: {
      done: done.length,
      doneList: titles(done),
      doing: doing.length,
      doingList: titles(doing),
      late: late.length,
      lateList: titles(late),
      waiting: waiting.length,
      waitingList: titles(waiting),
    },
  };
}

/** A comment on a card is for whoever holds it and whoever asked for it (plan.md 20.3). */
export function cardPeople(state: OrgState, channel: string): string[] {
  const card = channel.startsWith("card:") ? state.cards[channel.slice(5)] : undefined;
  return card ? [card.assignee, card.requestedBy].filter((x): x is string => !!x && !x.startsWith("bot:")) : [];
}

/** "What did QA finish last week?": the cards that answer it, newest first. */
export function answerFromCards(
  s: OrgStructure,
  state: OrgState,
  q: { team?: string; person?: string; since?: number },
  now = Date.now(),
): OrgCard[] {
  const since = q.since ?? now - 7 * 86_400_000;
  const team = s.teams.find((t) => t.id === q.team);
  return Object.values(state.cards)
    .filter((c) => c.updatedAt >= since)
    .filter((c) => !q.person || c.assignee === q.person)
    .filter((c) => !team || c.team === team.id || (!!c.assignee && team.members.includes(c.assignee)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
