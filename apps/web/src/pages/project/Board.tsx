import type { BoardTask, FlowRun, ProjectDetail, TaskStatus } from "@godeye/core";
import { ArrowRight, Plus, Trash2, Users, Workflow } from "lucide-react";
import { type DragEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card, Segmented } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { Roadmap } from "./Roadmap";

const COLUMNS: TaskStatus[] = ["todo", "doing", "review", "done"];
export const RUN_TONE = {
  running: "accent",
  needs_you: "warning",
  ready: "warning",
  done: "success",
  merged: "success",
  failed: "danger",
  stopped: "neutral",
  discarded: "neutral",
  waiting_limit: "warning",
} as const;

function CardView({ task, run, onDragStart }: { task: BoardTask; run?: FlowRun; onDragStart: (e: DragEvent) => void }) {
  const { t } = useTranslation();
  const next = COLUMNS[COLUMNS.indexOf(task.status) + 1];
  const [error, setError] = useState<string>();
  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="group space-y-1.5 rounded-ui border border-border bg-bg p-2.5 shadow-sm"
      data-nav-item
      tabIndex={-1}
    >
      <p className="text-[13px] font-medium leading-snug">{task.title}</p>
      {task.description && <p className="line-clamp-3 text-xs text-fg-muted">{task.description}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {task.origin && <Badge>{task.origin}</Badge>}
        {run && (
          <Link to={`/runs/${run.id}`} className="inline-flex">
            <Badge tone={RUN_TONE[run.status]}>{t(`flows.status_${run.status}`)}</Badge>
          </Link>
        )}
        <span className="text-[11px] text-fg-subtle">{relativeTime(task.updatedAt)}</span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label={t("persona.delete")}
          onClick={() => void api.removeCard(task.id)}
          className="p-0.5 text-fg-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
        {next && (
          <button
            type="button"
            aria-label={t("board.moveTo", { column: t(`board.col_${next}`) })}
            data-tip={next === "doing" ? t("board.startTip") : t("board.moveTo", { column: t(`board.col_${next}`) })}
            onClick={() => void api.moveCard(task.id, next).catch((e: Error) => setError(e.message))}
            className="rounded p-0.5 text-fg-subtle hover:bg-bg-hover hover:text-fg"
          >
            <ArrowRight size={13} className="rtl:rotate-180" aria-hidden="true" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}

/** Give the team a job right away, without a card. */
function StartRun({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<{ name: string; description: string; source?: string }[]>([]);
  const [archon, setArchon] = useState<{ installed: boolean; workflows: { name: string; description: string }[] }>();
  const [flow, setFlow] = useState("feature");
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .projectFlows(projectId)
      .then((r) => {
        setFlows(r.flows);
        setArchon(r.archon);
      })
      .catch(() => undefined);
  }, [projectId]);
  const chosen = flows.find((f) => f.name === flow);
  return (
    <Card className="space-y-2 p-pad">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Users size={14} className="text-accent" aria-hidden="true" /> {t("board.giveTeam")}
      </p>
      <textarea
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={2}
        placeholder={t("board.requestHint")}
        aria-label={t("board.request")}
        className="w-full rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={flow}
          onChange={(e) => setFlow(e.target.value)}
          aria-label={t("board.flow")}
          className="h-8 rounded-md border border-border bg-bg px-2 text-[12.5px]"
        >
          {flows.map((f) => (
            <option key={f.name} value={f.name}>
              {t(`flows.name_${f.name}`, { defaultValue: f.name })}
              {f.source !== "builtin" ? ` (${f.source})` : ""}
            </option>
          ))}
          {archon?.workflows.map((w) => (
            <option key={w.name} value={`archon:${w.name}`}>
              Archon: {w.name}
            </option>
          ))}
        </select>
        <span className="min-w-0 flex-1 text-[11px] text-fg-subtle">
          {chosen ? t(`flows.desc_${chosen.name}`, { defaultValue: chosen.description }) : ""}
        </span>
        <Button
          variant="primary"
          icon={Workflow}
          disabled={busy || request.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              navigate(`/runs/${(await api.startFlow({ projectId, flow, request })).id}`);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("board.start")}
        </Button>
      </div>
      <p className="text-[11px] text-fg-subtle">{archon?.installed ? t("board.archonOn") : t("board.safety")}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

/** The task board (plan.md Faz 8): moving a card to Doing starts the team on it. */
export function BoardTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [title, setTitle] = useState("");
  const [over, setOver] = useState<TaskStatus>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<"board" | "roadmap">("board");
  const load = () => {
    api
      .board(project.id)
      .then(setTasks)
      .catch(() => undefined);
    api
      .flowRuns(project.id)
      .then(setRuns)
      .catch(() => undefined);
  };
  useEffect(load, [project.id]);
  useServerEvent("board-changed", (m) => m.projectId === project.id && load());
  useServerEvent("flows-changed", load);
  const drop = (status: TaskStatus) => async (e: DragEvent) => {
    e.preventDefault();
    setOver(undefined);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    setError(undefined);
    await api.moveCard(id, status).catch((err: Error) => setError(err.message));
  };
  const looseRuns = runs.filter((r) => !r.taskId).slice(0, 5);

  const views = (
    <Segmented
      label={t("roadmap.view")}
      value={view}
      onChange={setView}
      options={[
        { value: "board", label: t("roadmap.boardView") },
        { value: "roadmap", label: t("roadmap.title") },
      ]}
    />
  );
  if (view === "roadmap")
    return (
      <div className="space-y-4">
        {views}
        <Roadmap projectId={project.id} tasks={tasks} runs={runs} />
      </div>
    );
  return (
    <div className="space-y-4">
      {views}
      <StartRun projectId={project.id} />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map((column) => (
          <section
            key={column}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(column);
            }}
            onDragLeave={() => setOver(undefined)}
            onDrop={drop(column)}
            aria-label={t(`board.col_${column}`)}
            className={cn(
              "min-h-40 space-y-2 rounded-ui border p-2",
              over === column ? "border-accent bg-accent-soft/30" : "border-border bg-bg-subtle",
            )}
          >
            <h3 className="flex items-center justify-between px-1 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
              {t(`board.col_${column}`)}
              <span>{tasks.filter((x) => x.status === column).length}</span>
            </h3>
            {column === "todo" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!title.trim()) return;
                  await api.addCard(project.id, { title });
                  setTitle("");
                }}
                className="flex gap-1"
              >
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("board.newCard")}
                  aria-label={t("board.newCard")}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent"
                />
                <Button size="sm" icon={Plus} type="submit" aria-label={t("board.add")} />
              </form>
            )}
            <ul className="space-y-2">
              {tasks
                .filter((x) => x.status === column)
                .map((task) => (
                  <CardView
                    key={task.id}
                    task={task}
                    run={runs.find((r) => r.id === task.runId)}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-[11px] text-fg-subtle">{t("board.hint")}</p>
      {looseRuns.length > 0 && (
        <Card>
          <p className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("board.runs")}</p>
          <ul className="divide-y divide-border">
            {looseRuns.map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center gap-2 px-pad py-2 hover:bg-bg-hover">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{r.request.split("\n")[0]}</span>
                  <Badge tone={RUN_TONE[r.status]}>{t(`flows.status_${r.status}`)}</Badge>
                  <span className="text-[11px] text-fg-subtle">{relativeTime(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
