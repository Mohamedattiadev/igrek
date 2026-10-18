import { BRIDGE_EVENTS, type Bridge, type BridgeKind, type McpCatalogEntry, type McpServerEntry } from "@igrek/core";
import { Download, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, request } from "../lib/api";
import { cn } from "../lib/cn";
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
      a.download = `igrek-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

/** New versions of Igrek, and updating in one click (plan.md 11). */
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

/** A free local model through Ollama for Igrek's own small jobs (plan.md 13.1). */
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

/** Your own MCP servers, offered in chats (plan.md 13.1). */
export function McpServersPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{ servers: McpServerEntry[]; catalog: McpCatalogEntry[] }>();
  const [busy, setBusy] = useState<string>();
  const [form, setForm] = useState({ name: "", command: "", env: "" });
  const [error, setError] = useState<string>();
  const load = useCallback(
    () =>
      void request<{ servers: McpServerEntry[]; catalog: McpCatalogEntry[] }>("/api/mcp-servers")
        .then(setData)
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  const call = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const post = (path: string, body?: unknown) => request(path, { method: "POST", body: JSON.stringify(body ?? {}) });
  const added = new Set(data?.servers.map((s) => s.catalog).filter(Boolean));
  return (
    <div className="space-y-3 text-[13px]">
      {(data?.servers ?? []).length > 0 && (
        <ul className="divide-y divide-border rounded-ui border border-border">
          {data?.servers.map((s) => (
            <li key={s.id} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                {s.enabled && <span className="text-[11px] text-success">{t("mcpServers.on")}</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === `t${s.id}`}
                  onClick={() => void call(`t${s.id}`, () => post(`/api/mcp-servers/${s.id}/test`))}
                >
                  {busy === `t${s.id}` ? t("mcpServers.testing") : t("mcpServers.test")}
                </Button>
                <Button
                  size="sm"
                  variant={s.enabled ? "ghost" : "primary"}
                  onClick={() =>
                    void call(`e${s.id}`, () => post(`/api/mcp-servers/${s.id}/enabled`, { enabled: !s.enabled }))
                  }
                >
                  {s.enabled ? t("plugins.turnOff") : t("plugins.turnOn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void call(`d${s.id}`, () => request(`/api/mcp-servers/${s.id}`, { method: "DELETE" }))}
                >
                  {t("plugins.remove")}
                </Button>
              </div>
              <p className="truncate font-mono text-[11px] text-fg-subtle">
                {s.kind === "http" ? s.url : [s.command, ...(s.args ?? [])].join(" ")}
                {s.envKeys.length > 0 && ` · ${s.envKeys.join(", ")}`}
              </p>
              {s.error ? (
                <p className="text-xs text-danger">{s.error}</p>
              ) : s.tools ? (
                <p className="text-xs text-fg-muted">
                  {t("mcpServers.tools", { count: s.tools.length, list: s.tools.slice(0, 8).join(", ") })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        {(data?.catalog ?? [])
          .filter((c) => !added.has(c.id))
          .map((c) => (
            <button
              key={c.id}
              type="button"
              data-tip={c.description}
              onClick={() => void call(`c${c.id}`, () => post("/api/mcp-servers", { catalog: c.id }))}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs hover:bg-bg-hover"
            >
              + {c.name}
            </button>
          ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parts = form.command.trim().split(/\s+/);
          const isUrl = /^https?:\/\//.test(parts[0] ?? "");
          const env = Object.fromEntries(
            form.env
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.includes("="))
              .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
          );
          void call("add", () =>
            post(
              "/api/mcp-servers",
              isUrl
                ? { name: form.name, url: parts[0], env }
                : { name: form.name, command: parts[0], args: parts.slice(1), env },
            ),
          ).then(() => setForm({ name: "", command: "", env: "" }));
        }}
      >
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t("mcpServers.name")}
          aria-label={t("mcpServers.name")}
          className={cn(field, "w-36")}
        />
        <input
          value={form.command}
          onChange={(e) => setForm({ ...form, command: e.target.value })}
          placeholder={t("mcpServers.command")}
          aria-label={t("mcpServers.command")}
          className={cn(field, "min-w-0 flex-1 basis-56 font-mono")}
        />
        <textarea
          value={form.env}
          onChange={(e) => setForm({ ...form, env: e.target.value })}
          placeholder={t("mcpServers.env")}
          aria-label={t("mcpServers.env")}
          rows={1}
          className="min-w-0 basis-full rounded-ui border border-border bg-bg px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
        />
        <Button type="submit" disabled={!form.command.trim() || busy === "add"}>
          {t("mcpServers.add")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-fg-subtle">{t("mcpServers.note")}</p>
    </div>
  );
}

const BRIDGE_FIELDS: Record<BridgeKind, { key: string; secret?: boolean; placeholder: string }[]> = {
  telegram: [
    { key: "token", secret: true, placeholder: "123456789:AA…" },
    { key: "chatId", placeholder: "123456789" },
  ],
  discord: [{ key: "webhook", secret: true, placeholder: "https://discord.com/api/webhooks/…" }],
  email: [
    { key: "host", placeholder: "smtp.example.com" },
    { key: "port", placeholder: "587" },
    { key: "user", placeholder: "me@example.com" },
    { key: "password", secret: true, placeholder: "••••••" },
    { key: "to", placeholder: "me@example.com" },
  ],
};

/** Notices to Telegram, Discord or your own e-mail (plan.md 13.3). */
export function BridgesPanel() {
  const { t } = useTranslation();
  const [list, setList] = useState<Bridge[]>([]);
  const [kind, setKind] = useState<BridgeKind>("telegram");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const load = useCallback(
    () =>
      void request<Bridge[]>("/api/bridges")
        .then(setList)
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  const call = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const patch = (id: string, body: object) =>
    request(`/api/bridges/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  return (
    <div className="space-y-3 text-[13px]">
      {list.length > 0 && (
        <ul className="divide-y divide-border rounded-ui border border-border">
          {list.map((b) => (
            <li key={b.id} className="space-y-1.5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {t(`bridges.kind_${b.kind}`)} <span className="text-xs font-normal text-fg-subtle">· {b.target}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === `t${b.id}`}
                  onClick={() =>
                    void call(`t${b.id}`, () => request(`/api/bridges/${b.id}/test`, { method: "POST", body: "{}" }))
                  }
                >
                  {busy === `t${b.id}` ? t("mcpServers.testing") : t("bridges.test")}
                </Button>
                <Button
                  size="sm"
                  variant={b.enabled ? "ghost" : "primary"}
                  onClick={() => void call(`e${b.id}`, () => patch(b.id, { enabled: !b.enabled }))}
                >
                  {b.enabled ? t("plugins.turnOff") : t("plugins.turnOn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void call(`d${b.id}`, () => request(`/api/bridges/${b.id}`, { method: "DELETE" }))}
                >
                  {t("plugins.remove")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {BRIDGE_EVENTS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() =>
                      void call(`v${b.id}`, () =>
                        patch(b.id, {
                          events: b.events.includes(e) ? b.events.filter((x) => x !== e) : [...b.events, e],
                        }),
                      )
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      b.events.includes(e)
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-fg-subtle",
                    )}
                  >
                    {t(`bridges.ev_${e}`)}
                  </button>
                ))}
              </div>
              {b.lastError ? (
                <p className="text-xs text-danger">{b.lastError}</p>
              ) : b.lastSentAt ? (
                <p className="text-xs text-fg-subtle">
                  {t("bridges.last", { when: new Date(b.lastSentAt).toLocaleString() })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void call("add", () =>
            request("/api/bridges", { method: "POST", body: JSON.stringify({ kind, secrets: values }) }),
          ).then(() => setValues({}));
        }}
      >
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as BridgeKind);
            setValues({});
          }}
          className={field}
          aria-label={t("bridges.kind")}
        >
          {(["telegram", "discord", "email"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`bridges.kind_${k}`)}
            </option>
          ))}
        </select>
        {BRIDGE_FIELDS[kind].map((f) => (
          <input
            key={f.key}
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            value={values[f.key] ?? ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            placeholder={`${t(`bridges.f_${f.key}`)}: ${f.placeholder}`}
            aria-label={t(`bridges.f_${f.key}`)}
            className={cn(field, "min-w-0 flex-1 basis-40")}
          />
        ))}
        <Button type="submit" disabled={busy === "add"}>
          {t("bridges.add")}
        </Button>
      </form>
      <p className="text-xs text-fg-subtle">{t(`bridges.how_${kind}`)}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(0)} MB`
      : `${Math.max(1, Math.round(n / 1024))} KB`;

/** What Igrek keeps on disk, and keeping it small (plan.md 13.6). */
export function DiskPanel() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [usage, setUsage] = useState<{
    total: number;
    parts: { key: string; bytes: number }[];
    sessions: number;
    messages: number;
    prunable: number;
  }>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      void request<typeof usage>("/api/disk")
        .then(setUsage)
        .catch(() => undefined),
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the keep period changes
  useEffect(load, [load, settings.transcriptDays]);
  return (
    <div className="space-y-2 text-[13px]">
      {usage && (
        <>
          <p>
            {t("disk.total", { size: bytes(usage.total) })}{" "}
            <span className="text-xs text-fg-muted">
              · {t("disk.counts", { sessions: usage.sessions, messages: usage.messages })}
            </span>
          </p>
          <ul className="space-y-0.5 text-xs">
            {usage.parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className="w-40 text-fg-muted">
                  {t(`disk.part_${p.key.replace(/[^a-z]/g, "")}`, { defaultValue: p.key })}
                </span>
                <span
                  className="h-1.5 rounded-full bg-accent/60"
                  style={{ width: `${Math.max(2, (p.bytes / usage.total) * 200)}px` }}
                />
                <span>{bytes(p.bytes)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <label className="flex flex-wrap items-center gap-2">
        {t("disk.keep")}
        <select
          value={settings.transcriptDays}
          onChange={(e) => void update({ transcriptDays: Number(e.target.value) })}
          className={field}
        >
          {[0, 30, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              {d ? t("disk.days", { count: d }) : t("disk.forever")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await request<{ sessions: number; worktrees: number; shots: number; freed: number }>(
                "/api/disk/prune",
                { method: "POST", body: "{}" },
              );
              setNote(
                t("disk.cleaned", {
                  sessions: r.sessions,
                  worktrees: r.worktrees,
                  shots: r.shots,
                  size: bytes(r.freed),
                }),
              );
              load();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("disk.cleaning") : t("disk.clean")}
        </Button>
        {usage && usage.prunable > 0 && (
          <span className="text-xs text-fg-muted">{t("disk.prunable", { count: usage.prunable })}</span>
        )}
      </div>
      {note && <p className="text-xs text-success">{note}</p>}
      <p className="text-xs text-fg-subtle">{t("disk.note")}</p>
    </div>
  );
}

/** Every address Igrek's server opened on the internet since it started (plan.md 13.6). */
export function NetworkPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<{
    since: number;
    hosts: { host: string; count: number; last: number; paths: string[]; purpose?: string }[];
  }>();
  useEffect(() => {
    request<typeof data>("/api/network")
      .then(setData)
      .catch(() => undefined);
  }, []);
  if (!data) return null;
  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-xs text-fg-muted">{t("network.since", { when: new Date(data.since).toLocaleString() })}</p>
      {data.hosts.length ? (
        <ul className="divide-y divide-border rounded-ui border border-border text-xs">
          {data.hosts.map((h) => (
            <li key={h.host} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              <span className="font-mono">{h.host}</span>
              {h.purpose && <span className="text-fg-muted">· {t(`network.p_${h.purpose}`)}</span>}
              <span className="ms-auto text-fg-subtle" title={h.paths.join("\n")}>
                {t("network.times", { count: h.count })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">{t("network.none")}</p>
      )}
      <p className="text-xs text-fg-subtle">{t("network.note")}</p>
    </div>
  );
}
