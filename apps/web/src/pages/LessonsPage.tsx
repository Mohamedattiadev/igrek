import type { Lesson } from "@igrek/core";
import { EyeOff, NotebookPen, Plus, Repeat2, ScrollText, Search, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState, field, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useProjects, useServerEvent } from "../lib/live";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import { LibraryTabs } from "./KnowledgePage";

const input = "w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

function LessonCard({ lesson, projectName }: { lesson: Lesson; projectName?: string }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [target, setTarget] = useState(lesson.projectId ? "project" : "");
  const [error, setError] = useState<string>();
  const repeating = lesson.repeats >= 2 && lesson.status === "active";
  return (
    <Card
      className={`space-y-2 p-pad ${repeating ? "border-warning" : ""} ${lesson.status === "dismissed" ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold">{lesson.title}</p>
        <Badge>{t(`lessons.kind_${lesson.kind}`)}</Badge>
        {projectName && <Badge tone="accent">{projectName}</Badge>}
        {lesson.status === "rule" && <Badge tone="success">{t("lessons.isRule")}</Badge>}
      </div>
      <dl className="grid gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-[110px_1fr]">
        {(["what", "why", "fix"] as const).map((k) =>
          lesson[k] ? (
            <div key={k} className="contents">
              <dt className="text-fg-subtle">{t(`lessons.${k}`)}</dt>
              <dd className="leading-relaxed">{lesson[k]}</dd>
            </div>
          ) : null,
        )}
        <dt className="font-medium text-accent">{t("lessons.prevent")}</dt>
        <dd className="font-medium leading-relaxed">{lesson.prevent}</dd>
      </dl>
      <p className="flex flex-wrap items-center gap-3 text-[11px] text-fg-subtle">
        {lesson.repeats > 1 && (
          <span className="flex items-center gap-1 text-warning">
            <Repeat2 size={12} aria-hidden="true" /> {t("lessons.repeats", { count: lesson.repeats })}
          </span>
        )}
        <span>{t("lessons.uses", { count: lesson.uses })}</span>
        <span>{relativeTime(lesson.lastSeen)}</span>
        {lesson.author && (
          <span className="flex items-center gap-1">
            <Users size={12} aria-hidden="true" /> {t("lessons.fromTeammate", { name: lesson.author })}
          </span>
        )}
      </p>
      {lesson.status !== "rule" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {repeating && <span className="text-xs text-warning">{t("lessons.ruleHint")}</span>}
          <div className="flex-1" />
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label={t("lessons.ruleTarget")}
            className={cn(field, "h-7 px-1.5 text-[12px]")}
          >
            <option value="" disabled>
              {t("lessons.ruleTarget")}
            </option>
            {lesson.projectId && <option value="project">{t("lessons.toProject")}</option>}
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {t("lessons.toPersona", { name: label(p).name })}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!target}
            onClick={() => void api.lessonRule(lesson.id, target).catch((e: Error) => setError(e.message))}
          >
            {t("lessons.makeRule")}
          </Button>
          <button
            type="button"
            aria-label={t("lessons.dismiss")}
            data-tip={t("lessons.dismiss")}
            onClick={() =>
              void api.updateLesson(lesson.id, { status: lesson.status === "dismissed" ? "active" : "dismissed" })
            }
            className="p-1 text-fg-subtle hover:text-fg"
          >
            <EyeOff size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("persona.delete")}
            onClick={() => void api.removeLesson(lesson.id)}
            className="p-1 text-fg-subtle hover:text-danger"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

function AddLesson({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [what, setWhat] = useState("");
  const [prevent, setPrevent] = useState("");
  const [error, setError] = useState<string>();
  return (
    <Card className="space-y-2 p-pad">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("lessons.titleHint")}
        aria-label={t("lessons.title")}
        className={input}
      />
      <textarea
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        rows={2}
        placeholder={t("lessons.whatHint")}
        aria-label={t("lessons.what")}
        className={input}
      />
      <input
        value={prevent}
        onChange={(e) => setPrevent(e.target.value)}
        placeholder={t("lessons.preventHint")}
        aria-label={t("lessons.prevent")}
        className={input}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t("persona.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!title.trim() || !prevent.trim()}
          onClick={async () => {
            try {
              await api.addLesson({ title, what, prevent, projectId: projectId || undefined });
              onDone();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          {t("persona.save")}
        </Button>
      </div>
    </Card>
  );
}

/** The lessons book (plan.md 7.2): what went wrong, why, the fix, and how not to do it again. */
export function LessonsPage() {
  const { t } = useTranslation();
  const projects = useProjects();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [projectId, setProjectId] = useState("");
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<"scan" | "retro">();
  const [note, setNote] = useState<string>();
  const load = () => {
    api
      .lessons({ projectId: projectId || undefined, q: q || undefined })
      .then(setLessons)
      .catch(() => undefined);
  };
  useEffect(load, [projectId, q]);
  useServerEvent("lessons-changed", load);
  const shown = lessons.filter((l) => showHidden || l.status !== "dismissed");
  const name = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <>
      <PageHeader
        title={t("lessons.page")}
        actions={
          <div className="flex gap-1">
            <Button
              usesModel
              size="sm"
              variant="ghost"
              icon={Search}
              disabled={busy !== undefined}
              onClick={async () => {
                setBusy("scan");
                setNote(undefined);
                try {
                  setNote(t("lessons.scanned", { count: (await api.scanLessons()).written }));
                } catch (err) {
                  setNote((err as Error).message);
                } finally {
                  setBusy(undefined);
                }
              }}
            >
              {busy === "scan" ? t("lessons.scanning") : t("lessons.scan")}
            </Button>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              {t("lessons.add")}
            </Button>
          </div>
        }
      />
      <LibraryTabs active="lessons" />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <p className="text-[13px] leading-relaxed text-fg-muted">{t("lessons.intro")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("lessons.search")}
            aria-label={t("lessons.search")}
            className={`${input} max-w-60`}
          />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label={t("meeting.project")}
            className={field}
          >
            <option value="">{t("lessons.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            {t("lessons.showHidden")}
          </label>
          <div className="flex-1" />
          <Button
            usesModel
            size="sm"
            icon={ScrollText}
            disabled={!projectId || busy !== undefined}
            data-tip={projectId ? t("lessons.retroTip") : t("lessons.retroPick")}
            onClick={async () => {
              setBusy("retro");
              setNote(undefined);
              try {
                await api.retrospective(projectId);
                setNote(t("lessons.retroDone"));
              } catch (err) {
                setNote((err as Error).message);
              } finally {
                setBusy(undefined);
              }
            }}
          >
            {busy === "retro" ? t("lessons.retroBusy") : t("lessons.retro")}
          </Button>
        </div>
        {note && <p className="text-xs text-fg-muted">{note}</p>}
        {adding && <AddLesson projectId={projectId} onDone={() => setAdding(false)} />}
        {shown.length === 0 ? (
          <EmptyState icon={NotebookPen} title={t("lessons.page")} body={t("lessons.empty")} />
        ) : (
          <div className="space-y-3">
            {shown.map((l) => (
              <LessonCard key={l.id} lesson={l} projectName={name(l.projectId)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
