import type { Meeting, MeetingView, WeakPoint } from "@godeye/core";
import { AlertTriangle, ArrowLeft, BookmarkPlus, Check, LoaderCircle, Swords, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { ConfidenceBadge } from "./PersonaDetail";
import { useProjects } from "./Personas";

const SEVERITY_TONE = { critical: "danger", major: "warning", minor: "neutral" } as const;

function Bullets({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{title}</p>
      <ul className="mt-0.5 list-disc space-y-0.5 ps-4 text-[12.5px] leading-relaxed">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ViewCard({ view }: { view: MeetingView }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const persona = personas.find((p) => p.id === view.personaId);
  const label = usePersonaLabel()(persona, view.personaId);
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex items-center gap-2">
        <PersonaIcon persona={persona} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{label.name}</p>
          <p className="truncate text-[11px] text-fg-subtle">{label.role}</p>
        </div>
        {view.status === "done" && view.confidence && <ConfidenceBadge value={view.confidence} />}
        {(view.status === "running" || view.status === "waiting") && (
          <span className="flex items-center gap-1 text-[11px] text-fg-muted">
            <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
            {t(`meeting.view_${view.status}`)}
          </span>
        )}
      </div>
      {view.status === "failed" && <p className="text-xs text-danger">{view.error || t("meeting.viewFailed")}</p>}
      {view.status === "done" && (
        <>
          <p className="text-[13px] leading-relaxed">{view.view}</p>
          <Bullets title={t("meeting.objections")} items={view.objections} />
          <Bullets title={t("meeting.risks")} items={view.risks} />
          {view.recommendation && (
            <p className="rounded-md bg-bg-subtle px-2.5 py-1.5 text-[12.5px]">
              <span className="font-semibold">{t("meeting.recommends")}:</span> {view.recommendation}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function WeakPointList({ points }: { points: WeakPoint[] }) {
  const { t } = useTranslation();
  if (points.length === 0) return <p className="text-xs text-fg-muted">{t("meeting.noWeakPoints")}</p>;
  return (
    <ul className="space-y-2">
      {points.map((p) => (
        <li key={p.point} className="rounded-ui border border-border p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <p className="flex-1 text-[13px] font-medium">{p.point}</p>
            <Badge tone={SEVERITY_TONE[p.severity]}>{t(`meeting.severity_${p.severity}`)}</Badge>
          </div>
          <p className="mt-1 ps-6 text-xs text-fg-muted">{p.why}</p>
          {p.test && (
            <p className="mt-1 ps-6 text-xs">
              <span className="font-medium">{t("meeting.howToTest")}:</span> {p.test}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One team meeting: everyone's view, the decision, and saving it to memory (plan.md 6.3). */
export function MeetingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { meetingId = "" } = useParams();
  const [meeting, setMeeting] = useState<Meeting>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"commit" | "weak">();
  const projects = useProjects();
  const load = () => {
    api
      .meeting(meetingId)
      .then(setMeeting)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [meetingId]);
  useServerEvent("meetings-changed", (m) => m.meetingId === meetingId && load());

  const act = async (kind: "commit" | "weak", run: () => Promise<Meeting>) => {
    setBusy(kind);
    setError(undefined);
    try {
      setMeeting(await run());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  if (!meeting)
    return (
      <>
        <PageHeader title={t("meeting.title")} />
        <p className="p-6 text-[13px] text-fg-muted">{error ?? t("persona.loading")}</p>
      </>
    );
  const d = meeting.decision;
  const project = projects.find((p) => p.id === meeting.projectId);
  const done = meeting.views.filter((v) => v.status === "done").length;

  return (
    <>
      <PageHeader
        title={t("meeting.title")}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={() => void api.deleteMeeting(meeting.id).then(() => navigate("/personas?tab=meetings"))}
          >
            {t("persona.delete")}
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
        <Link
          to="/personas?tab=meetings"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" /> {t("persona.tab_meetings")}
        </Link>
        <div>
          <h2 className="whitespace-pre-wrap text-[15px] font-semibold">{meeting.question}</h2>
          <p className="mt-1 text-xs text-fg-subtle">
            {project ? project.name : t("meeting.noProject")} · {relativeTime(meeting.createdAt)} ·{" "}
            {t(`meeting.status_${meeting.status}`)}
            {meeting.status === "running" && ` (${done}/${meeting.views.length})`}
          </p>
        </div>
        {meeting.status === "failed" && meeting.error && <p className="text-xs text-danger">{meeting.error}</p>}
        {meeting.status === "deciding" && (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> {t("meeting.deciding")}
          </p>
        )}

        {d && (
          <Card className="space-y-3 border-accent p-pad">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t("meeting.decision")}</p>
                <p className="mt-0.5 text-[14px] font-semibold leading-relaxed">{d.decision}</p>
              </div>
              <ConfidenceBadge value={d.confidence} />
            </div>
            <p className="text-[13px] leading-relaxed text-fg-muted">{d.why}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Bullets title={t("meeting.agreements")} items={d.agreements} />
              <Bullets title={t("meeting.disagreements")} items={d.disagreements} />
              <Bullets title={t("meeting.actions")} items={d.actions} />
              <Bullets title={t("meeting.openQuestions")} items={d.openQuestions} />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              {!meeting.projectId && (
                <select
                  defaultValue=""
                  onChange={(e) =>
                    e.target.value && void act("commit", () => api.meetingProject(meeting.id, e.target.value))
                  }
                  aria-label={t("meeting.project")}
                  className="h-8 rounded-md border border-border bg-bg px-2 text-[13px]"
                >
                  <option value="">{t("persona.pickProject")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="ghost"
                icon={Swords}
                onClick={() => void act("weak", () => api.meetingWeakPoints(meeting.id))}
                disabled={busy !== undefined}
              >
                {busy === "weak" ? t("meeting.looking") : t("meeting.weakPoints")}
              </Button>
              {meeting.memoryId ? (
                <Badge tone="success">
                  <Check size={11} className="me-1" aria-hidden="true" />
                  {t("meeting.saved")}
                </Badge>
              ) : (
                <Button
                  variant="primary"
                  icon={BookmarkPlus}
                  onClick={() => void act("commit", () => api.commitMeeting(meeting.id))}
                  disabled={!meeting.projectId || busy !== undefined}
                >
                  {t("meeting.commit")}
                </Button>
              )}
            </div>
          </Card>
        )}
        {meeting.weaknesses && (
          <Card className="space-y-2 p-pad">
            <p className="text-[13px] font-semibold">{t("meeting.weakTitle")}</p>
            <WeakPointList points={meeting.weaknesses} />
          </Card>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {meeting.views.map((view) => (
            <ViewCard key={view.personaId} view={view} />
          ))}
        </div>
      </div>
    </>
  );
}
