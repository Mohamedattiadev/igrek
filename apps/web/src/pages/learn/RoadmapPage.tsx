import { type QuizQuestion, type RoadmapStep, type ServedRoadmap, STAGES } from "@godeye/learn";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Clock,
  ExternalLink,
  Flag,
  GraduationCap,
  Languages,
  MessageCircle,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Markdown } from "../../components/Markdown";
import { Badge, Button, Card, PageHeader } from "../../components/ui";
import { cn } from "../../lib/cn";
import { learnApi, optionsIn, type StageCheck, textIn } from "../../lib/learn-api";
import { useProjects } from "../../lib/live";
import { usePersonaLabel, usePersonas } from "../../lib/personas";
import { PersonaChatDialog } from "../PersonaDetail";
import { type LearnIndex, useLearnIndex } from "./Learn";
import { Code } from "./SheetPage";

type Tx = ReturnType<typeof textIn>;

function Quiz({
  q,
  path,
  tx,
  translation,
}: {
  q: QuizQuestion;
  path: string;
  tx: Tx;
  translation?: Record<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const [chosen, setChosen] = useState<number>();
  const options = optionsIn(i18n.language, q.options, `${path}.options`, translation);
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-medium">{tx(q.q, `${path}.q`)}</p>
      <div className="grid gap-1">
        {options.map((o, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: options are fixed for a question
            key={i}
            type="button"
            disabled={chosen !== undefined}
            onClick={() => setChosen(i)}
            className={cn(
              "rounded-ui border px-2.5 py-1.5 text-start text-[12.5px] transition-colors",
              chosen === undefined && "border-border hover:border-accent",
              chosen !== undefined && i === q.answer && "border-success bg-success-soft",
              chosen === i && i !== q.answer && "border-danger bg-danger-soft",
              chosen !== undefined && i !== q.answer && chosen !== i && "border-border opacity-60",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {chosen !== undefined && (
        <p className={cn("text-xs leading-relaxed", chosen === q.answer ? "text-success" : "text-danger")}>
          {chosen === q.answer ? t("learn.right") : t("learn.wrong")} {tx(q.why, `${path}.why`)}
          <button type="button" className="ms-2 text-fg-muted underline" onClick={() => setChosen(undefined)}>
            {t("learn.again")}
          </button>
        </p>
      )}
    </div>
  );
}

/** The steps on a stage-by-stage grid, with lines from each step to the ones it needs. */
function StepGraph({
  roadmap,
  done,
  selected,
  onSelect,
  tx,
}: {
  roadmap: ServedRoadmap;
  done: Set<string>;
  selected?: string;
  onSelect: (id: string) => void;
  tx: Tx;
}) {
  const { t } = useTranslation();
  const W = 132;
  const H = 46;
  const GAP_X = 22;
  const GAP_Y = 10;
  const pos = new Map<string, { x: number; y: number }>();
  const perStage = new Map<number, number>();
  for (const s of roadmap.steps) {
    const col = STAGES.indexOf(s.stage);
    const row = perStage.get(col) ?? 0;
    perStage.set(col, row + 1);
    pos.set(s.id, { x: col * (W + GAP_X), y: 20 + row * (H + GAP_Y) });
  }
  const rows = Math.max(...perStage.values());
  const width = STAGES.length * (W + GAP_X);
  const height = 20 + rows * (H + GAP_Y);
  return (
    <div className="overflow-x-auto">
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG drawing with links inside, not a form */}
      <svg width={width} height={height} role="group" aria-label={t("learn.graph")} className="text-fg">
        {STAGES.map((st, i) => (
          <text key={st} x={i * (W + GAP_X) + 2} y={12} className="fill-fg-subtle text-[10px]">
            {i}. {t(`learn.stage_${st}`)}
          </text>
        ))}
        {roadmap.steps.flatMap((s) =>
          (s.needs ?? [])
            .filter((n) => !n.includes("/") && pos.has(n))
            .map((n) => {
              const a = pos.get(n) as { x: number; y: number };
              const b = pos.get(s.id) as { x: number; y: number };
              // In the same stage the line goes down between the boxes; otherwise from right to left.
              const same = a.x === b.x;
              const d = same
                ? `M${a.x + W / 2},${a.y + H} L${b.x + W / 2},${b.y}`
                : `M${a.x + W},${a.y + H / 2} C${a.x + W + GAP_X},${a.y + H / 2} ${b.x - GAP_X},${b.y + H / 2} ${b.x},${b.y + H / 2}`;
              return <path key={`${n}-${s.id}`} d={d} className="fill-none stroke-border" strokeWidth={1.5} />;
            }),
        )}
        {roadmap.steps.map((s, i) => {
          const p = pos.get(s.id) as { x: number; y: number };
          const isDone = done.has(s.id);
          const title = tx(s.title, `steps.${i}.title`);
          return (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a button element
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={title}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.id)}
              className="cursor-pointer outline-none"
            >
              <rect
                x={p.x}
                y={p.y}
                width={W}
                height={H}
                rx={8}
                className={cn(
                  "stroke-[1.5]",
                  isDone ? "fill-success-soft stroke-success" : "fill-bg stroke-border",
                  selected === s.id && "stroke-accent stroke-2",
                )}
              />
              <foreignObject x={p.x + 6} y={p.y + 4} width={W - 12} height={H - 8}>
                <p className="line-clamp-2 text-[11px] leading-tight">{title}</p>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function StepView({
  roadmap,
  step,
  index,
  i,
  tx,
  translation,
  isDone,
  onDone,
  onAsk,
  practiceId,
  setPracticeId,
}: {
  roadmap: ServedRoadmap;
  step: RoadmapStep;
  index: LearnIndex;
  i: number;
  tx: Tx;
  translation?: Record<string, string>;
  isDone: boolean;
  onDone: (v: boolean) => void;
  onAsk: (draft: string) => void;
  practiceId?: string;
  setPracticeId: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const key = `${roadmap.id}/${step.id}`;
  const reported = index.state.reports.find((r) => r.key === key);
  const p = `steps.${i}`;
  const title = tx(step.title, `${p}.title`);
  const needs = (step.needs ?? []).map((n) => {
    if (n.includes("/")) return { id: n, link: `/learn/r/${n.split("/")[0]}?step=${n.split("/")[1]}`, title: n };
    const j = roadmap.steps.findIndex((s) => s.id === n);
    return { id: n, link: `?step=${n}`, title: tx(roadmap.steps[j]?.title, `steps.${j}.title`) };
  });
  return (
    <Card className="space-y-4 p-pad">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-fg-subtle">
            {STAGES.indexOf(step.stage)}. {t(`learn.stage_${step.stage}`)}
          </p>
          <h2 className="text-[15px] font-semibold">{title}</h2>
        </div>
        <span className="flex items-center gap-1 text-xs text-fg-muted">
          <Clock size={12} aria-hidden="true" />
          {step.minutes < 90
            ? t("learn.minutes", { count: step.minutes })
            : t("learn.hours", { count: Math.round(step.minutes / 60) })}
        </span>
        <Button
          size="sm"
          variant={isDone ? "secondary" : "primary"}
          icon={isDone ? CircleCheck : Check}
          onClick={() => onDone(!isDone)}
        >
          {isDone ? t("learn.doneStep") : t("learn.markDone")}
        </Button>
      </div>
      {needs.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          {t("learn.needs")}
          {needs.map((n) => (
            <Link
              key={n.id}
              to={n.link}
              className={cn(
                "rounded border px-1.5 py-0.5",
                index.state.done.includes(n.id.includes("/") ? n.id : `${roadmap.id}/${n.id}`)
                  ? "border-success text-success"
                  : "border-border",
              )}
            >
              {n.title}
            </Link>
          ))}
        </p>
      )}
      <section className="space-y-1">
        <h3 className="text-[12.5px] font-semibold text-accent">{t("learn.why")}</h3>
        <Markdown text={tx(step.why, `${p}.why`)} className="prose-godeye text-[13px]" />
      </section>
      <section className="space-y-1">
        <h3 className="text-[12.5px] font-semibold text-accent">{t("learn.learn")}</h3>
        <Markdown text={tx(step.learn, `${p}.learn`)} className="prose-godeye text-[13px]" />
      </section>
      <section className="space-y-1">
        <h3 className="text-[12.5px] font-semibold text-accent">{t("learn.do")}</h3>
        <Markdown text={tx(step.do, `${p}.do`)} className="prose-godeye text-[13px]" />
      </section>
      {(step.code ?? []).length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12.5px] font-semibold text-accent">{t("learn.code")}</h3>
          {step.code?.map((c) => (
            <Code key={c.file + c.text.slice(0, 20)} text={c.text} lang={c.lang} label={c.file} />
          ))}
        </section>
      )}
      {(step.mistakes ?? []).length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-[12.5px] font-semibold text-danger">{t("learn.mistakes")}</h3>
          <dl className="space-y-1.5 text-[12.5px]">
            {step.mistakes?.map((m, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
              <div key={j} className="rounded-ui bg-bg-subtle px-2.5 py-1.5">
                <dt className="font-medium">{tx(m.problem, `${p}.mistakes.${j}.problem`)}</dt>
                <dd className="text-fg-muted">{tx(m.fix, `${p}.mistakes.${j}.fix`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {(step.quiz ?? []).length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
            <CircleHelp size={13} aria-hidden="true" /> {t("learn.quiz")}
          </h3>
          {step.quiz?.map((q, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
            <Quiz key={j} q={q} path={`${p}.quiz.${j}`} tx={tx} translation={translation} />
          ))}
        </section>
      )}
      <section className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
        {step.sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-fg-muted hover:text-accent"
          >
            <ExternalLink size={11} aria-hidden="true" /> {s.title}
          </a>
        ))}
      </section>
      {reported && <p className="text-[11.5px] text-warning">{t("learn.reported", { reason: reported.reason })}</p>}
      {reporting && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void learnApi.mark("report", key, reason).then(() => setReporting(false));
          }}
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("learn.reportHint")}
            aria-label={t("learn.report")}
            className="h-8 min-w-0 flex-1 rounded-ui border border-border bg-bg px-2.5 text-[13px]"
          />
          <Button size="sm" type="submit">
            {t("learn.save")}
          </Button>
        </form>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          icon={MessageCircle}
          onClick={() => onAsk(t("learn.askDraft", { step: title, roadmap: roadmap.title }))}
        >
          {t("learn.askTeacher")}
        </Button>
        <Button
          size="sm"
          icon={Wand2}
          disabled={busy}
          data-tip={t("learn.doForMeTip")}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              const id = practiceId ?? (await learnApi.practice(roadmap.id)).projectId;
              setPracticeId(id);
              const { runId } = await learnApi.doStep(roadmap.id, step.id, id);
              void navigate(`/runs/${runId}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("learn.doForMe")}
        </Button>
        <div className="flex-1" />
        <button
          type="button"
          className="flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-warning"
          onClick={() => setReporting(true)}
        >
          <Flag size={12} aria-hidden="true" /> {t("learn.reportStep")}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

const STATE_ICON = { done: CircleCheck, missing: CircleDashed, unknown: CircleHelp };

/** "Which step is this project at?" — each stage judged from what God Eye knows about the project. */
function ProjectStages() {
  const { t } = useTranslation();
  const projects = useProjects();
  const [projectId, setProjectId] = useState("");
  const [checks, setChecks] = useState<StageCheck[]>();
  useEffect(() => {
    if (!projectId) return setChecks(undefined);
    void learnApi
      .stages(projectId)
      .then(setChecks)
      .catch(() => setChecks([]));
  }, [projectId]);
  const reason = (r: string) => {
    const [k, v] = r.split(":");
    return t(`learn.reason_${k}`, { v });
  };
  return (
    <Card className="space-y-2 p-pad">
      <p className="text-[13px] font-semibold">{t("learn.whereIs")}</p>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        aria-label={t("learn.whereIs")}
        className="h-8 w-full rounded-ui border border-border bg-bg px-2 text-[13px]"
      >
        <option value="">{t("learn.pickProject")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {checks && (
        <ul className="space-y-1 text-[12px]">
          {checks.map((c) => {
            const Icon = STATE_ICON[c.state];
            const body = (
              <>
                <Icon
                  size={13}
                  className={cn(
                    "shrink-0",
                    c.state === "done" ? "text-success" : c.state === "missing" ? "text-warning" : "text-fg-subtle",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {STAGES.indexOf(c.stage)}. {t(`learn.stage_${c.stage}`)}
                </span>
                <span className="text-[11px] text-fg-subtle">{reason(c.reason)}</span>
              </>
            );
            return (
              <li key={c.stage}>
                {c.link ? (
                  <Link to={c.link} className="flex items-center gap-1.5 hover:text-accent">
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** One roadmap: the steps from an empty computer to a deployed app, with progress and a teacher. */
export function RoadmapPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { roadmapId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { index: loaded } = useLearnIndex();
  const [index, setIndex] = useState<LearnIndex>();
  useEffect(() => setIndex(loaded), [loaded]);
  const [roadmap, setRoadmap] = useState<ServedRoadmap>();
  const [translation, setTranslation] = useState<Record<string, string>>();
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState<string>();
  const [practiceId, setPracticeId] = useState<string>();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  useEffect(() => {
    learnApi
      .roadmap(roadmapId, lang)
      .then((r) => {
        setRoadmap(r.roadmap);
        setTranslation(r.translation);
      })
      .catch((e: Error) => setError(e.message));
  }, [roadmapId, lang]);
  const tx = useMemo(() => textIn(lang, translation), [lang, translation]);
  const done = useMemo(
    () =>
      new Set(
        (index?.state.done ?? [])
          .filter((d) => d.startsWith(`${roadmapId}/`))
          .map((d) => d.slice(roadmapId.length + 1)),
      ),
    [index, roadmapId],
  );
  const firstOpen = roadmap?.steps.find((s) => !done.has(s.id))?.id ?? roadmap?.steps[0]?.id;
  const selected = params.get("step") ?? firstOpen;
  const i = roadmap?.steps.findIndex((s) => s.id === selected) ?? -1;
  const step = roadmap?.steps[i];
  const other = lang !== "en" && lang !== "tr";
  const teacher = roadmap
    ? label(
        personas.find((p) => p.id === roadmap.teacher),
        roadmap.teacher,
      ).name
    : "";
  return (
    <>
      <PageHeader
        title={roadmap?.title ?? t("learn.title")}
        actions={
          other && !translation ? (
            <Button
              size="sm"
              icon={Languages}
              disabled={translating}
              onClick={() => {
                setTranslating(true);
                void learnApi
                  .translate("roadmap", roadmapId, lang)
                  .then(setTranslation)
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setTranslating(false));
              }}
            >
              {translating ? t("learn.translating") : t("learn.translate")}
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <Link to="/learn?view=roadmaps" className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={13} aria-hidden="true" /> {t("learn.back")}
        </Link>
        {error && <p className="text-xs text-danger">{error}</p>}
        {roadmap && index && (
          <>
            <div className="grid gap-3 md:grid-cols-[1fr_300px]">
              <Card className="space-y-2 p-pad">
                <p className="text-[13.5px] leading-relaxed">{tx(roadmap.summary, "summary")}</p>
                <p className="text-[12.5px] text-fg-muted">
                  <span className="font-medium text-fg">{t("learn.project")}</span> {tx(roadmap.project, "project")}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-bg-muted">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${(done.size / roadmap.steps.length) * 100}%` }}
                  />
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-subtle">
                  <span>{t("learn.progress", { done: done.size, total: roadmap.steps.length })}</span>
                  <span className="flex items-center gap-1">
                    <GraduationCap size={12} aria-hidden="true" /> {t("learn.teacher", { name: teacher })}
                  </span>
                  {roadmap.version && <span>{t("learn.describes", { v: roadmap.version })}</span>}
                  <span>{t("learn.checked", { at: roadmap.checked })}</span>
                  {(roadmap.after ?? []).map((a) => (
                    <Link key={a} to={`/learn/r/${a}`} className="text-accent">
                      {t("learn.after", { name: index.roadmaps.find((r) => r.id === a)?.title ?? a })}
                    </Link>
                  ))}
                  {(roadmap.sheets ?? []).map((s) => (
                    <Link key={s} to={`/learn/s/${s}`} className="flex items-center gap-1 text-accent">
                      <BookOpen size={11} aria-hidden="true" />
                      {index.sheets.find((x) => x.id === s)?.title ?? s}
                    </Link>
                  ))}
                </p>
                {other && translation && <p className="text-xs text-fg-subtle">{t("learn.machine")}</p>}
              </Card>
              <ProjectStages />
            </div>
            <Card className="p-pad">
              <StepGraph
                roadmap={roadmap}
                done={done}
                selected={selected}
                onSelect={(id) => setParams({ step: id }, { replace: true })}
                tx={tx}
              />
            </Card>
            {step && (
              <StepView
                key={step.id}
                roadmap={roadmap}
                step={step}
                index={index}
                i={i}
                tx={tx}
                translation={translation}
                isDone={done.has(step.id)}
                onDone={(v) =>
                  void learnApi.mark("done", `${roadmap.id}/${step.id}`, v).then((state) => {
                    setIndex({ ...index, state });
                    const next = roadmap.steps[i + 1];
                    if (v && next) setParams({ step: next.id }, { replace: true });
                  })
                }
                onAsk={setAsking}
                practiceId={practiceId}
                setPracticeId={setPracticeId}
              />
            )}
            <div className="flex flex-wrap gap-1.5">
              {roadmap.steps.map((s, j) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setParams({ step: s.id }, { replace: true })}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    s.id === selected ? "border-accent text-accent" : "border-border text-fg-muted",
                    done.has(s.id) && "bg-success-soft",
                  )}
                >
                  {j + 1}
                </button>
              ))}
              <Badge>
                {t("learn.hours", { count: Math.round(roadmap.steps.reduce((n, s) => n + s.minutes, 0) / 60) })}
              </Badge>
            </div>
          </>
        )}
      </div>
      {roadmap && (
        <PersonaChatDialog
          personaId={roadmap.teacher}
          open={asking !== undefined}
          onClose={() => setAsking(undefined)}
          draft={asking}
          first={practiceId ? [practiceId] : []}
        />
      )}
    </>
  );
}
