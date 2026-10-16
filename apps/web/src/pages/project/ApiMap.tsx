import type { ApiMap, CodeRef } from "@godeye/core";
import { ArrowLeft, ExternalLink, KeyRound, Plug, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Diagram } from "../../components/insight";
import { Badge, Card } from "../../components/ui";
import { cn } from "../../lib/cn";

const METHOD_TONE: Record<string, string> = {
  GET: "text-success",
  POST: "text-accent",
  PUT: "text-warning",
  PATCH: "text-warning",
  DELETE: "text-danger",
};

function RefLink({ projectId, at: r }: { projectId: string; at: CodeRef }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/p/${projectId}?tab=code&file=${encodeURIComponent(r.path)}&line=${r.line}`}
      className="font-mono text-[11px] text-fg-muted hover:text-accent hover:underline"
      data-tip={t("insight.openFile")}
    >
      {r.path}:{r.line}
    </Link>
  );
}

/** Every API the project talks to and every endpoint it serves (plan.md 5.5). */
export function ApiMapView({ projectId, map }: { projectId: string; map: ApiMap }) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const endpoints = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? map.endpoints.filter((e) => `${e.method} ${e.path} ${e.ref.path}`.toLowerCase().includes(q))
      : map.endpoints;
  }, [filter, map.endpoints]);
  const undocumented = map.env.filter((e) => !e.documented);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setParams({ tab: "sections" })}
        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft size={13} className="rtl:rotate-180" /> {t("insight.allSections")}
      </button>
      <div>
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          <Plug size={17} /> {t("apis.title")}
        </h2>
        <p className="mt-1 text-xs text-fg-muted">{t("apis.hint")}</p>
      </div>

      <Card className="p-pad">
        <h3 className="mb-3 text-[13px] font-semibold">{t("apis.external", { count: map.external.length })}</h3>
        {map.external.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t("apis.noExternal")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {map.external.map((api) => (
              <div key={api.id} className="space-y-2 rounded-ui border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{api.name}</span>
                  {api.id.startsWith("url:") && (
                    <span data-tip={t("apis.unknownTip")}>
                      <Badge>{t("apis.unknown")}</Badge>
                    </span>
                  )}
                  <div className="flex-1" />
                  {api.docs && (
                    <a
                      href={api.docs}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-fg-subtle hover:text-accent"
                      aria-label={t("apis.docs")}
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                {!api.id.startsWith("url:") && (
                  <p className="text-xs text-fg-muted">{t(`apis.what.${api.id}`, { defaultValue: "" })}</p>
                )}
                <div className="space-y-0.5">
                  <p className="text-[11px] text-fg-subtle">{t("apis.usedAt", { count: api.refs.length })}</p>
                  {api.refs.slice(0, 4).map((r) => (
                    <div key={`${r.path}:${r.line}`}>
                      <RefLink projectId={projectId} at={r} />
                    </div>
                  ))}
                  {api.refs.length > 4 && <p className="text-[11px] text-fg-subtle">+{api.refs.length - 4}</p>}
                </div>
                {api.envKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {api.envKeys.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-md bg-bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted"
                        data-tip={t("apis.envKeyTip")}
                      >
                        <KeyRound size={10} /> {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {map.flow && (
        <Card className="space-y-2 p-pad">
          <h3 className="text-[13px] font-semibold">{t("apis.flow")}</h3>
          <p className="text-[11px] text-fg-subtle">{t("apis.flowHint")}</p>
          <Diagram code={map.flow} />
        </Card>
      )}

      <Card className="p-pad">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-[13px] font-semibold">{t("apis.endpoints", { count: map.endpoints.length })}</h3>
          <div className="flex-1" />
          {map.endpoints.length > 8 && (
            <label className="flex items-center gap-1.5 rounded-ui border border-border px-2">
              <Search size={13} className="text-fg-subtle" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("apis.filter")}
                aria-label={t("apis.filter")}
                className="h-7 w-48 bg-transparent text-xs outline-none"
              />
            </label>
          )}
        </div>
        {map.endpoints.length === 0 ? (
          <p className="text-xs text-fg-subtle">{t("apis.noEndpoints")}</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-bg text-start text-[11px] text-fg-subtle">
                <tr>
                  <th className="w-16 py-1 text-start font-medium">{t("apis.method")}</th>
                  <th className="py-1 text-start font-medium">{t("apis.path")}</th>
                  <th className="py-1 text-start font-medium">{t("apis.where")}</th>
                  <th className="py-1 text-start font-medium">{t("apis.calls")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {endpoints.map((e) => (
                  <tr key={`${e.method} ${e.path} ${e.ref.path}:${e.ref.line}`}>
                    <td
                      className={cn(
                        "py-1 font-mono text-[11px] font-semibold",
                        METHOD_TONE[e.method] ?? "text-fg-muted",
                      )}
                    >
                      {e.method}
                    </td>
                    <td className="py-1 font-mono">{e.path}</td>
                    <td className="py-1">
                      <RefLink projectId={projectId} at={e.ref} />
                    </td>
                    <td className="py-1">
                      <div className="flex flex-wrap gap-1">
                        {e.calls.map((c) => (
                          <Badge key={c}>{map.external.find((x) => x.id === c)?.name ?? c}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(undocumented.length > 0 || map.unusedEnv.length > 0) && (
        <Card className="space-y-3 p-pad">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold">
            <TriangleAlert size={14} className="text-warning" /> {t("apis.envIssues")}
          </h3>
          {undocumented.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted">{t("apis.undocumented", { count: undocumented.length })}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {undocumented.map((e) => (
                  <Link
                    key={e.name}
                    to={`/p/${projectId}?tab=code&file=${encodeURIComponent(e.refs[0]?.path ?? "")}&line=${e.refs[0]?.line ?? 1}`}
                    className="rounded-md bg-warning-soft px-1.5 py-0.5 font-mono text-[10.5px] text-warning hover:underline"
                    data-tip={e.refs[0] ? `${e.refs[0].path}:${e.refs[0].line}` : undefined}
                  >
                    {e.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {map.unusedEnv.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted">{t("apis.unused", { count: map.unusedEnv.length })}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {map.unusedEnv.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
