import type { PageVitals, RoutePerf, VitalValue } from "@godeye/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
      <VitalsTable projectId={projectId} />
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
