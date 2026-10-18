import type { FlowNodeState, FlowRun } from "@igrek/core";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileDiff,
  GitMerge,
  Hand,
  LoaderCircle,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, Dialog, PageHeader, RUN_TONE } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { dateTime, relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";

/** Columns of the flow: a node sits one column after the last node it waits for. */
function levels(nodes: FlowNodeState[]): FlowNodeState[][] {
  const depth = new Map<string, number>();
  const of = (n: FlowNodeState, seen = new Set<string>()): number => {
    if (depth.has(n.id)) return depth.get(n.id) as number;
    if (seen.has(n.id)) return 0;
    seen.add(n.id);
    const d = n.dependsOn.length
      ? 1 +
        Math.max(
          ...n.dependsOn.map((id) => {
            const dep = nodes.find((x) => x.id === id);
            return dep ? of(dep, seen) : 0;
          }),
        )
      : 0;
    depth.set(n.id, d);
    return d;
  };
  const out: FlowNodeState[][] = [];
  for (const n of nodes) {
    const d = of(n);
    out[d] = [...(out[d] ?? []), n];
  }
  return out.filter(Boolean);
}

function StatusIcon({ status }: { status: FlowNodeState["status"] }) {
  if (status === "running") return <LoaderCircle size={13} className="animate-spin text-accent" aria-hidden="true" />;
  if (status === "done") return <Check size={13} className="text-success" aria-hidden="true" />;
  if (status === "failed") return <X size={13} className="text-danger" aria-hidden="true" />;
  if (status === "needs_you") return <Hand size={13} className="text-warning" aria-hidden="true" />;
  return <CircleDashed size={13} className="text-fg-subtle" aria-hidden="true" />;
}

function NodeCard({ run, node }: { run: FlowRun; node: FlowNodeState }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const persona = personas.find((p) => p.id === node.persona);
  const label = usePersonaLabel()(persona, node.persona);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const respond = (decision: "approve" | "reject") =>
    void api.respondFlow(run.id, node.id, decision, text).catch((e: Error) => setError(e.message));
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-ui border bg-bg p-2.5",
        node.status === "running" && "border-accent",
        node.status === "needs_you" && "border-warning",
        node.status === "failed" && "border-danger",
        node.status === "waiting" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        {persona ? <PersonaIcon persona={persona} size={12} className="size-5" /> : <StatusIcon status={node.status} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">{node.title ?? node.id}</p>
          {node.persona && <p className="truncate text-[11px] text-fg-subtle">{label.name}</p>}
        </div>
        {persona && <StatusIcon status={node.status} />}
      </div>
      <div className="flex flex-wrap gap-1">
        {node.attempts > 1 && <Badge tone="warning">{t("flows.attempt", { n: node.attempts })}</Badge>}
        {node.verdict && (
          <Badge tone={node.verdict === "pass" ? "success" : "danger"}>{t(`flows.verdict_${node.verdict}`)}</Badge>
        )}
      </div>
      {node.activity && node.status === "running" && (
        <p className="line-clamp-2 font-mono text-[11px] text-fg-muted">{node.activity}</p>
      )}
      {node.status === "needs_you" && (
        <div className="space-y-1.5">
          <p className="text-xs">{node.activity}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={t("flows.feedbackHint")}
            aria-label={t("flows.feedback")}
            className="w-full rounded-md border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-accent"
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => respond("approve")}>
              {t("flows.approve")}
            </Button>
            <Button size="sm" onClick={() => respond("reject")}>
              {t("flows.sendBack")}
            </Button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}
      {node.error && <p className="line-clamp-3 text-[11px] text-danger">{node.error}</p>}
      {(node.output || node.log.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"
        >
          {open ? <ChevronDown size={11} aria-hidden="true" /> : <ChevronRight size={11} aria-hidden="true" />}
          {t("flows.details")}
        </button>
      )}
      {open && (
        <div className="space-y-1.5">
          {node.output && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-bg-muted p-2 text-[11px]">
              {node.output}
            </pre>
          )}
          {node.log.length > 0 && (
            <ol className="max-h-40 overflow-auto font-mono text-[10.5px] text-fg-subtle">
              {node.log.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: log lines in order
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function Approval({ run }: { run: FlowRun }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState<{ files: { path: string; added: number; removed: number }[]; patch: string }>();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const summary = run.nodes.find((n) => n.id === "summary")?.output ?? run.nodes.at(-1)?.output;
  const reviews = run.nodes.filter((n) => n.verdict);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3 border-warning p-pad">
      <p className="text-[14px] font-semibold">{t("flows.readyTitle")}</p>
      {summary && (
        <div className="text-[13px]">
          <Markdown text={summary} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {reviews.map((n) => (
          <Badge key={n.id} tone={n.verdict === "pass" ? "success" : "danger"}>
            {n.title ?? n.id}: {t(`flows.verdict_${n.verdict}`)}
          </Badge>
        ))}
      </div>
      {run.changes && (
        <div>
          <p className="text-xs text-fg-muted">{t("flows.changed", { count: run.changes.length })}</p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto font-mono text-[11.5px]">
            {run.changes.map((f) => (
              <li key={f.path} className="flex gap-3">
                <span className="text-success">+{f.added}</span>
                <span className="text-danger">-{f.removed}</span>
                <span className="min-w-0 truncate">{f.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={t("flows.reviseHint")}
        aria-label={t("flows.feedback")}
        className="w-full rounded-md border border-border bg-bg px-2 py-1 text-[12.5px] outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" icon={FileDiff} onClick={() => void api.flowDiff(run.id).then(setDiff)}>
          {t("copy.changes")}
        </Button>
        <Button
          variant="ghost"
          icon={Trash2}
          disabled={busy}
          onClick={() => window.confirm(t("copy.discardConfirm")) && void act(() => api.flowAction(run.id, "discard"))}
        >
          {t("flows.discard")}
        </Button>
        <Button disabled={busy || text.trim().length < 3} onClick={() => void act(() => api.reviseFlow(run.id, text))}>
          {t("flows.sendBack")}
        </Button>
        <Button
          variant="primary"
          icon={GitMerge}
          disabled={busy}
          onClick={() => void act(() => api.flowAction(run.id, "merge"))}
        >
          {t("flows.merge", { branch: run.worktree?.baseBranch ?? "HEAD" })}
        </Button>
      </div>
      <p className="text-[11px] text-fg-subtle">{t("flows.mergeNote")}</p>
      <Dialog open={!!diff} onClose={() => setDiff(undefined)} label={t("copy.changes")} wide>
        {diff && (
          <pre className="max-h-[80vh] overflow-auto p-4 font-mono text-[11.5px] leading-relaxed">
            {diff.patch.split("\n").map((line, i) => (
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
        )}
      </Dialog>
    </Card>
  );
}

/** A team run, live: who is doing what, and the one approval at the end (plan.md Faz 8). */
export function FlowRunPage() {
  const { t } = useTranslation();
  const { runId = "" } = useParams();
  const [run, setRun] = useState<FlowRun>();
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .flowRun(runId)
      .then(setRun)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, [runId]);
  useServerEvent("flows-changed", (m) => (!m.runId || m.runId === runId) && load());
  const columns = useMemo(() => (run ? levels(run.nodes) : []), [run]);
  if (!run)
    return (
      <>
        <PageHeader title={t("flows.title")} />
        <p className="p-6 text-[13px] text-fg-muted">{error ?? t("persona.loading")}</p>
      </>
    );
  const busy = run.status === "running" || run.status === "needs_you" || run.status === "waiting_limit";
  return (
    <>
      <PageHeader
        title={t("flows.title")}
        actions={
          <div className="flex gap-1">
            {busy && (
              <Button size="sm" variant="danger" icon={Square} onClick={() => void api.flowAction(run.id, "stop")}>
                {t("chat.stop")}
              </Button>
            )}
            {(run.status === "failed" || run.status === "stopped") && run.engine === "godeye" && (
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={() => void api.flowAction(run.id, "retry").catch((e: Error) => setError(e.message))}
              >
                {t("flows.retry")}
              </Button>
            )}
          </div>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <Link
          to={`/p/${run.projectId}?tab=board`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" /> {t("project.board")}
        </Link>
        <div>
          <h2 className="whitespace-pre-wrap text-[15px] font-semibold">{run.request}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
            <Badge tone={RUN_TONE[run.status]}>{t(`flows.status_${run.status}`)}</Badge>
            {t(`flows.name_${run.flow}`, { defaultValue: run.flow })} · {relativeTime(run.createdAt)}
            {run.worktree && <span className="font-mono">{run.worktree.branch}</span>}
          </p>
        </div>
        {run.error && <p className="text-xs text-danger">{run.error}</p>}
        {run.status === "waiting_limit" && (
          <p className="rounded-ui border border-warning bg-warning-soft/40 p-2 text-[13px]">
            {t("flows.waitingLimit", { time: run.resumeAt ? dateTime(run.resumeAt) : "" })}
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {run.status === "ready" && <Approval run={run} />}
        {run.status === "merged" && (
          <p className="text-[13px] text-success">
            {t("flows.mergedNote", { branch: run.worktree?.baseBranch ?? "HEAD" })}
          </p>
        )}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: columns are positions
            <div key={i} className="w-56 shrink-0 space-y-2">
              {col.map((node) => (
                <NodeCard key={node.id} run={run} node={node} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
