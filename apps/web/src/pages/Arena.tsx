import type { ArenaMatch, ArenaStat, FlowRun } from "@igrek/core";
import { Swords, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge, Button, Card, EmptyState, field, RUN_TONE } from "../components/ui";
import { api } from "../lib/api";
import { useBusyState } from "../lib/background";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useProjects, useServerEvent } from "../lib/live";
import { arenaApi } from "../lib/ops-api";

function Patch({ patch }: { patch: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11px] leading-relaxed">
      {patch
        .split("\n")
        .slice(0, 600)
        .map((line, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: lines of one fixed patch
            key={i}
            className={cn(
              "block",
              line.startsWith("+") && !line.startsWith("+++") && "text-success",
              line.startsWith("-") && !line.startsWith("---") && "text-danger",
              line.startsWith("@@") && "text-accent",
            )}
          >
            {line || " "}
          </span>
        ))}
    </pre>
  );
}

function Side({
  model,
  run,
  winner,
  canPick,
  onPick,
}: {
  model: string;
  run?: FlowRun;
  winner?: string;
  canPick: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  const [patch, setPatch] = useState<string>();
  const added = run?.changes?.reduce((s, c) => s + c.added, 0) ?? 0;
  const removed = run?.changes?.reduce((s, c) => s + c.removed, 0) ?? 0;
  const minutes = run ? Math.max(1, Math.round((run.updatedAt - run.createdAt) / 60_000)) : 0;
  const summary = run?.nodes.filter((n) => n.persona && n.output).at(-1)?.output;
  return (
    <div
      className={cn(
        "min-w-0 flex-1 space-y-2 rounded-ui border p-3",
        winner === model ? "border-success" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[13px] font-semibold">{model}</span>
        {run && <Badge tone={RUN_TONE[run.status]}>{t(`flows.status_${run.status}`)}</Badge>}
        {winner === model && (
          <Badge tone="success">
            <Trophy size={11} className="me-1 inline" aria-hidden="true" />
            {t("arena.winner")}
          </Badge>
        )}
        <div className="flex-1" />
        {run && (
          <Link to={`/runs/${run.id}`} className="text-xs text-accent hover:underline">
            {t("arena.details")}
          </Link>
        )}
      </div>
      {run && (
        <p className="text-xs text-fg-muted">
          {t("arena.minutes", { count: minutes })} · {t("arena.files", { count: run.changes?.length ?? 0 })} ·{" "}
          <span className="text-success">+{added}</span> <span className="text-danger">-{removed}</span>
        </p>
      )}
      {summary && <p className="line-clamp-4 whitespace-pre-wrap text-xs">{summary}</p>}
      {run?.worktree && (run.status === "ready" || run.status === "merged") && (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => setPatch(patch === undefined ? (await api.flowDiff(run.id)).patch : undefined)}
        >
          {patch === undefined ? t("arena.showDiff") : t("arena.hideDiff")}
        </Button>
      )}
      {patch !== undefined && <Patch patch={patch} />}
      {canPick && (
        <Button size="sm" variant="primary" icon={Trophy} onClick={onPick}>
          {t("arena.pick")}
        </Button>
      )}
    </div>
  );
}

function Match({ match, projectName, onChange }: { match: ArenaMatch; projectName?: string; onChange: () => void }) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<Record<string, FlowRun>>({});
  const load = useCallback(() => {
    for (const s of match.sides)
      api
        .flowRun(s.runId)
        .then((r) => setRuns((prev) => ({ ...prev, [s.runId]: r })))
        .catch(() => undefined);
  }, [match.sides]);
  useEffect(load, [load]);
  useServerEvent("flows-changed", (m) => m.runId && match.sides.some((s) => s.runId === m.runId) && load());
  const finished = match.sides.every((s) =>
    ["ready", "done", "failed", "stopped", "merged", "discarded"].includes(runs[s.runId]?.status ?? ""),
  );
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-medium">{match.request}</p>
        <Badge>{t(`arena.cat_${match.category}`)}</Badge>
        <span className="text-[11px] text-fg-subtle">
          {projectName} · {relativeTime(match.createdAt)}
        </span>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        {match.sides.map((s) => (
          <Side
            key={s.runId}
            model={s.model}
            run={runs[s.runId]}
            winner={match.winner}
            canPick={!match.winner && finished && runs[s.runId]?.status !== "failed"}
            onPick={() => void arenaApi.pick(match.id, s.model).then(onChange)}
          />
        ))}
      </div>
      {!finished && <p className="text-xs text-fg-subtle">{t("arena.working")}</p>}
    </Card>
  );
}

function Stats({ stats }: { stats: ArenaStat[] }) {
  const { t } = useTranslation();
  if (!stats.length) return null;
  return (
    <Card className="p-pad">
      <p className="mb-2 text-[13px] font-semibold">{t("arena.stats")}</p>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-start text-fg-muted">
            <th className="py-1 text-start font-normal">{t("arena.category")}</th>
            <th className="py-1 text-start font-normal">{t("arena.model")}</th>
            <th className="py-1 text-end font-normal">{t("arena.wins")}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={`${s.category}:${s.model}`} className="border-t border-border">
              <td className="py-1">{t(`arena.cat_${s.category}`)}</td>
              <td className="py-1 font-mono">{s.model}</td>
              <td className="py-1 text-end">
                {s.wins} / {s.played}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Model arena (plan.md 13.1): one task, two models, you pick the better result. */
export function ArenaTab() {
  const { t } = useTranslation();
  const projects = useProjects();
  const [data, setData] = useState<{ matches: ArenaMatch[]; stats: ArenaStat[]; models: string[] }>();
  const [form, setForm] = useState({ projectId: "", request: "", a: "sonnet", b: "opus" });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useBusyState("Arena.ArenaTab");
  const load = useCallback(
    () =>
      void arenaApi
        .list()
        .then(setData)
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  const models = data?.models ?? ["sonnet", "opus", "haiku"];
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">{t("arena.intro")}</p>
      <Card className="space-y-2 p-pad">
        <textarea
          value={form.request}
          onChange={(e) => setForm({ ...form, request: e.target.value })}
          placeholder={t("arena.request")}
          aria-label={t("arena.request")}
          rows={2}
          className={cn(field, "h-auto w-full p-2 py-1.5")}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            className={field}
            aria-label={t("suite.project")}
          >
            <option value="">{t("arena.pickProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {(["a", "b"] as const).map((side) => (
            <select
              key={side}
              value={form[side]}
              onChange={(e) => setForm({ ...form, [side]: e.target.value })}
              className={cn(field, "font-mono")}
              aria-label={t("arena.model")}
            >
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ))}
          <Button
            variant="primary"
            icon={Swords}
            disabled={busy || !form.projectId || form.request.trim().length < 3 || form.a === form.b}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await arenaApi.start({ projectId: form.projectId, request: form.request, models: [form.a, form.b] });
                setForm({ ...form, request: "" });
                load();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("arena.start")}
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">
          {models.includes("codex") ? t("arena.costNote") : `${t("arena.costNote")} ${t("arena.noCodex")}`}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </Card>
      <Stats stats={data?.stats ?? []} />
      {data && !data.matches.length ? (
        <EmptyState icon={Swords} title={t("arena.emptyTitle")} body={t("arena.emptyBody")} />
      ) : (
        (data?.matches ?? []).map((m) => (
          <Match key={m.id} match={m} projectName={projects.find((p) => p.id === m.projectId)?.name} onChange={load} />
        ))
      )}
    </div>
  );
}
