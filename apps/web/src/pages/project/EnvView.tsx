import type { EnvIssue, EnvKeyRow, EnvOverview } from "@godeye/core";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Badge, Button, Card, Dialog, EmptyState } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { dateTime } from "../../lib/format";

const field =
  "h-8 w-full rounded-ui border border-border bg-bg px-2 font-mono text-[12px] outline-none focus:border-accent";

function issueText(t: (k: string, o?: Record<string, unknown>) => string, issue: EnvIssue): string {
  if (issue.kind === "format") return t(`env.issue_format_${issue.expected}`, { file: issue.file });
  if (issue.kind === "unused") return t("env.issue_unused");
  return t(`env.issue_${issue.kind}`, { file: issue.file });
}

/** One value cell: masked; eye reveals it (for 20 s), pencil edits it. */
function ValueCell({
  projectId,
  file,
  row,
  onChanged,
}: {
  projectId: string;
  file: string;
  row: EnvKeyRow;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const cell = row.values[file];
  const [shown, setShown] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (shown === undefined) return;
    const timer = setTimeout(() => setShown(undefined), 20_000);
    return () => clearTimeout(timer);
  }, [shown]);

  const save = () => {
    if (editing === undefined) return;
    api
      .envSet(projectId, file, row.name, editing)
      .then(() => {
        setEditing(undefined);
        setShown(undefined);
        onChanged();
      })
      .catch((err: Error) => setError(err.message));
  };

  if (editing !== undefined)
    return (
      <div className="space-y-1">
        <input
          // biome-ignore lint/a11y/noAutofocus: editing starts from a click on this cell
          autoFocus
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(undefined);
          }}
          aria-label={t("env.value")}
          className={field}
        />
        <div className="flex gap-1">
          <Button size="sm" variant="primary" onClick={save}>
            {t("env.save")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
            {t("memory.cancel")}
          </Button>
        </div>
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    );

  if (!cell)
    return (
      <button
        type="button"
        onClick={() => setEditing("")}
        className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-accent"
        data-tip={t("env.addHere")}
      >
        <Plus size={11} /> {t("env.add")}
      </button>
    );

  return (
    <div className="group flex items-center gap-1">
      <span className={cn("min-w-0 flex-1 truncate font-mono text-[12px]", cell.empty && "text-fg-subtle italic")}>
        {cell.empty ? t("env.empty") : (shown ?? cell.masked)}
      </span>
      {!cell.empty && (
        <button
          type="button"
          aria-label={shown === undefined ? t("env.reveal") : t("env.hide")}
          className="rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
          onClick={() =>
            shown === undefined
              ? api
                  .envReveal(projectId, file, row.name)
                  .then((r) => setShown(r.value))
                  .catch(() => undefined)
              : setShown(undefined)
          }
        >
          {shown === undefined ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      )}
      <button
        type="button"
        aria-label={t("env.edit")}
        className="rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-hover hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() =>
          api
            .envReveal(projectId, file, row.name)
            .then((r) => setEditing(r.value))
            .catch(() => setEditing(""))
        }
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        aria-label={t("env.remove")}
        className="rounded p-1 text-fg-subtle opacity-0 hover:bg-bg-hover hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() =>
          window.confirm(t("env.removeConfirm", { key: row.name, file })) &&
          void api.envRemove(projectId, file, row.name).then(onChanged)
        }
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function HistoryDialog({
  projectId,
  file,
  onClose,
  onRestored,
}: {
  projectId: string;
  file?: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const [list, setList] = useState<{ id: string; at: number; keys: number }[]>();
  useEffect(() => {
    if (file)
      api
        .envHistory(projectId, file)
        .then(setList)
        .catch(() => setList([]));
  }, [projectId, file]);
  return (
    <Dialog open={!!file} onClose={onClose} label={t("env.history")}>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">
          {t("env.history")} · <span className="font-mono">{file}</span>
        </h2>
        <p className="text-xs text-fg-muted">{t("env.historyHint")}</p>
        {list?.length === 0 && <p className="text-xs text-fg-subtle">{t("env.noHistory")}</p>}
        <ul className="max-h-72 divide-y divide-border overflow-auto">
          {list?.map((b) => (
            <li key={b.id} className="flex items-center gap-2 py-2 text-[13px]">
              <span className="flex-1">{dateTime(b.at)}</span>
              <span className="text-[11px] text-fg-subtle">{t("env.keyCount", { count: b.keys })}</span>
              <Button
                size="sm"
                onClick={() =>
                  window.confirm(t("env.restoreConfirm")) &&
                  file &&
                  void api.envRestore(projectId, file, b.id).then(() => {
                    onRestored();
                    onClose();
                  })
                }
              >
                {t("env.restore")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t("enhance.close")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** .env editor (plan.md 5.6): keys × environments, masked, with backups. */
export function EnvView({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const [data, setData] = useState<EnvOverview>();
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<string>();
  const [adding, setAdding] = useState<{ file: string; key: string; value: string }>();
  const [note, setNote] = useState<string>();

  const load = () => {
    api
      .envOverview(projectId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [projectId]);

  if (error) return <EmptyState icon={KeyRound} title={t("env.title")} body={error} />;
  if (!data) return null;
  const files = data.files;
  const realFiles = files.filter((f) => !f.example);
  const problems = data.keys.filter((k) => k.issues.length);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setParams({ tab: "sections" })}
        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={13} className="rtl:rotate-180" /> {t("insight.allSections")}
      </button>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <KeyRound size={17} /> {t("env.title")}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
            <Lock size={12} /> {t("env.privacy")}
          </p>
        </div>
        <Button
          icon={RefreshCw}
          onClick={() =>
            api.envSyncExample(projectId).then((r) => {
              setNote(
                r.added.length ? t("env.synced", { count: r.added.length, file: r.file }) : t("env.syncedNothing"),
              );
              load();
            })
          }
          data-tip={t("env.syncTip")}
        >
          {t("env.sync")}
        </Button>
        {realFiles.length > 0 && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => setAdding({ file: realFiles[0]?.path ?? ".env", key: "", value: "" })}
          >
            {t("env.newKey")}
          </Button>
        )}
      </div>
      {note && <p className="rounded-ui bg-accent-soft px-3 py-2 text-xs text-accent">{note}</p>}

      {files.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={t("env.none")}
          body={t("env.noneBody")}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setAdding({ file: ".env", key: "", value: "" })}>
              {t("env.create")}
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12px]">
            <thead className="border-b border-border text-[11px] text-fg-subtle">
              <tr>
                <th className="w-64 px-3 py-2 text-start font-medium">{t("env.key")}</th>
                {files.map((f) => (
                  <th key={f.path} className="px-3 py-2 text-start font-medium">
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{f.path}</span>
                      <button
                        type="button"
                        aria-label={t("env.history")}
                        className="rounded p-0.5 hover:bg-bg-hover hover:text-fg"
                        onClick={() => setHistory(f.path)}
                      >
                        <History size={12} />
                      </button>
                    </div>
                    <span className={cn("text-[10px]", f.env === "production" ? "text-danger" : "text-fg-subtle")}>
                      {f.example ? t("env.example") : t(`env.env_${f.env}`, { defaultValue: f.env })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.keys.map((row) => (
                <tr key={row.name} className="align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] font-medium">{row.name}</span>
                      {row.issues.length > 0 && (
                        <span data-tip={row.issues.map((i) => issueText(t, i)).join(" · ")}>
                          <TriangleAlert size={12} className="text-warning" />
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {row.provider && <Badge>{t(`apis.name.${row.provider}`, { defaultValue: row.provider })}</Badge>}
                      {row.refs[0] && (
                        <Link
                          to={`/p/${projectId}?tab=code&file=${encodeURIComponent(row.refs[0].path)}&line=${row.refs[0].line}`}
                          className="font-mono text-[10.5px] text-fg-subtle hover:text-accent"
                          data-tip={t("env.usedAt")}
                        >
                          {row.refs[0].path}:{row.refs[0].line}
                        </Link>
                      )}
                      {!row.usedInCode && <span className="text-[10.5px] text-fg-subtle">{t("env.notInCode")}</span>}
                    </div>
                  </td>
                  {files.map((f) => (
                    <td key={f.path} className="max-w-[260px] px-3 py-2">
                      <ValueCell projectId={projectId} file={f.path} row={row} onChanged={load} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {problems.length > 0 && (
        <Card className="p-pad">
          <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <TriangleAlert size={14} className="text-warning" /> {t("env.problems", { count: problems.length })}
          </h3>
          <ul className="space-y-1 text-xs">
            {problems.flatMap((row) =>
              row.issues.map((issue) => (
                <li key={`${row.name}-${issue.kind}-${"file" in issue ? issue.file : ""}`} className="flex gap-2">
                  <span className="font-mono font-medium">{row.name}</span>
                  <span className="text-fg-muted">{issueText(t, issue)}</span>
                </li>
              )),
            )}
          </ul>
        </Card>
      )}

      <Dialog open={!!adding} onClose={() => setAdding(undefined)} label={t("env.newKey")}>
        {adding && (
          <div className="space-y-3 p-5">
            <h2 className="text-[14px] font-semibold">{t("env.newKey")}</h2>
            <select
              value={adding.file}
              onChange={(e) => setAdding({ ...adding, file: e.target.value })}
              aria-label={t("env.file")}
              className={field}
            >
              {(realFiles.length ? realFiles.map((f) => f.path) : [".env"]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              className={field}
              placeholder="API_KEY"
              aria-label={t("env.key")}
              value={adding.key}
              onChange={(e) => setAdding({ ...adding, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
            />
            <input
              className={field}
              autoComplete="off"
              spellCheck={false}
              placeholder={t("env.value")}
              aria-label={t("env.value")}
              value={adding.value}
              onChange={(e) => setAdding({ ...adding, value: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(undefined)}>
                {t("memory.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!adding.key}
                onClick={() =>
                  void api.envSet(projectId, adding.file, adding.key, adding.value).then(() => {
                    setAdding(undefined);
                    load();
                  })
                }
              >
                {t("env.save")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <HistoryDialog projectId={projectId} file={history} onClose={() => setHistory(undefined)} onRestored={load} />
    </div>
  );
}
