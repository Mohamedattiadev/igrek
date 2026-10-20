import type { FlowRun, Schedule, ScheduleWhen } from "@igrek/core";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button, Card, EmptyState, PageHeader, RUN_TONE } from "../components/ui";
import { api } from "../lib/api";
import { dateTime, relativeTime } from "../lib/format";
import { useProjects, useServerEvent } from "../lib/live";

const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
const TEMPLATES = ["nightly-check", "weekly-deps", "daily-report"] as const;

/** "Every Friday 09:00" in the user's language. */
function useWhen(): (when: ScheduleWhen) => string {
  const { t, i18n } = useTranslation();
  return (when) => {
    if (when.kind === "once") return t("schedules.once", { at: dateTime(when.at) });
    if (when.every === "week") {
      const day = new Date(2026, 0, 4 + (when.weekday ?? 1)).toLocaleDateString(i18n.language, { weekday: "long" });
      return t("schedules.every_week", { day, time: when.time });
    }
    if (when.every === "month") return t("schedules.every_month", { day: when.day ?? 1, time: when.time });
    if (when.every === "hour") return t("schedules.every_hour", { minute: when.time.split(":")[1] ?? "00" });
    return t(`schedules.every_${when.every}`, { time: when.time });
  };
}

function Row({ s, projectName }: { s: Schedule; projectName?: string }) {
  const { t } = useTranslation();
  const describe = useWhen();
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<FlowRun[]>();
  const [error, setError] = useState<string>();
  const act = (action: "activate" | "pause" | "run" | "skip") =>
    void api.scheduleAction(s.id, action).catch((e: Error) => setError(e.message));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload the history when a new run starts
  useEffect(() => {
    if (open)
      api
        .scheduleRuns(s.id)
        .then(setRuns)
        .catch(() => undefined);
  }, [open, s.id, s.lastRunId]);
  return (
    <li className="space-y-2 px-pad py-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">{s.title}</p>
          <p className="text-xs text-fg-muted">
            {projectName} · {describe(s.when)} · {t(`flows.name_${s.flow}`, { defaultValue: s.flow })}
          </p>
          {s.summary && <p className="mt-0.5 text-xs text-fg-subtle">{s.summary}</p>}
        </div>
        <Badge tone={s.status === "active" ? "success" : s.status === "proposed" ? "warning" : "neutral"}>
          {t(`schedules.status_${s.status}`)}
        </Badge>
      </div>
      {s.status === "proposed" && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-warning bg-warning-soft/40 p-2">
          <span className="min-w-0 flex-1 text-xs">
            {s.held ? t(`schedules.held_${s.held}`) : t("schedules.confirm")}
          </span>
          <Button size="sm" variant="primary" icon={Check} onClick={() => act("activate")}>
            {t("schedules.approve")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void api.removeSchedule(s.id)}>
            {t("persona.cancel")}
          </Button>
        </div>
      )}
      {s.missedAt && (
        <div className="flex flex-wrap items-center gap-2 rounded-ui border border-warning p-2">
          <AlarmClock size={14} className="text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-xs">{t("schedules.missed", { at: dateTime(s.missedAt) })}</span>
          <Button size="sm" variant="primary" onClick={() => act("run")}>
            {t("schedules.runMissed")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act("skip")}>
            {t("schedules.skip")}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
        {s.nextAt && s.status === "active" && <span>{t("schedules.next", { when: dateTime(s.nextAt) })}</span>}
        {s.lastRunAt && <span>{t("schedules.last", { when: relativeTime(s.lastRunAt) })}</span>}
        <label className="flex items-center gap-1">
          {t("schedules.maxMinutes")}
          <input
            type="number"
            min={5}
            max={240}
            defaultValue={s.maxMinutes}
            onBlur={(e) => void api.updateSchedule(s.id, { maxMinutes: Number(e.target.value) })}
            className="h-6 w-14 rounded border border-border bg-bg px-1 text-fg"
          />
        </label>
        <label className="flex items-center gap-1">
          {t("schedules.maxTurns")}
          <input
            type="number"
            min={5}
            max={200}
            defaultValue={s.maxTurns}
            onBlur={(e) => void api.updateSchedule(s.id, { maxTurns: Number(e.target.value) })}
            className="h-6 w-14 rounded border border-border bg-bg px-1 text-fg"
          />
        </label>
        <div className="flex-1" />
        {s.status === "active" && (
          <Button size="sm" variant="ghost" icon={Pause} onClick={() => act("pause")}>
            {t("schedules.pause")}
          </Button>
        )}
        {s.status === "paused" && (
          <Button size="sm" variant="ghost" icon={Play} onClick={() => act("activate")}>
            {t("schedules.resume")}
          </Button>
        )}
        {s.status !== "proposed" && (
          <Button size="sm" variant="ghost" onClick={() => act("run")}>
            {t("schedules.runNow")}
          </Button>
        )}
        <button
          type="button"
          aria-label={t("persona.delete")}
          onClick={() => void api.removeSchedule(s.id)}
          className="p-1 text-fg-subtle hover:text-danger"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"
      >
        {open ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronRight size={11} aria-hidden="true" />}
        {t("schedules.history")}
      </button>
      {open && (
        <ul className="space-y-1 ps-4">
          {(runs ?? []).length === 0 && <li className="text-xs text-fg-subtle">{t("schedules.noRuns")}</li>}
          {runs?.map((r) => (
            <li key={r.id}>
              <Link to={`/runs/${r.id}`} className="flex items-center gap-2 text-xs hover:underline">
                <Badge tone={RUN_TONE[r.status]}>{t(`flows.status_${r.status}`)}</Badge>
                {dateTime(r.createdAt)}
                {r.error && <span className="truncate text-danger">{r.error}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}

/** Scheduled work (plan.md Faz 9): say it in a sentence, it runs on time, the result waits for you. */
export function SchedulesPage() {
  const { t } = useTranslation();
  const projects = useProjects();
  const [list, setList] = useState<Schedule[]>([]);
  const [projectId, setProjectId] = useState("");
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .schedules()
      .then(setList)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("schedules-changed", load);
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects, projectId]);
  const name = (id: string) => projects.find((p) => p.id === id)?.name;
  const propose = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.proposeSchedule(sentence, projectId);
      setSentence("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={t("schedules.title")} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("schedules.intro")}</p>
        <Card className="space-y-2 p-pad">
          <div className="flex flex-wrap gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label={t("meeting.project")}
              className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={sentence}
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sentence.trim() && void propose()}
              placeholder={t("schedules.sentenceHint")}
              aria-label={t("schedules.sentence")}
              className={`${input} min-w-60 flex-1`}
            />
            <Button
              usesModel
              variant="primary"
              icon={CalendarPlus}
              disabled={busy || sentence.trim().length < 5 || !projectId}
              onClick={() => void propose()}
            >
              {busy ? t("persona.drafting") : t("schedules.propose")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            {t("schedules.templates")}
            {TEMPLATES.map((id) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                disabled={!projectId}
                onClick={() =>
                  void api
                    .scheduleFromTemplate(projectId, id, t(`schedules.tpl_${id}`), t(`schedules.tplReq_${id}`))
                    .catch((e: Error) => setError(e.message))
                }
              >
                {t(`schedules.tpl_${id}`)}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-fg-subtle">{t("schedules.safety")}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
        </Card>
        {list.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t("schedules.title")} body={t("schedules.empty")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {list.map((s) => (
                <Row key={s.id} s={s} projectName={name(s.projectId)} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
