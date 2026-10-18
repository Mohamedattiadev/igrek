import type { CacheAudit, PageVitals, RenderAdvice, RoutePerf, VitalValue } from "@godeye/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui";
import { request } from "../../lib/api";
import { cn } from "../../lib/cn";

const fmt = (ms: number) => (ms >= 10_000 ? "> 5 s" : ms >= 1000 ? `≤ ${ms / 1000} s` : `≤ ${ms} ms`);

const TONE = { good: "text-success", needs: "text-warning", poor: "text-danger" } as const;

function Vital({ value, unit }: { value?: VitalValue; unit: "ms" | "cls" }) {
  const { t } = useTranslation();
  if (!value) return <span className="text-fg-subtle">-</span>;
  const shown =
    unit === "cls"
      ? `≤ ${(value.p75 / 1000).toFixed(2)}`
      : value.p75 >= 1000
        ? `≤ ${value.p75 / 1000} s`
        : `≤ ${value.p75} ms`;
  return (
    <span className={TONE[value.rating]} title={t(`perf.rating_${value.rating}`)}>
      {shown}
    </span>
  );
}

/** Core Web Vitals from real visitors (plan.md 15.4): the 75th percentile per page, rated like web.dev. */
function VitalsTable({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PageVitals[]>();
  useEffect(() => {
    let live = true;
    request<PageVitals[]>(`/api/projects/${projectId}/vitals`)
      .then((list) => live && setRows(list))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [projectId]);
  return (
    <section className="space-y-2">
      <h2 className="text-[14px] font-semibold">{t("perf.vitalsTitle")}</h2>
      <p className="text-xs text-fg-muted">{t("perf.vitalsHint")}</p>
      {!rows?.length ? (
        <p className="text-xs text-fg-subtle">{t("perf.vitalsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui border border-border">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead className="bg-bg-subtle text-xs text-fg-muted">
              <tr>
                <th className="px-2 py-1 text-start font-normal">{t("perf.page")}</th>
                <th className="px-2 py-1 text-end font-normal">{t("perf.visits")}</th>
                <th className="px-2 py-1 text-end font-normal">LCP</th>
                <th className="px-2 py-1 text-end font-normal">INP</th>
                <th className="px-2 py-1 text-end font-normal">CLS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.page} className="border-t border-border">
                  <td className="px-2 py-1 font-mono">{r.page}</td>
                  <td className="px-2 py-1 text-end">{r.lcp?.samples ?? r.cls?.samples ?? 0}</td>
                  <td className="px-2 py-1 text-end">
                    <Vital value={r.lcp} unit="ms" />
                  </td>
                  <td className="px-2 py-1 text-end">
                    <Vital value={r.inp} unit="ms" />
                  </td>
                  <td className="px-2 py-1 text-end">
                    <Vital value={r.cls} unit="cls" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Render strategy per page (plan.md 15.4), from the code; only shown for projects that have pages. */
function RenderStrategy({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RenderAdvice[]>();
  useEffect(() => {
    let live = true;
    request<RenderAdvice[]>(`/api/projects/${projectId}/render-advice`)
      .then((list) => live && setRows(list))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [projectId]);
  if (!rows?.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[14px] font-semibold">{t("perf.renderTitle")}</h2>
      <p className="text-xs text-fg-muted">{t("perf.renderHint")}</p>
      <ul className="divide-y divide-border rounded-ui border border-border text-[12.5px]">
        {rows.map((r) => (
          <li key={r.file} className="space-y-0.5 px-3 py-2">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{r.route}</span>
              <span className="rounded bg-bg-subtle px-1.5 text-[11px] uppercase">{r.current}</span>
              {r.suggested && (
                <span className="rounded bg-accent-soft px-1.5 text-[11px] uppercase text-accent">→ {r.suggested}</span>
              )}
              <span className="truncate font-mono text-[11px] text-fg-subtle">{r.file}</span>
            </p>
            {r.reasons.map((reason) => (
              <p key={reason} className="text-xs text-fg-muted">
                {t(`perf.render_${reason}`)}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The live site's cache and compression headers (plan.md 15.4), checked on request. */
function CacheCheck() {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<CacheAudit>();
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setAudit(await request<CacheAudit>("/api/cache-audit", { method: "POST", body: JSON.stringify({ url }) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-2">
      <h2 className="text-[14px] font-semibold">{t("perf.cacheTitle")}</h2>
      <p className="text-xs text-fg-muted">{t("perf.cacheHint")}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          aria-label={t("perf.cacheUrl")}
          className="h-8 min-w-60 flex-1 rounded-ui border border-border bg-bg px-2 text-[12.5px] outline-none focus:border-accent"
        />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !/^https?:\/\//.test(url)}>
          {busy ? t("perf.cacheRunning") : t("perf.cacheRun")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      {audit && (
        <div className="space-y-2 text-[12.5px]">
          <p className="text-xs text-fg-muted">
            {t("perf.cacheChecked", { count: audit.checked })} ·{" "}
            {audit.cdn
              ? t("perf.cacheCdn", {
                  name: audit.cdn.name,
                  hit: audit.cdn.hit === undefined ? "" : audit.cdn.hit ? t("perf.cacheHit") : t("perf.cacheMiss"),
                })
              : t("perf.cacheNoCdn")}{" "}
            · {audit.serviceWorker ? t("perf.cacheSw") : t("perf.cacheNoSw")}
          </p>
          {audit.findings.length === 0 ? (
            <p className="text-xs text-success">{t("perf.cacheClean")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-ui border border-border">
              {audit.findings.map((f) => (
                <li key={`${f.rule}:${f.url}`} className="space-y-0.5 px-3 py-2">
                  <p className="font-medium">{t(`perf.cache_${f.rule}`)}</p>
                  <p className="truncate font-mono text-[11px] text-fg-subtle">
                    {f.url} · {f.seen}
                  </p>
                  <p className="text-xs text-fg-muted">{t(`perf.cacheFix_${f.rule}`)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Response times per endpoint (plan.md 13.4): slowest first, compared with the week before. */
export function PerfPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<RoutePerf[]>();
  useEffect(() => {
    request<RoutePerf[]>(`/api/projects/${projectId}/perf`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [projectId]);
  return (
    <div className="space-y-6">
      <RenderStrategy projectId={projectId} />
      <VitalsTable projectId={projectId} />
      <CacheCheck />
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">{t("perf.title")}</h2>
        {!rows?.length ? (
          <p className="text-xs text-fg-subtle">{t("perf.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-ui border border-border">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead className="bg-bg-subtle text-xs text-fg-muted">
                <tr>
                  <th className="px-2 py-1 text-start font-normal">{t("perf.route")}</th>
                  <th className="px-2 py-1 text-end font-normal">{t("perf.requests")}</th>
                  <th className="px-2 py-1 text-end font-normal">p50</th>
                  <th className="px-2 py-1 text-end font-normal">p95</th>
                  <th className="px-2 py-1 text-end font-normal">{t("perf.errors")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.route} className="border-t border-border">
                    <td className="px-2 py-1 font-mono">{r.route}</td>
                    <td className="px-2 py-1 text-end">{r.count}</td>
                    <td className="px-2 py-1 text-end">{fmt(r.p50)}</td>
                    <td
                      className={cn(
                        "px-2 py-1 text-end",
                        r.p95 >= 1000 ? "text-danger" : r.p95 >= 500 ? "text-warning" : "",
                      )}
                    >
                      {fmt(r.p95)}
                      {r.previousP95 !== undefined && r.previousP95 !== r.p95 && (
                        <span
                          className={cn("ms-1 text-[11px]", r.p95 > r.previousP95 ? "text-danger" : "text-success")}
                        >
                          {r.p95 > r.previousP95 ? t("perf.slower") : t("perf.faster")}
                        </span>
                      )}
                    </td>
                    <td className={cn("px-2 py-1 text-end", r.errors && "text-danger")}>{r.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
