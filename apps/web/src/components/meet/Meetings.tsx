import {
  freeSlots,
  fromIcs,
  isOpen,
  newCard,
  newMeetingKey,
  type OrgMeeting,
  occurrences,
  type Recurrence,
  toIcs,
} from "@igrek/core";
import { CalendarPlus, Download, Search, Sparkles, Upload, Video } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateTime } from "../../lib/format";
import { nameOf, type OrgApi, type OrgView } from "../org/api";
import { Badge, Button, Card, Segmented } from "../ui";
import { MeetRoom } from "./MeetRoom";

const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";
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
}: {
  api: OrgApi;
  view: OrgView;
  at?: number;
  people?: string[];
  onDone: () => void;
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
    <Card className="space-y-2 p-4">
      <input
        className={field}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("meet.title")}
        aria-label={t("meet.title")}
      />
      <textarea
        className="w-full rounded-ui border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent"
        style={{ minHeight: 56 }}
        value={agenda}
        onChange={(e) => setAgenda(e.target.value)}
        placeholder={t("meet.agenda")}
        aria-label={t("meet.agenda")}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="datetime-local"
          className={field}
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label={t("meet.when")}
        />
        <select
          className={field}
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
        <select
          className={field}
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
      <select
        className={field}
        value={project}
        onChange={(e) => setProject(e.target.value)}
        aria-label={t("org.project")}
      >
        <option value="">{t("org.noProject")}</option>
        {view.projects.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name}
          </option>
        ))}
      </select>
      <Button variant="primary" icon={CalendarPlus} disabled={!title.trim()} onClick={save}>
        {t("meet.schedule")}
      </Button>
    </Card>
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
          className={field}
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
      <select className={field} value={host} onChange={(e) => setHost(e.target.value)} aria-label={t("meet.bookWith")}>
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

/** Summary, decisions and actions in the answer's three parts, as the summarizer is asked to write them. */
function parseNotes(text: string): { summary: string; decisions: string[]; actions: string[] } {
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

/** Actions become cards for the people named in them; decisions go to the teams' channels and the project. */
async function sendOn(api: OrgApi, view: OrgView, m: OrgMeeting): Promise<OrgMeeting["actions"]> {
  const actions: OrgMeeting["actions"] = [];
  for (const a of m.actions) {
    if (a.card) {
      actions.push(a);
      continue;
    }
    const who = view.people.find((p) => a.text.toLowerCase().startsWith((p.displayName || p.username).toLowerCase()));
    const to = who ? { assignee: who.id } : m.teams[0] ? { team: m.teams[0] } : {};
    const card = newCard(
      { title: a.text.slice(0, 200), origin: "meeting", ...to, ...(m.project ? { project: m.project } : {}) },
      view.me.id,
    );
    await api.act("org-card", card as unknown as Record<string, unknown>);
    actions.push({ text: a.text, ...(who ? { who: who.id } : {}), card: card.id });
  }
  const notes = `${m.title}\n${m.summary ?? ""}\n${m.decisions.map((d) => `- ${d}`).join("\n")}`;
  for (const team of m.teams) await api.post({ channel: `team:${team}`, text: notes });
  if (m.project) for (const d of m.decisions) await api.addDecision?.(m.project, d);
  return actions;
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
        className={field}
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
}: {
  api: OrgApi;
  view: OrgView;
  m: OrgMeeting;
  dark: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [inCall, setInCall] = useState(false);
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

/** Meetings and the calendar (plan.md 20.8): what is coming, a new one, finding a time, booking, .ics. */
export function Meetings({ api, view, open, dark }: { api: OrgApi; view: OrgView; open?: string; dark: boolean }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState(open);
  const [mode, setMode] = useState<"list" | "new" | "find" | "book">("list");
  const [draft, setDraft] = useState<{ at: number; people: string[] }>();
  const now = Date.now();
  const coming = mine(view)
    .flatMap((m) => occurrences(m, now - 2 * 3_600_000, now + 14 * DAY).map((at) => ({ m, at })))
    .sort((a, b) => a.at - b.at);
  const past = mine(view)
    .filter((m) => m.transcript.length || m.summary || m.status === "ended")
    .sort((a, b) => b.start - a.start);
  const meeting = picked ? view.state.meetings[picked] : undefined;
  // Due dates are on the calendar too (plan.md 20.11): my cards and the ones I asked for.
  const due = Object.values(view.state.cards)
    .filter(
      (c) =>
        isOpen(c) && !!c.due && c.due < now + 14 * DAY && (c.assignee === view.me.id || c.requestedBy === view.me.id),
    )
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label={t("meet.title")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "list", label: t("meet.coming") },
            { value: "new", label: t("meet.new") },
            { value: "find", label: t("meet.findTime") },
            { value: "book", label: t("meet.booking") },
          ]}
        />
        <IcsTools api={api} view={view} />
      </div>
      {mode === "new" && (
        <NewMeeting api={api} view={view} at={draft?.at} people={draft?.people} onDone={() => setMode("list")} />
      )}
      {mode === "find" && (
        <FindTime
          view={view}
          onPick={(at, people) => {
            setDraft({ at, people });
            setMode("new");
          }}
        />
      )}
      {mode === "book" && <Booking api={api} view={view} />}
      {meeting && (
        <MeetingPage
          key={meeting.id}
          api={api}
          view={view}
          m={meeting}
          dark={dark}
          onClose={() => setPicked(undefined)}
        />
      )}
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
            <button
              key={`${m.id}${at}`}
              type="button"
              onClick={() => setPicked(m.id)}
              className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
            >
              <span className="w-36 shrink-0 text-[12px] text-fg-subtle">{dateTime(at)}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              {m.replies[view.me.id] === "no" && <Badge tone="danger">{t("meet.no")}</Badge>}
            </button>
          ))}
        </Card>
        <Card className="min-w-0 space-y-1 p-4">
          <h3 className="text-[13.5px] font-semibold">{t("meet.past")}</h3>
          {!past.length && <p className="text-[12.5px] text-fg-subtle">{t("meet.nonePast")}</p>}
          {past.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPicked(m.id)}
              className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
            >
              <span className="w-36 shrink-0 text-[12px] text-fg-subtle">{dateTime(m.start)}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              {m.summary && <Badge tone="accent">{t("meet.hasNotes")}</Badge>}
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}
