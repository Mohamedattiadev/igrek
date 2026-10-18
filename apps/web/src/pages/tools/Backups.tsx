import type { BackupJob, BackupRun, DbConnection, ServerInfo } from "@godeye/core";
import {
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  HardDriveDownload,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Dialog, EmptyState, field } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { dataApi } from "../../lib/ops-api";

function size(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function Verified({ run }: { run: BackupRun }) {
  const { t } = useTranslation();
  const v = run.verified;
  if (!v) return null;
  const counts = Object.entries(v.counts ?? {})
    .filter(([, n]) => n !== undefined)
    .map(([k, n]) => t(`backups.c_${k}`, { count: n }))
    .join(", ");
  const note = v.note ? t(`backups.note_${v.note}`, { defaultValue: v.note }) : "";
  return (
    <span className={cn("text-xs", v.ok ? "text-success" : "text-danger")}>
      {v.ok ? t("backups.verified") : t("backups.verifyFailed")} · {t(`backups.how_${v.how}`)}
      {(counts || note || v.detail) && ": "}
      <span className="text-fg-muted">{[counts, note, v.detail].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

function RunRow({ run, sqlite }: { run: BackupRun; sqlite: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
      <Badge tone={run.status === "ok" ? "success" : run.status === "failed" ? "danger" : "neutral"}>
        {t(`backups.status_${run.status}`)}
      </Badge>
      <span>{dateTime(run.startedAt)}</span>
      {run.bytes !== undefined && <span className="text-fg-subtle">{size(run.bytes)}</span>}
      {run.error && <span className="text-danger">{run.error}</span>}
      <Verified run={run} />
      <div className="flex-1" />
      {run.status === "ok" && (
        <Button
          size="sm"
          variant="ghost"
          icon={ShieldCheck}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await dataApi.verifyBackup(run.id).catch((e: Error) => setNote(e.message));
            setBusy(false);
          }}
        >
          {busy ? t("backups.testing") : t("backups.test")}
        </Button>
      )}
      {run.status === "ok" && sqlite && (
        <Button
          size="sm"
          variant="ghost"
          icon={ArchiveRestore}
          onClick={async () => {
            try {
              setNote(t("backups.restoredTo", { file: (await dataApi.restoreBackup(run.id)).file }));
            } catch (e) {
              setNote((e as Error).message);
            }
          }}
        >
          {t("backups.restoreCopy")}
        </Button>
      )}
      {note && <p className="basis-full break-all text-fg-muted">{note}</p>}
    </li>
  );
}

function JobRow({ job, conns }: { job: BackupJob; conns: DbConnection[] }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [running, setRunning] = useState(false);
  const conn =
    job.source.kind === "database"
      ? conns.find((c) => c.id === (job.source as { connectionId: string }).connectionId)
      : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after each run
  useEffect(() => {
    if (open)
      dataApi
        .backupRuns(job.id)
        .then(setRuns)
        .catch(() => undefined);
  }, [open, job.id, job.lastRun?.id, job.lastRun?.status, job.lastRun?.verified?.at]);
  const when =
    job.every === "manual"
      ? t("backups.manual")
      : job.every === "day"
        ? t("backups.daily", { time: job.time })
        : t("backups.weekly", {
            day: new Date(2026, 0, 4 + (job.weekday ?? 0)).toLocaleDateString(i18n.language, { weekday: "long" }),
            time: job.time,
          });
  const last = job.lastRun;
  return (
    <li className="space-y-1.5 px-pad py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium">{job.name}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {job.source.kind === "database"
                ? `${conn?.kind ?? "?"} · ${conn?.name ?? t("backups.missingDb")}`
                : job.source.path}{" "}
              · {when} · {t("backups.keep", { count: job.keep })}
            </span>
          </span>
        </button>
        {last ? (
          <Badge
            tone={
              last.status === "ok" && last.verified?.ok !== false
                ? "success"
                : last.status === "running"
                  ? "neutral"
                  : "danger"
            }
          >
            {last.status === "running" ? t("backups.status_running") : relativeTime(last.startedAt)}
          </Badge>
        ) : (
          <Badge>{t("backups.never")}</Badge>
        )}
        {job.nextAt && (
          <span className="text-[11px] text-fg-subtle">{t("backups.next", { when: dateTime(job.nextAt) })}</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Play}
          disabled={running || last?.status === "running"}
          onClick={async () => {
            setRunning(true);
            await dataApi.runBackup(job.id).catch(() => undefined);
            setRunning(false);
          }}
        >
          {running ? t("backups.running") : t("backups.runNow")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("backups.remove")}
          onClick={() => void dataApi.removeBackup(job.id)}
        />
      </div>
      {!open && last && (last.error || last.verified) && (
        <p className="ms-6 text-xs">
          {last.error ? <span className="text-danger">{last.error}</span> : <Verified run={last} />}
        </p>
      )}
      {open && (
        <ul className="ms-6 divide-y divide-border">
          {runs.map((r) => (
            <RunRow key={r.id} run={r} sqlite={conn?.kind === "sqlite"} />
          ))}
          {!runs.length && <li className="py-1 text-xs text-fg-subtle">{t("backups.noRuns")}</li>}
        </ul>
      )}
    </li>
  );
}

function AddJob({ conns, onAdded }: { conns: DbConnection[]; onAdded: () => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [form, setForm] = useState({
    name: "",
    kind: conns.length ? ("database" as const) : ("files" as const),
    connectionId: conns[0]?.id ?? "",
    path: "",
    serverId: "",
    every: "day" as BackupJob["every"],
    time: "03:00",
    weekday: 0,
    keep: 7,
    verify: true,
  });
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (open)
      api
        .servers()
        .then(setServers)
        .catch(() => undefined);
  }, [open]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>
        {t("backups.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("backups.add")}>
        <form
          className="space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(undefined);
            try {
              await dataApi.addBackup({
                name: form.name,
                source:
                  form.kind === "database"
                    ? { kind: "database", connectionId: form.connectionId }
                    : { kind: "files", path: form.path.trim(), ...(form.serverId ? { serverId: form.serverId } : {}) },
                every: form.every,
                time: form.time,
                weekday: form.weekday,
                keep: form.keep,
                verify: form.verify,
              });
              setOpen(false);
              onAdded();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <h2 className="text-[15px] font-semibold">{t("backups.add")}</h2>
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t("backups.name")}
            aria-label={t("backups.name")}
            className={cn(field, "w-full")}
          />
          <select
            value={form.kind}
            onChange={(e) => set({ kind: e.target.value as "database" | "files" })}
            className={cn(field, "w-full")}
            aria-label={t("backups.what")}
          >
            <option value="database" disabled={!conns.length}>
              {t("backups.kind_database")}
            </option>
            <option value="files">{t("backups.kind_files")}</option>
          </select>
          {form.kind === "database" ? (
            <select
              value={form.connectionId}
              onChange={(e) => set({ connectionId: e.target.value })}
              className={cn(field, "w-full")}
              aria-label={t("backups.kind_database")}
            >
              {conns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.kind})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                value={form.path}
                onChange={(e) => set({ path: e.target.value })}
                placeholder="/var/www/uploads"
                aria-label={t("backups.path")}
                className={cn(field, "min-w-0 flex-1 font-mono")}
              />
              <select
                value={form.serverId}
                onChange={(e) => set({ serverId: e.target.value })}
                className={field}
                aria-label={t("docker.where")}
              >
                <option value="">{t("docker.local")}</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              value={form.every}
              onChange={(e) => set({ every: e.target.value as BackupJob["every"] })}
              className={field}
              aria-label={t("backups.when")}
            >
              <option value="day">{t("backups.every_day")}</option>
              <option value="week">{t("backups.every_week")}</option>
              <option value="manual">{t("backups.manual")}</option>
            </select>
            {form.every === "week" && (
              <select
                value={form.weekday}
                onChange={(e) => set({ weekday: Number(e.target.value) })}
                className={field}
                aria-label={t("backups.weekday")}
              >
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <option key={d} value={d}>
                    {new Date(2026, 0, 4 + d).toLocaleDateString(i18n.language, { weekday: "long" })}
                  </option>
                ))}
              </select>
            )}
            {form.every !== "manual" && (
              <input
                type="time"
                value={form.time}
                onChange={(e) => set({ time: e.target.value })}
                className={field}
                aria-label={t("backups.time")}
              />
            )}
            <label className="flex items-center gap-1.5 text-[13px]">
              {t("backups.keepLabel")}
              <input
                type="number"
                min={1}
                max={100}
                value={form.keep}
                onChange={(e) => set({ keep: Number(e.target.value) })}
                className={cn(field, "w-16")}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.verify}
              onChange={(e) => set({ verify: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              {t("backups.verify")}
              <span className="block text-xs text-fg-muted">{t("backups.verifyHint")}</span>
            </span>
          </label>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("persona.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!form.name.trim()}>
              {t("backups.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Backup manager (plan.md 12). */
export function BackupsTab() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<BackupJob[]>();
  const [conns, setConns] = useState<DbConnection[]>([]);
  const load = useCallback(() => {
    dataApi
      .backups()
      .then(setJobs)
      .catch(() => undefined);
    dataApi
      .databases()
      .then(setConns)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  useServerEvent("ops-changed", (m) => m.what === "backups" && load());
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("backups.intro")}</p>
        <AddJob key={conns.length} conns={conns} onAdded={load} />
      </div>
      {jobs && !jobs.length ? (
        <EmptyState icon={HardDriveDownload} title={t("backups.emptyTitle")} body={t("backups.emptyBody")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(jobs ?? []).map((j) => (
              <JobRow key={j.id} job={j} conns={conns} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
