import { type DomainWatch, daysLeft, type UptimeCheck, type UptimeMonitor } from "@igrek/core";
import { ChevronDown, ChevronRight, Globe, Plus, Radio, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState, field, StatusDot } from "../../components/ui";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { useProjects, useServerEvent } from "../../lib/live";
import { opsApi } from "../../lib/ops-api";

function useMonitors<T>(load: () => Promise<T>): { data?: T; reload: () => void } {
  const [data, setData] = useState<T>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the loader is fixed per caller
  const reload = useCallback(
    () =>
      void load()
        .then(setData)
        .catch(() => undefined),
    [],
  );
  useEffect(reload, [reload]);
  useServerEvent("monitors-changed", reload);
  return { data, reload };
}

function ProjectSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={field} aria-label={t("suite.project")}>
      <option value="">{t("suite.noProject")}</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/** The last 24 hours as small bars: green up, red down, height by response time. */
function Bars({ checks }: { checks: UptimeCheck[] }) {
  const { t } = useTranslation();
  const max = Math.max(200, ...checks.map((c) => c.ms ?? 0));
  return (
    <div className="flex h-10 items-end gap-px" role="img" aria-label={t("uptime.history")}>
      {checks.slice(-120).map((c) => (
        <span
          key={c.at}
          data-tip={`${dateTime(c.at)} · ${c.up ? `${c.ms} ms` : (c.error ?? c.status)}`}
          className={cn("w-1.5 shrink-0 rounded-sm", c.up ? "bg-success/70" : "bg-danger")}
          style={{ height: c.up ? `${Math.max(12, ((c.ms ?? 0) / max) * 100)}%` : "100%" }}
        />
      ))}
    </div>
  );
}

