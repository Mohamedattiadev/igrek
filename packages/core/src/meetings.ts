/**
 * Meetings, calendar and booking (plan.md 20.8), shared by Igrek and the hub's web page. A meeting
 * is an encrypted event on the company stream; it carries its own random key, so the signalling of
 * its call (and a guest's one-time link) never needs the team key.
 */
import type { OrgAvailability } from "./org";

export type Recurrence = "none" | "daily" | "weekly";

export interface MeetingLine {
  /** Who said it (hub id, or "guest:<name>"), when, and what. */
  who: string;
  at: number;
  text: string;
}

export interface OrgMeeting {
  id: string;
  title: string;
  agenda: string;
  start: number;
  minutes: number;
  recurrence: Recurrence;
  attendees: string[];
  teams: string[];
  /** The project its decisions go to, if any (its hub id). */
  project?: string;
  /** The call's own key (base64url, 32 bytes): signalling and guests use it, not the team key. */
  key: string;
  /** Answers to the invite: "yes" | "no". */
  replies: Record<string, "yes" | "no">;
  /** Agreed to the recording and its transcript (every attendee in the call must). */
  consent: Record<string, boolean>;
  /** A slot booked on someone's booking page (plan.md 20.8): whose page it was. */
  bookedWith?: string;
  status: "planned" | "live" | "ended" | "cancelled";
  transcript: MeetingLine[];
  summary?: string;
  decisions: string[];
  actions: { text: string; who?: string; card?: string }[];
  /** The whiteboard when the meeting ended (Excalidraw's elements, as JSON). */
  board?: string;
  by: string;
  at: number;
  updatedAt: number;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : []);

/** A meeting as it came over the wire, only its known parts. */
export function cleanMeeting(v: Record<string, unknown>, author: string, at: number): OrgMeeting | undefined {
  const id = str(v.id, 40);
  const title = str(v.title, 200).trim();
  const key = str(v.key, 64);
  if (!id || !title || !/^[A-Za-z0-9_-]{43}$/.test(key)) return undefined;
  const status = ["planned", "live", "ended", "cancelled"].includes(String(v.status))
    ? (v.status as OrgMeeting["status"])
    : "planned";
  return {
    id,
    title,
    agenda: str(v.agenda, 4000),
    start: num(v.start, at),
    minutes: Math.min(600, Math.max(5, num(v.minutes, 30))),
    recurrence: v.recurrence === "daily" || v.recurrence === "weekly" ? v.recurrence : "none",
    attendees: ids(v.attendees),
    teams: ids(v.teams),
    ...(str(v.project, 64) ? { project: str(v.project, 64) } : {}),
    key,
    replies: (v.replies && typeof v.replies === "object" ? v.replies : {}) as OrgMeeting["replies"],
    consent: (v.consent && typeof v.consent === "object" ? v.consent : {}) as OrgMeeting["consent"],
    ...(str(v.bookedWith, 40) ? { bookedWith: str(v.bookedWith, 40) } : {}),
    status,
    transcript: Array.isArray(v.transcript) ? (v.transcript as MeetingLine[]).slice(-3000) : [],
    ...(str(v.summary, 8000) ? { summary: str(v.summary, 8000) } : {}),
    decisions: ids(v.decisions).map((d) => d.slice(0, 500)),
    actions: Array.isArray(v.actions) ? (v.actions as OrgMeeting["actions"]).slice(0, 50) : [],
    ...(typeof v.board === "string" && v.board.length < 400_000 ? { board: v.board } : {}),
    by: str(v.by, 40) || author,
    at: num(v.at, at),
    updatedAt: num(v.updatedAt, at),
  };
}

/**
 * Two versions of a meeting: the newer one's fields win, but replies, consents and transcript
 * lines from both are kept (people answer and talk at the same time from different computers).
 */
export function mergeMeeting(known: OrgMeeting | undefined, incoming: OrgMeeting): OrgMeeting {
  if (!known) return incoming;
  const [newer, older] = incoming.updatedAt >= known.updatedAt ? [incoming, known] : [known, incoming];
  const lines = new Map([...older.transcript, ...newer.transcript].map((l) => [`${l.who}:${l.at}`, l]));
  return {
    ...newer,
    replies: { ...older.replies, ...newer.replies },
    consent: { ...older.consent, ...newer.consent },
    transcript: [...lines.values()].sort((a, b) => a.at - b.at),
  };
}

