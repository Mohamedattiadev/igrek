import type { Meeting, Persona, PersonaGroup, PersonaScore, ProjectListItem } from "@godeye/core";
import { Download, MessagesSquare, Plus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { compactNumber, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { ArenaTab } from "./Arena";
import { TestersTab } from "./Testers";

const GROUPS: PersonaGroup[] = ["engineering", "leadership", "research", "testing"];
type Tab = "team" | "meetings" | "testers" | "scores" | "arena";

export function useProjects(): ProjectListItem[] {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  useEffect(() => {
    api
      .projects()
      .then((list) => setProjects(list.filter((p) => !p.hidden)))
      .catch(() => undefined);
  }, []);
  return projects;
}

function PersonaCard({ persona }: { persona: Persona }) {
  const { t } = useTranslation();
  const label = usePersonaLabel()(persona);
  return (
    <Link
      to={`/personas/${persona.id}`}
      data-nav-item
      className="flex items-start gap-3 rounded-ui border border-border bg-bg p-3 hover:border-border-strong hover:bg-bg-hover"
    >
      <PersonaIcon persona={persona} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">{label.name}</p>
        <p className="line-clamp-2 text-xs text-fg-muted">{label.role}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge>{t(`persona.tools_${persona.tools}`)}</Badge>
          {persona.web && <Badge>{t("persona.web")}</Badge>}
          {persona.edited && <Badge tone="accent">{t("persona.edited")}</Badge>}
          {!persona.builtin && <Badge tone="accent">{t("persona.own")}</Badge>}
        </div>
      </div>
    </Link>
  );
}

/** Ask the team: a question, a project and who joins (about five, suggested from the question). */
function NewMeeting({ personas, onStarted }: { personas: Persona[]; onStarted: (m: Meeting) => void }) {
  const { t } = useTranslation();
  const label = usePersonaLabel();
  const projects = useProjects();
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState("");
  const [team, setTeam] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);

  // Suggest the team while typing, until the user picks people by hand.
  useEffect(() => {
    if (touched) return;
    const timer = setTimeout(() => {
      api
        .suggestTeam(question)
        .then((r) => setTeam(r.personaIds))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [question, touched]);

  const start = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onStarted(await api.startMeeting({ question, projectId: projectId || undefined, personaIds: team }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const byId = (id: string) => personas.find((p) => p.id === id);
  const others = personas.filter((p) => !team.includes(p.id) && p.id !== "pm-lead");

  return (
    <Card className="space-y-3 p-pad">
      <label className="block space-y-1">
        <span className="text-[13px] font-semibold">{t("meeting.question")}</span>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder={t("meeting.questionHint")}
          className="w-full resize-y rounded-ui border border-border bg-bg px-2.5 py-2 text-[13.5px] outline-none focus:border-accent"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          {t("meeting.project")}
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-7 rounded-md border border-border bg-bg px-1.5 text-[12px] text-fg"
          >
            <option value="">{t("meeting.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-fg-muted">
          {t("meeting.team")} <span className="text-fg-subtle">{t("meeting.teamHint")}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {team.map((id) => (
            <span
              key={id}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-bg-subtle ps-1 pe-1.5 text-[12px]"
            >
              <PersonaIcon persona={byId(id)} size={12} className="size-5 rounded-full" />
              {label(byId(id), id).name}
              <button
                type="button"
                aria-label={t("meeting.remove", { name: label(byId(id), id).name })}
                onClick={() => {
                  setTouched(true);
                  setTeam(team.filter((x) => x !== id));
                }}
                className="text-fg-subtle hover:text-fg"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          {team.length < 7 && (
            <div className="relative">
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding((v) => !v)}>
                {t("meeting.add")}
              </Button>
              {adding && (
                <div className="absolute start-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-ui border border-border bg-bg p-1 shadow-ui">
                  {others.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setTouched(true);
                        setTeam([...team, p.id]);
                        setAdding(false);
                      }}
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] hover:bg-bg-hover"
                    >
                      <PersonaIcon persona={p} size={12} className="size-5" />
                      <span className="truncate">{label(p).name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-[11px] text-fg-subtle">{t("meeting.leadNote")}</p>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={MessagesSquare}
          onClick={() => void start()}
          disabled={busy || question.trim().length < 5 || team.length === 0}
        >
          {busy ? t("meeting.starting") : t("meeting.start")}
        </Button>
      </div>
    </Card>
  );
}

function MeetingList({ meetings, personas }: { meetings: Meeting[]; personas: Persona[] }) {
  const { t } = useTranslation();
  const label = usePersonaLabel();
  if (meetings.length === 0) return <p className="py-6 text-center text-[13px] text-fg-muted">{t("meeting.none")}</p>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {meetings.map((m) => (
          <li key={m.id}>
            <Link to={`/meetings/${m.id}`} data-nav-item className="block px-pad py-2.5 hover:bg-bg-hover">
              <div className="flex items-start gap-3">
                <p className="line-clamp-2 flex-1 text-[13px] font-medium">{m.question}</p>
                <Badge tone={m.status === "done" ? "success" : m.status === "failed" ? "danger" : "accent"}>
                  {t(`meeting.status_${m.status}`)}
                </Badge>
                <span className="w-20 shrink-0 text-end text-[11px] text-fg-subtle">{relativeTime(m.createdAt)}</span>
              </div>
              {m.decision && <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">{m.decision.decision}</p>}
              <p className="mt-0.5 truncate text-[11px] text-fg-subtle">
                {m.personas
                  .map(
                    (id) =>
                      label(
                        personas.find((p) => p.id === id),
                        id,
                      ).name,
                  )
                  .join(" · ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Scores({ personas }: { personas: Persona[] }) {
  const { t } = useTranslation();
  const label = usePersonaLabel();
  const [scores, setScores] = useState<PersonaScore[]>([]);
  useEffect(() => {
    api
      .personaScores()
      .then(setScores)
      .catch(() => undefined);
  }, []);
  const rows = scores
    .map((s) => ({ s, p: personas.find((p) => p.id === s.personaId) }))
    .filter((r) => r.p)
    .sort((a, b) => (b.s.lastUsed ?? 0) - (a.s.lastUsed ?? 0));
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead className="text-start text-[11px] text-fg-subtle">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-start font-medium">{t("persona.title")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_sessions")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_meetings")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_done")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_caught")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_rate")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_accepted")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_opinions")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_changed")}</th>
            <th className="px-2 py-2 text-end font-medium">{t("persona.score_tokens")}</th>
            <th className="px-3 py-2 text-end font-medium">{t("persona.score_avg")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ s, p }) => (
            <tr key={s.personaId}>
              <td className="px-3 py-1.5">
                <Link to={`/personas/${s.personaId}`} className="flex items-center gap-2 hover:underline">
                  <PersonaIcon persona={p} size={12} className="size-5" />
                  {label(p).name}
                </Link>
              </td>
              <td className="px-2 text-end tabular-nums">{s.sessions}</td>
              <td className="px-2 text-end tabular-nums">{s.meetings}</td>
              <td className="px-2 text-end tabular-nums">{s.tasksDone}</td>
              <td className="px-2 text-end tabular-nums">{s.bugsCaught}</td>
              <td className="px-2 text-end tabular-nums">
                {s.merged + s.discarded ? `${Math.round((s.merged / (s.merged + s.discarded)) * 100)}%` : "–"}
              </td>
              <td className="px-2 text-end tabular-nums">{s.accepted}</td>
              <td className="px-2 text-end tabular-nums">{s.opinions}</td>
              <td className="px-2 text-end tabular-nums">{s.changedMind}</td>
              <td className="px-2 text-end tabular-nums">{s.tokens ? compactNumber(s.tokens) : "–"}</td>
              <td className="px-3 text-end tabular-nums">{s.avgMs ? `${Math.round(s.avgMs / 1000)} s` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[11px] text-fg-subtle">{t("persona.scoreNote")}</p>
    </Card>
  );
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [target, setTarget] = useState<"claude" | "codex">("claude");
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<string[]>();
  const [error, setError] = useState<string>();
  const run = async () => {
    setError(undefined);
    try {
      setResult((await api.exportPersonas({ target, projectId: projectId || undefined })).files);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={t("persona.export")}>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">{t("persona.export")}</h2>
        <p className="text-xs leading-relaxed text-fg-muted">{t("persona.exportBody")}</p>
        <Segmented
          value={target}
          onChange={(v) => {
            setTarget(v);
            setResult(undefined);
          }}
          options={[
            { value: "claude", label: "Claude Code" },
            { value: "codex", label: "Codex" },
          ]}
        />
        {target === "claude" ? (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label={t("meeting.project")}
            className="h-8 w-full rounded-md border border-border bg-bg px-2 text-[13px]"
          >
            <option value="">{t("persona.pickProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-fg-muted">{t("persona.exportCodex")}</p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {result && <p className="text-xs text-success">{t("persona.exported", { count: result.length })}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("persona.close")}
          </Button>
          <Button
            variant="primary"
            icon={Download}
            onClick={() => void run()}
            disabled={target === "claude" && !projectId}
          >
            {t("persona.exportDo")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The persona team (plan.md Faz 6): who is on it, meetings, and how each one did. */
export function PersonasPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { personas } = usePersonas();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "team";
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [exporting, setExporting] = useState(false);
  const loadMeetings = () => {
    api
      .meetings()
      .then(setMeetings)
      .catch(() => undefined);
  };
  useEffect(loadMeetings, []);
  useServerEvent("meetings-changed", loadMeetings);
  const grouped = useMemo(
    () => GROUPS.map((g) => ({ group: g, list: personas.filter((p) => p.group === g) })).filter((g) => g.list.length),
    [personas],
  );

  return (
    <>
      <PageHeader
        title={t("persona.title")}
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={Download} onClick={() => setExporting(true)}>
              {t("persona.export")}
            </Button>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => navigate("/personas/new")}>
              {t("persona.new")}
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <div className="flex flex-wrap gap-1">
          {(["team", "meetings", "testers", "scores", "arena"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setParams(value === "team" ? {} : { tab: value }, { replace: true })}
              className={cn(
                "rounded-ui px-3 py-1 text-[13px]",
                tab === value ? "bg-bg-active font-medium text-fg" : "text-fg-muted hover:bg-bg-hover",
              )}
            >
              {t(`persona.tab_${value}`)}
            </button>
          ))}
        </div>
        {tab === "team" &&
          (personas.length === 0 ? (
            <EmptyState icon={Users} title={t("persona.title")} body={t("persona.loading")} />
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-fg-muted">{t("persona.intro")}</p>
              {grouped.map(({ group, list }) => (
                <section key={group} className="space-y-2">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
                    {t(`persona.group_${group}`)}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((p) => (
                      <PersonaCard key={p.id} persona={p} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          ))}
        {tab === "meetings" && (
          <>
            <NewMeeting personas={personas} onStarted={(m) => navigate(`/meetings/${m.id}`)} />
            <MeetingList meetings={meetings} personas={personas} />
          </>
        )}
        {tab === "testers" && <TestersTab />}
        {tab === "scores" && <Scores personas={personas} />}
        {tab === "arena" && <ArenaTab />}
      </div>
      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </>
  );
}
