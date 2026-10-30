import {
  freeSlots,
  fromIcs,
  isOpen,
  meetingFollowUp,
  newMeetingKey,
  type OrgMeeting,
  occurrences,
  parseNotes,
  type Recurrence,
  toIcs,
} from "@igrek/core";
import { CalendarPlus, Download, Link2, Search, Sparkles, Upload, Video } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { dateTime } from "../../lib/format";
import { nameOf, type OrgApi, type OrgView } from "../org/api";
import { ProjectSelect } from "../org/ProjectSelect";
import { ActionsMenu, Badge, Button, Card, Dialog, field } from "../ui";
import { MeetRoom } from "./MeetRoom";

const box = cn(field, "w-full");
const DAY = 86_400_000;
const local = (at: number) => {
  const d = new Date(at - new Date(at).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Meetings I am in: invited, made by me, or for a team I am in. */
function mine(view: OrgView): OrgMeeting[] {
  const me = view.me.id;
  const teams = view.structure.teams.filter((t) => t.members.includes(me)).map((t) => t.id);
  return Object.values(view.state.meetings).filter(
    (m) => m.by === me || m.attendees.includes(me) || m.teams.some((t) => teams.includes(t)) || m.bookedWith === me,
  );
}

/** A new meeting: what, when, how long, how often, with whom (people or teams), for which project. */
function NewMeeting({
  api,
  view,
  at,
  people,
  onDone,
  onFindTime,
}: {
  api: OrgApi;
  view: OrgView;
  at?: number;
  people?: string[];
  onDone: () => void;
  /** Look for a time everyone is free instead of typing one. */
  onFindTime?: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [when, setWhen] = useState(local(at ?? Math.ceil(Date.now() / 1_800_000) * 1_800_000));
  const [minutes, setMinutes] = useState(30);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [who, setWho] = useState<string[]>(people ?? []);
  const [teams, setTeams] = useState<string[]>([]);
  const [project, setProject] = useState("");
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const save = () => {
    const now = Date.now();
    const m = {
      id: crypto.randomUUID().slice(0, 18),
      title: title.trim(),
      agenda: agenda.trim(),
      start: new Date(when).getTime(),
      minutes,
      recurrence,
      attendees: [...new Set([view.me.id, ...who])],
      teams,
      ...(project ? { project } : {}),
      key: newMeetingKey(),
      replies: { [view.me.id]: "yes" },
      consent: {},
      status: "planned",
      transcript: [],
      decisions: [],
      actions: [],
      by: view.me.id,
      at: now,
      updatedAt: now,
    };
    void api.act("org-meeting", m).then(onDone);
  };
  return (
    <div className="space-y-2">
      <input
        className={box}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("meet.name")}
        aria-label={t("meet.name")}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="datetime-local"
          className={box}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label={t("meet.when")}
        />
        <select
          className={box}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          aria-label={t("meet.length")}
        >
          {[15, 30, 45, 60, 90].map((n) => (
            <option key={n} value={n}>
              {t("meet.minutes", { count: n })}
            </option>
          ))}
        </select>
        {onFindTime && (
          <Button icon={Search} onClick={onFindTime}>
            {t("meet.findTime")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {view.people
          .filter((p) => p.id !== view.me.id)
          .map((p) => (
            <label key={p.id} className="inline-flex items-center gap-1">
              <input type="checkbox" checked={who.includes(p.id)} onChange={() => setWho((w) => toggle(w, p.id))} />
              {p.displayName || p.username}
            </label>
          ))}
        {view.structure.teams.map((x) => (
          <label key={x.id} className="inline-flex items-center gap-1 font-medium">
            <input type="checkbox" checked={teams.includes(x.id)} onChange={() => setTeams((w) => toggle(w, x.id))} />
            {x.name}
          </label>
        ))}
      </div>
      {/* What most meetings do not need, folded: an agenda, repeating, a project. */}
      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-fg-muted">{t("meet.moreOptions")}</summary>
        <div className="mt-2 space-y-2">
          <textarea
            className={cn(field, "h-auto w-full py-1.5")}
            style={{ minHeight: 56 }}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder={t("meet.agenda")}
            aria-label={t("meet.agenda")}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={box}
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              aria-label={t("meet.repeat")}
            >
              {(["none", "daily", "weekly"] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`meet.repeat_${r}`)}
                </option>
              ))}
            </select>
            <ProjectSelect view={view} value={project} onChange={setProject} />
          </div>
        </div>
      </details>
      <p className="text-[11.5px] text-fg-subtle">{t("meet.reminder")}</p>
      <Button variant="primary" icon={CalendarPlus} disabled={!title.trim()} onClick={save}>
        {t("meet.schedule")}
      </Button>
    </div>
  );
}

/** "30 minutes with Kerim": the first times everyone is free (working hours, time off, other meetings). */
function FindTime({ view, onPick }: { view: OrgView; onPick: (at: number, people: string[]) => void }) {
  const { t } = useTranslation();
  const [who, setWho] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(30);
  const slots = useMemo(
    () =>
      who.length
        ? freeSlots([view.me.id, ...who], minutes, {
            availability: view.state.availability,
            meetings: Object.values(view.state.meetings),
          })
        : [],
    [who, minutes, view],
  );
  return (
    <Card className="space-y-2 p-4">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Search size={14} className="text-accent" aria-hidden="true" /> {t("meet.findTime")}
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        {view.people
          .filter((p) => p.id !== view.me.id)
          .map((p) => (
            <label key={p.id} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={who.includes(p.id)}
                onChange={() => setWho((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}
              />
              {p.displayName || p.username}
            </label>
          ))}
        <select
          className={box}
          style={{ width: 120 }}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          aria-label={t("meet.length")}
        >
          {[15, 30, 60].map((n) => (
            <option key={n} value={n}>
              {t("meet.minutes", { count: n })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <Button key={s} size="sm" onClick={() => onPick(s, who)}>
            {dateTime(s)}
          </Button>
        ))}
        {who.length > 0 && !slots.length && <p className="text-[12.5px] text-fg-subtle">{t("meet.noTime")}</p>}
      </div>
    </Card>
  );
}

/** Someone's booking page (plan.md 20.8): their free half hours this week; taking one makes the meeting. */
function Booking({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [host, setHost] = useState(view.structure.generalManagers.find((g) => g !== view.me.id) ?? "");
  const slots = host
    ? freeSlots(
        [host, view.me.id],
        30,
        { availability: view.state.availability, meetings: Object.values(view.state.meetings) },
        { from: Date.now() + 3_600_000, limit: 12 },
      )
    : [];
  const book = (at: number) => {
    const now = Date.now();
    void api.act("org-meeting", {
      id: crypto.randomUUID().slice(0, 18),
      title: t("meet.bookedTitle", { a: nameOf(view, view.me.id), b: nameOf(view, host) }),
      agenda: "",
      start: at,
      minutes: 30,
      recurrence: "none",
      attendees: [view.me.id, host],
      teams: [],
      key: newMeetingKey(),
      replies: { [view.me.id]: "yes" },
      consent: {},
      bookedWith: host,
      status: "planned",
      transcript: [],
      decisions: [],
      actions: [],
      by: view.me.id,
      at: now,
      updatedAt: now,
    });
  };
  return (
    <Card className="space-y-2 p-4">
      <h3 className="text-[13.5px] font-semibold">{t("meet.booking")}</h3>
      <select className={box} value={host} onChange={(e) => setHost(e.target.value)} aria-label={t("meet.bookWith")}>
        <option value="">{t("meet.bookWith")}</option>
        {view.people
          .filter((p) => p.id !== view.me.id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName || p.username}
            </option>
          ))}
      </select>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <Button key={s} size="sm" onClick={() => book(s)}>
            {dateTime(s)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

/** Actions become cards for the people named in them; decisions go to the teams' channels and the project. */
async function sendOn(api: OrgApi, view: OrgView, m: OrgMeeting): Promise<OrgMeeting["actions"]> {
  const plan = meetingFollowUp(m, view.people, view.me.id);
  for (const card of plan.cards) await api.act("org-card", card as unknown as Record<string, unknown>);
  for (const post of plan.posts) await api.post(post);
  for (const d of plan.decisions) await api.addDecision?.(d.project, d.text);
  return plan.actions;
}

/** After the meeting: what was said, the summary, the decisions and the actions, and where they go. */
function MeetingNotes({ api, view, m }: { api: OrgApi; view: OrgView; m: OrgMeeting }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const lines = m.transcript.filter((l) => !q || l.text.toLowerCase().includes(q));
  const save = (patch: Partial<OrgMeeting>) => api.act("org-meeting", { ...m, ...patch, updatedAt: Date.now() });
  const summarize = async () => {
    if (!api.summarize) return;
    setBusy(true);
    try {
      const said = m.transcript.map((l) => `${nameOf(view, l.who) || l.who}: ${l.text}`).join("\n");
      const out = await api.summarize(
        `Meeting "${m.title}". Agenda: ${m.agenda || "-"}.\n${said}`,
        "Write three parts with these headings: # Summary (a few lines), # Decisions (one per line), # Actions (one per line, starting with the person's name when one was named)",
      );
      const notes = parseNotes(out);
      await save({
        summary: notes.summary,
        decisions: notes.decisions,
        actions: notes.actions.map((text) => ({ text })),
      });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => save({ actions: await sendOn(api, view, m) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {api.summarize && (
          <Button
            size="sm"
            icon={Sparkles}
            usesModel
            disabled={busy || !m.transcript.length}
            onClick={() => void summarize()}
          >
            {busy ? t("org.summarizing") : t("meet.summarize")}
          </Button>
        )}
        {(m.decisions.length > 0 || m.actions.length > 0) && (
          <Button size="sm" variant="primary" onClick={() => void send()}>
            {t("meet.sendOn")}
          </Button>
        )}
      </div>
      {m.summary && <p className="whitespace-pre-wrap text-[13px]">{m.summary}</p>}
      {m.decisions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t("meet.decisions")}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-[13px]">
            {m.decisions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {m.actions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t("meet.actions")}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-[13px]">
            {m.actions.map((a) => (
              <li key={a.text}>
                {a.text} {a.card && <Badge tone="success">{t("meet.carded")}</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <input
        className={box}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("meet.searchTranscript")}
        aria-label={t("meet.searchTranscript")}
      />
      <div className="max-h-80 space-y-1 overflow-y-auto text-[13px]">
        {lines.map((l) => (
          <p key={`${l.who}${l.at}`}>
            <span className="text-[11px] text-fg-subtle">{dateTime(l.at)}</span>{" "}
            <span className="font-semibold">{nameOf(view, l.who) || l.who}</span> {l.text}
          </p>
        ))}
        {!m.transcript.length && (
          <p className="text-fg-subtle">{api.transcribe ? t("meet.noTranscript") : t("meet.transcriptInIgrek")}</p>
        )}
      </div>
    </div>
  );
}

function MeetingPage({
  api,
  view,
  m,
  dark,
  onClose,
  join,
}: {
  api: OrgApi;
  view: OrgView;
  m: OrgMeeting;
  dark: boolean;
  onClose: () => void;
  /** Straight into the call: "Start now" and "Join" in the list. */
  join?: boolean;
}) {
  const { t } = useTranslation();
  const [inCall, setInCall] = useState(!!join);
  const me = view.me.id;
  const reply = (r: "yes" | "no") =>
    void api.act("org-meeting", { ...m, replies: { ...m.replies, [me]: r }, updatedAt: Date.now() });
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold">{m.title}</h2>
          <p className="text-[12.5px] text-fg-muted">
            {dateTime(m.start)} · {t("meet.minutes", { count: m.minutes })}
            {m.recurrence !== "none" && ` · ${t(`meet.repeat_${m.recurrence}`)}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("meet.close")}
        </Button>
      </div>
      {m.agenda && <p className="whitespace-pre-wrap text-[13px]">{m.agenda}</p>}
      <p className="flex flex-wrap gap-1.5 text-[12px]">
        {m.attendees.map((a) => (
          <Badge key={a} tone={m.replies[a] === "yes" ? "success" : m.replies[a] === "no" ? "danger" : "neutral"}>
            {nameOf(view, a)}
          </Badge>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        {!inCall && (
          <Button variant="primary" icon={Video} onClick={() => setInCall(true)}>
            {t("meet.join")}
          </Button>
        )}
        {m.attendees.includes(me) && m.replies[me] !== "yes" && (
          <Button onClick={() => reply("yes")}>{t("meet.yes")}</Button>
        )}
        {m.attendees.includes(me) && m.replies[me] !== "no" && (
          <Button variant="ghost" onClick={() => reply("no")}>
            {t("meet.no")}
          </Button>
        )}
        {/* Ask someone in, from a meeting started on the spot or a planned one: they get its reminder. */}
        {view.people.some((p) => !m.attendees.includes(p.id)) && (
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              void api.act("org-meeting", { ...m, attendees: [...m.attendees, e.target.value], updatedAt: Date.now() })
            }
            aria-label={t("meet.invite")}
            className={cn(field, "max-w-48")}
          >
            <option value="">{t("meet.invite")}</option>
            {view.people
              .filter((p) => !m.attendees.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName || p.username}
                </option>
              ))}
          </select>
        )}
        {m.by === me && m.status !== "cancelled" && (
          <Button
            variant="ghost"
            onClick={() => void api.act("org-meeting", { ...m, status: "cancelled", updatedAt: Date.now() })}
          >
            {t("meet.cancel")}
          </Button>
        )}
      </div>
      {inCall && <MeetRoom api={api} view={view} meeting={m} dark={dark} onLeave={() => setInCall(false)} />}
      <MeetingNotes api={api} view={view} m={m} />
    </Card>
  );
}

/** Calendar export and import: .ics files Google and Outlook read and write. */
function IcsTools({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const exportIcs = () => {
    const url = URL.createObjectURL(new Blob([toIcs(mine(view), (id) => nameOf(view, id))], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "igrek-meetings.ics";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importIcs = async (file: File) => {
    const now = Date.now();
    for (const e of fromIcs(await file.text()))
      await api.act("org-meeting", {
        ...e,
        id: crypto.randomUUID().slice(0, 18),
        attendees: [view.me.id],
        teams: [],
        key: newMeetingKey(),
        replies: { [view.me.id]: "yes" },
        consent: {},
        status: "planned",
        transcript: [],
        decisions: [],
        actions: [],
        by: view.me.id,
        at: now,
        updatedAt: now,
      });
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" icon={Download} onClick={exportIcs}>
        {t("meet.exportIcs")}
      </Button>
      <Button size="sm" icon={Upload} onClick={() => input.current?.click()}>
        {t("meet.importIcs")}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importIcs(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The next seven days side by side, each with its meetings: the week at a glance. */
function Week({ coming, onOpen }: { coming: { m: OrgMeeting; at: number }[]; onOpen: (id: string) => void }) {
  const { i18n } = useTranslation();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => start.getTime() + i * DAY);
  const name = (at: number) => new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric" }).format(at);
  const time = (at: number) =>
    new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(at);
  return (
    <Card className="grid grid-cols-7 divide-x divide-border overflow-hidden">
      {days.map((day, i) => (
        <div key={day} className={cn("min-h-24 min-w-0 p-1.5", i === 0 && "bg-accent-soft")}>
          <p className="px-1 text-[11px] font-medium text-fg-subtle">{name(day)}</p>
          {coming
            .filter(({ at }) => at >= day && at < day + DAY)
            .map(({ m, at }) => (
              <button
                key={`${m.id}${at}`}
                type="button"
                onClick={() => onOpen(m.id)}
                className="mt-1 block w-full truncate rounded px-1 py-0.5 text-start text-[11px] hover:bg-bg-hover"
              >
                <span className="text-fg-subtle">{time(at)}</span> {m.title}
              </button>
            ))}
        </div>
      ))}
    </Card>
  );
}

/**
 * Meetings, as simple as a video call app (a user found tabs for listing, making, finding a time
 * and booking too much): start one now, plan one, the week, and what is coming with a Join button.
 * Finding a time is part of planning; booking and calendar files are under "More".
 */
export function Meetings({ api, view, open, dark }: { api: OrgApi; view: OrgView; open?: string; dark: boolean }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<{ id: string; join?: boolean } | undefined>(open ? { id: open } : undefined);
  const [dialog, setDialog] = useState<"plan" | "find" | "book">();
  const [draft, setDraft] = useState<{ at: number; people: string[] }>();
  const now = Date.now();
  const coming = mine(view)
    .filter((m) => m.status !== "cancelled")
    .flatMap((m) => occurrences(m, now - 2 * 3_600_000, now + 14 * DAY).map((at) => ({ m, at })))
    .sort((a, b) => a.at - b.at);
  const past = mine(view)
    .filter((m) => m.transcript.length || m.summary || m.status === "ended")
    .sort((a, b) => b.start - a.start);
  const meeting = picked ? view.state.meetings[picked.id] : undefined;
  // Due dates are on the calendar too (plan.md 20.11): my cards and the ones I asked for.
  const due = Object.values(view.state.cards)
    .filter(
      (c) =>
        isOpen(c) && !!c.due && c.due < now + 14 * DAY && (c.assignee === view.me.id || c.requestedBy === view.me.id),
    )
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  // "Start now": a meeting from this minute, and straight into its call; invite from inside it.
  const startNow = () => {
    const at = Date.now();
    const m = {
      id: crypto.randomUUID().slice(0, 18),
      title: t("meet.instantTitle", {
        time: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(at),
      }),
      agenda: "",
      start: at,
      minutes: 30,
      recurrence: "none" as const,
      attendees: [view.me.id],
      teams: [],
      key: newMeetingKey(),
      replies: { [view.me.id]: "yes" },
      consent: {},
      status: "planned",
      transcript: [],
      decisions: [],
      actions: [],
      by: view.me.id,
      at,
      updatedAt: at,
    };
    void api.act("org-meeting", m).then(() => setPicked({ id: m.id, join: true }));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Video} onClick={startNow}>
          {t("meet.startNow")}
        </Button>
        <Button icon={CalendarPlus} onClick={() => setDialog("plan")}>
          {t("meet.plan")}
        </Button>
        <span className="flex-1" />
        <ActionsMenu label={t("meet.more")}>
          <Button size="sm" variant="ghost" icon={Link2} onClick={() => setDialog("book")}>
            {t("meet.booking")}
          </Button>
          <IcsTools api={api} view={view} />
        </ActionsMenu>
      </div>
      {meeting && (
        <MeetingPage
          key={`${meeting.id}${picked?.join ? ":join" : ""}`}
          api={api}
          view={view}
          m={meeting}
          dark={dark}
          join={picked?.join}
          onClose={() => setPicked(undefined)}
        />
      )}
      <Week coming={coming} onOpen={(id) => setPicked({ id })} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 space-y-1 p-4">
          <h3 className="text-[13.5px] font-semibold">{t("meet.coming")}</h3>
          {!coming.length && !due.length && <p className="text-[12.5px] text-fg-subtle">{t("meet.none")}</p>}
          {due.map((c) => (
            <p key={c.id} className="flex items-center gap-2 px-2 py-1 text-[13px]">
              <span className="w-36 shrink-0 text-[12px] text-fg-subtle">{dateTime(c.due ?? 0)}</span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <Badge tone="warning">{t("meet.dueBadge")}</Badge>
            </p>
          ))}
          {coming.map(({ m, at }) => (
            <div
              key={`${m.id}${at}`}
              className="flex items-center gap-2 rounded-ui px-2 py-1 text-[13px] hover:bg-bg-hover"
            >
              <button
                type="button"
                onClick={() => setPicked({ id: m.id })}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
              >
                <span className="w-36 shrink-0 text-[12px] text-fg-subtle">{dateTime(at)}</span>
                <span className="min-w-0 flex-1 truncate">{m.title}</span>
                {m.replies[view.me.id] === "no" && <Badge tone="danger">{t("meet.no")}</Badge>}
              </button>
              <Button size="sm" icon={Video} onClick={() => setPicked({ id: m.id, join: true })}>
                {t("meet.join")}
              </Button>
            </div>
          ))}
        </Card>
        <Card className="min-w-0 space-y-1 p-4">
          <h3 className="text-[13.5px] font-semibold">{t("meet.past")}</h3>
          {!past.length && <p className="text-[12.5px] text-fg-subtle">{t("meet.nonePast")}</p>}
          {past.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPicked({ id: m.id })}
              className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
            >
              <span className="w-36 shrink-0 text-[12px] text-fg-subtle">{dateTime(m.start)}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              {m.summary && <Badge tone="accent">{t("meet.hasNotes")}</Badge>}
            </button>
          ))}
        </Card>
      </div>
      <Dialog
        open={!!dialog}
        onClose={() => setDialog(undefined)}
        label={t(dialog === "book" ? "meet.booking" : "meet.plan")}
      >
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">
            {t(dialog === "book" ? "meet.booking" : dialog === "find" ? "meet.findTime" : "meet.plan")}
          </h2>
          {dialog === "plan" && (
            <NewMeeting
              key={draft?.at ?? 0}
              api={api}
              view={view}
              at={draft?.at}
              people={draft?.people}
              onFindTime={() => setDialog("find")}
              onDone={() => {
                setDialog(undefined);
                setDraft(undefined);
              }}
            />
          )}
          {dialog === "find" && (
            <FindTime
              view={view}
              onPick={(at, people) => {
                setDraft({ at, people });
                setDialog("plan");
              }}
            />
          )}
          {dialog === "book" && <Booking api={api} view={view} />}
        </div>
      </Dialog>
    </div>
  );
}