/** A fresh call key (32 random bytes, base64url). */
export function newMeetingKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** The opaque room the hub relays the call's signals in: a hash of its key, telling the hub nothing. */
export async function roomOfMeeting(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`igrek-meet:${key}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- the calendar ------------------------------------------------------------------------

/** The times a meeting happens between two moments: once, or every day or week from its start. */
export function occurrences(m: OrgMeeting, from: number, to: number): number[] {
  if (m.status === "cancelled") return [];
  if (m.recurrence === "none") return m.start + m.minutes * 60_000 > from && m.start < to ? [m.start] : [];
  const step = (m.recurrence === "daily" ? 1 : 7) * 86_400_000;
  const out: number[] = [];
  const first = m.start >= from ? m.start : m.start + Math.ceil((from - m.start) / step) * step;
  for (let at = first; at < to && out.length < 200; at += step) out.push(at);
  return out;
}

/** Whether someone is free from `at` for `minutes`: at work then, not on leave, not in another meeting. */
export function isFree(
  person: string,
  at: number,
  minutes: number,
  ctx: { availability: Record<string, OrgAvailability>; meetings: OrgMeeting[] },
): boolean {
  const end = at + minutes * 60_000;
  const a = ctx.availability[person];
  if (a) {
    if (a.leave.some((l) => l.from < end && at < l.to)) return false;
    // Their working hours on their own clock.
    const local = new Date(at - a.tz * 60_000);
    const startMin = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (!a.days.includes(local.getUTCDay()) || startMin < a.from || startMin + minutes > a.to) return false;
  }
  return !ctx.meetings.some(
    (m) =>
      (m.attendees.includes(person) || m.by === person) &&
      m.replies[person] !== "no" &&
      occurrences(m, at - m.minutes * 60_000, end).some((s) => s < end && at < s + m.minutes * 60_000),
  );
}

/**
 * "30 minutes with Kerim this week": the first times everyone is free, every half hour from the
 * next round half hour, for up to `days` days.
 */
export function freeSlots(
  people: string[],
  minutes: number,
  ctx: { availability: Record<string, OrgAvailability>; meetings: OrgMeeting[] },
  range: { from?: number; days?: number; limit?: number } = {},
): number[] {
  const { from = Date.now(), days = 7, limit = 5 } = range;
  const step = 30 * 60_000;
  const out: number[] = [];
  for (let at = Math.ceil(from / step) * step; at < from + days * 86_400_000 && out.length < limit; at += step)
    if (people.every((p) => isFree(p, at, minutes, ctx))) out.push(at);
  return out;
}

// ---- .ics, for Google, Outlook and the rest ------------------------------------------------

const icsDate = (at: number) =>
  new Date(at)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/[,;]/g, (c) => `\\${c}`);

/** Meetings as an .ics calendar file (RFC 5545), free to import anywhere. */
export function toIcs(meetings: OrgMeeting[], nameOf: (id: string) => string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Igrek//Meetings//EN", "CALSCALE:GREGORIAN"];
  for (const m of meetings.filter((x) => x.status !== "cancelled")) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id}@igrek`,
      `DTSTAMP:${icsDate(m.updatedAt)}`,
      `DTSTART:${icsDate(m.start)}`,
      `DTEND:${icsDate(m.start + m.minutes * 60_000)}`,
      `SUMMARY:${icsText(m.title)}`,
      ...(m.agenda ? [`DESCRIPTION:${icsText(m.agenda)}`] : []),
      ...(m.recurrence !== "none" ? [`RRULE:FREQ=${m.recurrence === "daily" ? "DAILY" : "WEEKLY"}`] : []),
      ...m.attendees.map((a) => `ATTENDEE;CN=${icsText(nameOf(a))}:igrek:${a}`),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function parseIcsDate(v: string): number | undefined {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return undefined;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const;
  return z ? Date.UTC(...parts) : new Date(...parts).getTime();
}

/** Events from an .ics file (Google, Outlook): title, start, length, repeat, description. */
export function fromIcs(
  text: string,
): { title: string; start: number; minutes: number; recurrence: Recurrence; agenda: string }[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: { title: string; start: number; minutes: number; recurrence: Recurrence; agenda: string }[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const field = (name: string) => block.match(new RegExp(`^${name}(?:;[^:\\n]*)?:(.*)$`, "m"))?.[1]?.trim() ?? "";
    const start = parseIcsDate(field("DTSTART"));
    if (start === undefined) continue;
    const end = parseIcsDate(field("DTEND")) ?? start + 30 * 60_000;
    const rule = field("RRULE");
    out.push({
      title:
        field("SUMMARY")
          .replace(/\\([,;\\])/g, "$1")
          .replace(/\\n/g, "\n") || "Meeting",
      start,
      minutes: Math.max(5, Math.round((end - start) / 60_000)),
      recurrence: /FREQ=DAILY/.test(rule) ? "daily" : /FREQ=WEEKLY/.test(rule) ? "weekly" : "none",
      agenda: field("DESCRIPTION")
        .replace(/\\([,;\\])/g, "$1")
        .replace(/\\n/g, "\n"),
    });
  }
  return out.slice(0, 500);
}

/**
 * What to tell someone about their meetings now: ten minutes before, and when it starts. The
 * caller remembers what it already said ("<meeting>:<time>:<kind>"), so each goes once.
 */
export function meetingNotices(
  meetings: OrgMeeting[],
  me: string,
  myTeams: string[],
  now = Date.now(),
): { id: string; kind: "soon" | "started"; meeting: OrgMeeting; at: number }[] {
  const out: { id: string; kind: "soon" | "started"; meeting: OrgMeeting; at: number }[] = [];
  for (const m of meetings) {
    const mine = m.attendees.includes(me) || m.by === me || m.teams.some((t) => myTeams.includes(t));
    if (!mine || m.replies[me] === "no") continue;
    for (const at of occurrences(m, now - 3 * 60_000, now + 10 * 60_000 + 1)) {
      const kind = at > now ? "soon" : "started";
      out.push({ id: `${m.id}:${at}:${kind}`, kind, meeting: m, at });
    }
  }
  return out;
}
