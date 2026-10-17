import { Download, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, request } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useSettings } from "../lib/settings";
import { Button, Segmented } from "./ui";

const field =
  "h-8 w-full max-w-72 rounded-md border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent";

/** One-file backup of memory, lessons, the library and personas, optionally locked with a password (plan.md 11). */
export function BackupPanel() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const download = async () => {
    setBusy(true);
    try {
      const blob = await api.exportBackup(password || undefined);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `godeye-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNote(t("backup.saved"));
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("backup.password")}
          aria-label={t("backup.password")}
          className={field}
        />
        <Button icon={Download} disabled={busy} onClick={() => void download()}>
          {t("backup.export")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={importPassword}
          onChange={(e) => setImportPassword(e.target.value)}
          placeholder={t("backup.importPassword")}
          aria-label={t("backup.importPassword")}
          className={field}
        />
        <Button variant="ghost" icon={Upload} onClick={() => input.current?.click()}>
          {t("backup.import")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const { added } = await api.importBackup(file, importPassword || undefined);
              setNote(t("backup.restored", { count: Object.values(added).reduce((a, b) => a + b, 0) }));
            } catch (err) {
              setNote((err as Error).message);
            }
          }}
        />
      </div>
      {note && <p className="text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

/** New versions of God Eye, and updating in one click (plan.md 11). */
export function UpdatePanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.updateStatus>>>();
  const [busy, setBusy] = useState<"check" | "update" | "restart">();
  const [log, setLog] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .updateStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);
  const act = async (kind: "check" | "update" | "restart", fn: () => Promise<void>) => {
    setBusy(kind);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  if (!status) return null;
  return (
    <div className="space-y-2 text-[13px]">
      {status.mode === "docker" && <p className="text-fg-muted">{t("update.docker")}</p>}
      {status.mode === "none" && <p className="text-fg-muted">{t("update.none")}</p>}
      {status.mode === "git" && (
        <>
          <p>
            {status.behind ? t("update.available", { count: status.behind }) : t("update.upToDate")}
            <span className="ms-2 text-[11px] text-fg-subtle">
              {t("update.checked", { when: relativeTime(status.checkedAt) })}
            </span>
          </p>
          {status.commits.length > 0 && (
            <ul className="list-disc ps-5 text-xs text-fg-muted">
              {status.commits.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {status.dirty && <p className="text-xs text-warning">{t("update.dirty")}</p>}
          {status.error && <p className="text-xs text-danger">{status.error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              icon={RefreshCw}
              disabled={!!busy}
              onClick={() => void act("check", async () => setStatus(await api.updateStatus(true)))}
            >
              {busy === "check" ? t("meeting.looking") : t("update.check")}
            </Button>
            {status.behind > 0 && (
              <Button
                variant="primary"
                disabled={!!busy || status.dirty}
                onClick={() =>
                  void act("update", async () => {
                    const r = await api.runUpdate();
                    setLog(r.log);
                    setStatus(await api.updateStatus());
                    if (!r.ok) throw new Error(t("update.failed"));
                  })
                }
              >
                {busy === "update" ? t("update.updating") : t("update.update")}
              </Button>
            )}
            {log && !status.behind && (
              <Button
                disabled={!!busy}
                onClick={() =>
                  void act("restart", async () => {
                    await api.restartApp();
                    setTimeout(() => window.location.reload(), 5000);
                  })
                }
              >
                {t("update.restart")}
              </Button>
            )}
          </div>
          {log && <pre className="max-h-48 overflow-auto rounded bg-bg-muted p-2 text-[11px]">{log}</pre>}
        </>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** A free local model through Ollama for God Eye's own small jobs (plan.md 13.1). */
export function LocalModelPanel() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<{ running: boolean; models: string[]; limitedUntil: number }>();
  const [url, setUrl] = useState(settings.localModelUrl);
  const [error, setError] = useState<string>();
  const check = useCallback(
    () =>
      void request<{ running: boolean; models: string[]; limitedUntil: number }>("/api/local-model")
        .then(setStatus)
        .catch(() => undefined),
    [],
  );
  useEffect(check, [check]);
  return (
    <div className="space-y-2 text-[13px]">
      <Segmented
        label={t("localModel.when")}
        value={settings.localModel}
        onChange={(v) => void update({ localModel: v })}
        options={[
          { value: "off", label: t("localModel.off") },
          { value: "limit", label: t("localModel.limit"), tip: t("localModel.limitTip") },
          { value: "always", label: t("localModel.always"), tip: t("localModel.alwaysTip") },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={async () => {
            setError(undefined);
            if (url === settings.localModelUrl) return;
            try {
              await update({ localModelUrl: url });
              check();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          aria-label={t("localModel.url")}
          className={field}
        />
        <select
          value={settings.localModelName}
          onChange={(e) => void update({ localModelName: e.target.value })}
          className={field}
          aria-label={t("localModel.model")}
          disabled={!status?.models.length}
        >
          <option value="">{t("localModel.pick")}</option>
          {(status?.models ?? []).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={check}>
          {t("update.check")}
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        {!status
          ? ""
          : status.running
            ? status.models.length
              ? t("localModel.found", { count: status.models.length })
              : t("localModel.noModels")
            : t("localModel.notRunning")}
        {status && status.limitedUntil > Date.now() && ` · ${t("localModel.limitedNow")}`}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
