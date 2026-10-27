import type { BoardTask, FlowRun, ProjectDetail, TaskStatus } from "@igrek/core";
import {
  ArrowRight,
  ChevronDown,
  GripVertical,
  Hand,
  MessageSquarePlus,
  Plus,
  Trash2,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import { TeamAvatar, useTeamPeople } from "../../components/TeamAvatar";
import { Badge, Button, Card, RUN_TONE, Segmented } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { usePersonaLabel, usePersonas } from "../../lib/personas";
import { ImportCards } from "./ImportCards";
import { Roadmap } from "./Roadmap";

const COLUMNS: TaskStatus[] = ["todo", "doing", "review", "done"];

/** A job's request as a title: its first line of words, not a Markdown heading like "## Goal". */
function requestTitle(request: string): string {
  const lines = request
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return (lines.find((l) => !l.startsWith("#")) ?? lines[0] ?? "").replace(/^#+\s*/, "");
}

/** "Kerim is on it", with his face, or a clear "I'm taking this" when nobody has the card yet. */
function Taker({ task, onError }: { task: BoardTask; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const me = people.status?.user;
  if (!people.status?.configured || !me) return null;
  const claim = (on: boolean) => void api.claimCard(task.id, on).catch((e: Error) => onError(e.message));
  if (!task.claimedBy)
    return (
      <button
        type="button"
        onClick={() => claim(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-ui border border-accent bg-accent-soft py-1 text-[12px] font-medium text-accent hover:bg-accent hover:text-white"
      >
        <Hand size={13} aria-hidden="true" />
        {t("board.take")}
      </button>
    );
  const member = people.status.members.find((m) => m.id === task.claimedBy?.id);
  const mine = task.claimedBy.id === me.id;
  return (
    <div className="flex items-center gap-1.5 rounded-ui bg-bg-subtle px-1.5 py-1 text-[12px]">
      {member ? (
        <TeamAvatar member={member} size={20} />
      ) : (
        <span className="flex size-5 items-center justify-center rounded-full bg-bg-muted text-[10px] font-semibold">
          {task.claimedBy.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate">
        <span className="font-semibold">{mine ? t("board.you") : task.claimedBy.name}</span>{" "}
        <span className="text-fg-muted">{t("board.onIt")}</span>
      </span>
      {mine && (
        <button type="button" onClick={() => claim(false)} className="ms-auto text-[11px] text-fg-subtle hover:text-fg">
          {t("board.release")}
        </button>
      )}
    </div>
  );
}

/**
 * Who a card is for (plan.md 4.4): a teammate or a persona, picked from a small chip instead of a
 * full drop-down on every card.
 */
function CardPeople({ task, onError }: { task: BoardTask; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const personaName = (id: string) =>
    label(
      personas.find((p) => p.id === id),
      id,
    ).name;
  const team = people.status?.configured;
  const value = task.assignee ? `${task.assignee.kind}:${task.assignee.id}` : "";
  const pick = (choice: string) => {
    const [kind, id = ""] = choice.split(":") as ["person" | "persona", string];
    const name = kind === "person" ? people.status?.members.find((m) => m.id === id)?.displayName : personaName(id);
    void api
      .assignCard(task.id, choice ? { kind, id, name: name || id } : null)
      .catch((e: Error) => onError(e.message));
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
      <label
        className={cn(
          "relative inline-flex max-w-36 items-center gap-1 rounded-full border px-2 py-0.5",
          task.assignee ? "border-border text-fg" : "border-dashed border-border",
        )}
        data-tip={t("board.assign")}
      >
        <UserRound size={11} aria-hidden="true" />
        <span className="truncate">{task.assignee?.name ?? t("board.nobody")}</span>
        <select
          value={value}
          onChange={(e) => pick(e.target.value)}
          aria-label={t("board.assign")}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="">{t("board.nobody")}</option>
          {team &&
            (people.status?.members ?? []).map((m) => (
              <option key={m.id} value={`person:${m.id}`}>
                {m.displayName}
              </option>
            ))}
          {personas.map((p) => (
            <option key={p.id} value={`persona:${p.id}`}>
              {personaName(p.id)}
            </option>
          ))}
        </select>
      </label>
      {task.author && <span className="truncate text-fg-subtle">{t("board.from", { name: task.author })}</span>}
    </div>
  );
}

/**
 * "Work on it": a chat in the project that starts with the card, carrying its mark, so the card moves
 * to Doing when the chat starts, to Review when it is done and to Done with the commit (board-auto.ts).
 */
function WorkOnIt({ task, onError }: { task: BoardTask; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const start = () =>
    void api
      .startTask(task.id)
      .then((r) => {
        const draft = [r.title, r.description, t("board.workMark", { mark: r.mark })].filter(Boolean).join("\n\n");
        void navigate(`/c/new?project=${encodeURIComponent(r.projectId)}&draft=${encodeURIComponent(draft)}`);
      })
      .catch((e: Error) => onError(e.message));
  return (
    <button
      type="button"
      onClick={start}
      data-tip={t("board.workTip")}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft"
    >
      <MessageSquarePlus size={12} aria-hidden="true" />
      {t("board.work")}
    </button>
  );
}

function CardView({
  task,
  run,
  focused,
  onDragStart,
  onDropHere,
}: {
  task: BoardTask;
  run?: FlowRun;
  /** Opened from a message or "my cards": shown and marked. */
  focused: boolean;
  onDragStart: (e: DragEvent) => void;
  /** A card dropped on this one goes just before it, in this column. */
  onDropHere: (e: DragEvent) => void;
}) {
  const { t } = useTranslation();
  const next = COLUMNS[COLUMNS.indexOf(task.status) + 1];
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const self = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) self.current?.scrollIntoView({ block: "center" });
  }, [focused]);
  return (
    <li
      ref={self}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
        onDragStart(e);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropHere}
      className={cn(
        "group cursor-grab space-y-2 rounded-ui border border-border bg-bg p-2.5 shadow-sm transition-shadow hover:shadow-ui",
        dragging && "opacity-50",
        focused && "ring-2 ring-accent",
      )}
      data-nav-item
      tabIndex={-1}
    >
      <p className="flex items-start gap-1 text-[13px] font-medium leading-snug">
        <GripVertical
          size={13}
          className="mt-0.5 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">{task.title}</span>
      </p>
      {task.description && <p className="line-clamp-2 text-xs text-fg-muted">{task.description}</p>}
      <Taker task={task} onError={setError} />
      <CardPeople task={task} onError={setError} />
      <div className="flex flex-wrap items-center gap-1.5">
        {task.origin && <Badge>{task.origin}</Badge>}
        {run && (
          <Link to={`/runs/${run.id}`} className="inline-flex">
            <Badge tone={RUN_TONE[run.status]}>{t(`flows.status_${run.status}`)}</Badge>
          </Link>
        )}
        <span className="text-[11px] text-fg-subtle">{relativeTime(task.updatedAt)}</span>
        <div className="flex-1" />
        {task.status === "todo" && task.assignee?.kind !== "persona" && <WorkOnIt task={task} onError={setError} />}
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
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-2 rounded-ui border border-dashed border-border px-pad py-2 text-start text-[13px] text-fg-muted hover:border-accent hover:text-fg"
      >
        <Users size={14} className="text-accent" aria-hidden="true" />
        <span className="font-medium text-fg">{t("board.giveTeam")}</span>
        <span className="hidden min-w-0 flex-1 truncate text-[12px] sm:block">{t("board.giveTeamHint")}</span>
        <ChevronDown size={14} className="ms-auto" aria-hidden="true" />
      </button>
    );
  return (
    <Card className="space-y-2 p-pad">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-expanded={true}
        className="flex w-full items-center gap-2 text-start text-[13px] font-semibold"
      >
        <Users size={14} className="text-accent" aria-hidden="true" /> {t("board.giveTeam")}
        <ChevronDown size={14} className="ms-auto rotate-180 text-fg-subtle" aria-hidden="true" />
      </button>
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
          usesModel
          variant="primary"
          icon={Workflow}
          disabled={busy || request.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              void navigate(`/runs/${(await api.startFlow({ projectId, flow, request })).id}`);
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
  const focus = useSearchParams()[0].get("card");
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
  // Dropped on a card: just before it, between it and the one above (orders are fractions).
  const dropBefore = (target: BoardTask) => async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(undefined);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || id === target.id) return;
    const column = tasks.filter((x) => x.status === target.status && x.id !== id);
    const above = column[column.findIndex((x) => x.id === target.id) - 1];
    const order = above ? (above.order + target.order) / 2 : target.order - 1;
    setError(undefined);
    await api.moveCard(id, target.status, order).catch((err: Error) => setError(err.message));
  };
  const looseRuns = runs.filter((r) => !r.taskId).slice(0, 5);

  const views = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t("roadmap.view")}
        value={view}
        onChange={setView}
        options={[
          { value: "board", label: t("roadmap.boardView") },
          { value: "roadmap", label: t("roadmap.title") },
        ]}
      />
      <div className="flex-1" />
      <ImportCards projectId={project.id} />
    </div>
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
                    focused={task.id === focus}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
                    onDropHere={dropBefore(task)}
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
                  <span className="min-w-0 flex-1 truncate text-[13px]">{requestTitle(r.request)}</span>
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