function MonitorRow({ m, projectName }: { m: UptimeMonitor; projectName?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<UptimeCheck[]>([]);
  const [busy, setBusy] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after every new check
  useEffect(() => {
    if (open)
      opsApi
        .uptimeHistory(m.id)
        .then(setChecks)
        .catch(() => undefined);
  }, [open, m.id, m.checkedAt]);
  const tone = m.up === undefined ? "neutral" : m.up ? "success" : "danger";
  return (
    <li className="px-pad py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <StatusDot tone={tone} pulse={m.up === false} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium">{m.name}</span>
            <span className="block truncate font-mono text-[11px] text-fg-subtle">{m.url}</span>
          </span>
        </button>
        {projectName && <Badge>{projectName}</Badge>}
        <span className="text-xs text-fg-muted">
          {m.up === undefined
            ? t("uptime.waiting")
            : m.up
              ? t("uptime.upFor", { when: relativeTime(m.since ?? m.createdAt) })
              : t("uptime.downFor", { when: relativeTime(m.since ?? m.createdAt) })}
        </span>
        {m.ms !== undefined && m.up && <span className="font-mono text-xs text-fg-muted">{m.ms} ms</span>}
        {m.uptime24h !== undefined && (
          <Badge tone={m.uptime24h >= 99.5 ? "success" : m.uptime24h >= 95 ? "warning" : "danger"}>
            {t("uptime.percent", { value: m.uptime24h })}
          </Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          disabled={busy}
          aria-label={t("uptime.check")}
          onClick={async () => {
            setBusy(true);
            await opsApi.checkUptime(m.id).catch(() => undefined);
            setBusy(false);
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("uptime.remove")}
          onClick={() => void opsApi.removeUptime(m.id)}
        />
      </div>
      {!m.up && m.up !== undefined && (m.error || m.status) && (
        <p className="ms-9 mt-1 text-xs text-danger">{m.error ?? t("uptime.status", { status: m.status })}</p>
      )}
      {open && (
        <div className="ms-9 mt-2 space-y-1">
          {checks.length ? <Bars checks={checks} /> : <p className="text-xs text-fg-subtle">{t("uptime.noHistory")}</p>}
          <p className="text-[11px] text-fg-subtle">
            {t("uptime.every", { count: Math.round(m.interval / 60) })}
            {m.p50 !== undefined && ` · ${t("uptime.median", { ms: m.p50 })}`}
            {m.checkedAt && ` · ${t("uptime.checked", { when: relativeTime(m.checkedAt) })}`}
          </p>
        </div>
      )}
    </li>
  );
}

export function UptimeTab() {
  const { t } = useTranslation();
  const { data } = useMonitors(opsApi.uptime);
  const projects = useProjects();
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [interval, setInterval] = useState(300);
  const [error, setError] = useState<string>();
  const add = async () => {
    setError(undefined);
    try {
      await opsApi.addUptime({ url: url.trim(), projectId: projectId || undefined, interval });
      setUrl("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">{t("uptime.intro")}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          aria-label={t("uptime.url")}
          className={cn(field, "min-w-0 flex-1 basis-56")}
        />
        <select
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
          className={field}
          aria-label={t("uptime.interval")}
        >
          {[60, 300, 900, 3600].map((s) => (
            <option key={s} value={s}>
              {t("uptime.every", { count: s / 60 })}
            </option>
          ))}
        </select>
        <ProjectSelect value={projectId} onChange={setProjectId} />
        <Button type="submit" variant="primary" icon={Plus} disabled={!url.trim()}>
          {t("uptime.add")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data && !data.length ? (
        <EmptyState icon={Radio} title={t("uptime.emptyTitle")} body={t("uptime.emptyBody")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((m) => (
              <MonitorRow key={m.id} m={m} projectName={projects.find((p) => p.id === m.projectId)?.name} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Expiry({ label, at }: { label: string; at?: number }) {
  const { t } = useTranslation();
  if (at === undefined)
    return (
      <span className="text-xs text-fg-subtle">
        {label}: {t("domains.unknown")}
      </span>
    );
  const left = daysLeft(at);
  return (
    <span className="text-xs">
      <span className="text-fg-muted">{label}: </span>
      <span
        className={cn(
          "font-medium",
          left < 0 ? "text-danger" : left <= 14 ? "text-danger" : left <= 30 ? "text-warning" : "",
        )}
      >
        {left < 0 ? t("domains.expired", { count: -left }) : t("domains.daysLeft", { count: left })}
      </span>
      <span className="ms-1 text-fg-subtle">({new Date(at).toLocaleDateString()})</span>
    </span>
  );
}

function DomainRow({ d, projectName }: { d: DomainWatch; projectName?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const records = d.dns
    ? ([
        ["A", d.dns.A],
        ["AAAA", d.dns.AAAA],
        ["CNAME", d.dns.CNAME],
        ["MX", d.dns.MX.map((m) => `${m.priority} ${m.exchange}`)],
        ["NS", d.dns.NS],
        ["TXT", d.dns.TXT],
      ] as const)
    : [];
  return (
    <li className="px-pad py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-2 text-start">
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          <span className="text-[13.5px] font-medium">{d.host}</span>
        </button>
        {projectName && <Badge>{projectName}</Badge>}
        <Expiry label={t("domains.cert")} at={d.certExpires} />
        <Expiry label={t("domains.domain")} at={d.domainExpires} />
        {d.certMismatch && <Badge tone="danger">{t("domains.mismatch")}</Badge>}
        <div className="ms-auto flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={RefreshCw}
            disabled={busy}
            aria-label={t("uptime.check")}
            onClick={async () => {
              setBusy(true);
              await opsApi.checkDomain(d.id).catch(() => undefined);
              setBusy(false);
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={t("uptime.remove")}
            onClick={() => void opsApi.removeDomain(d.id)}
          />
        </div>
      </div>
      {d.error && <p className="ms-6 mt-1 text-xs text-warning">{d.error}</p>}
      {open && (
        <div className="ms-6 mt-2 grid gap-1 text-xs sm:grid-cols-[110px_1fr]">
          <span className="text-fg-muted">{t("domains.issuer")}</span>
          <span>{d.certIssuer ?? "-"}</span>
          <span className="text-fg-muted">{t("domains.names")}</span>
          <span className="break-all font-mono">{(d.certNames ?? []).join(", ") || "-"}</span>
          <span className="text-fg-muted">{t("domains.registrar")}</span>
          <span>{d.registrar ?? "-"}</span>
          {records.map(([type, values]) => (
            <div key={type} className="contents">
              <span className="font-mono text-fg-muted">{type}</span>
              <span className="break-all font-mono">{values.length ? values.join("\n") : "-"}</span>
            </div>
          ))}
          {d.checkedAt && (
            <span className="col-span-full text-[11px] text-fg-subtle">
              {t("uptime.checked", { when: relativeTime(d.checkedAt) })}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function DomainsTab() {
  const { t } = useTranslation();
  const { data } = useMonitors(opsApi.domains);
  const projects = useProjects();
  const [host, setHost] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-muted">{t("domains.intro")}</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setBusy(true);
          try {
            await opsApi.addDomain({ host: host.trim(), projectId: projectId || undefined });
            setHost("");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="example.com"
          aria-label={t("domains.host")}
          className={cn(field, "min-w-0 flex-1 basis-56")}
        />
        <ProjectSelect value={projectId} onChange={setProjectId} />
        <Button type="submit" variant="primary" icon={Plus} disabled={!host.trim() || busy}>
          {busy ? t("domains.checking") : t("domains.add")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data && !data.length ? (
        <EmptyState icon={Globe} title={t("domains.emptyTitle")} body={t("domains.emptyBody")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(data ?? []).map((d) => (
              <DomainRow key={d.id} d={d} projectName={projects.find((p) => p.id === d.projectId)?.name} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
