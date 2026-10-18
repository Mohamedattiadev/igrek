import type { ApiMap, CodeRef, Endpoint, HttpResponse } from "@igrek/core";
import {
  Activity,
  ArrowLeft,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Play,
  Plug,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Diagram } from "../../components/insight";
import { Badge, Button, Card, Dialog } from "../../components/ui";
import { api } from "../../lib/api";
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

const tester =
  "h-8 w-full rounded-ui border border-border bg-bg px-2 font-mono text-[12px] outline-none focus:border-accent";

/** A tiny Postman: pick an endpoint, fill the path, send, see the answer (plan.md 5.5). */
function ApiTester({ base, endpoint, onClose }: { base: string; endpoint?: Endpoint; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ method: "GET", url: "", headers: "", body: "" });
  const [res, setRes] = useState<HttpResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!endpoint) return;
    setRes(undefined);
    setError(undefined);
    setForm({
      method: endpoint.method === "ANY" ? "GET" : endpoint.method,
      url: `${base}${endpoint.path}`,
      headers: endpoint.method === "GET" ? "" : "content-type: application/json",
      body: endpoint.method === "GET" || endpoint.method === "DELETE" ? "" : "{\n  \n}",
    });
  }, [endpoint, base]);
  const send = () => {
    setBusy(true);
    setError(undefined);
    const headers = Object.fromEntries(
      form.headers
        .split("\n")
        .map((l) => l.split(/:(.*)/s).map((x) => x.trim()))
        .filter(([k, v]) => k && v),
    );
    api
      .http({ method: form.method, url: form.url, headers, body: form.body || undefined })
      .then(setRes)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  let pretty = res?.body ?? "";
  try {
    if (res && /json/.test(res.headers["content-type"] ?? "")) pretty = JSON.stringify(JSON.parse(res.body), null, 2);
  } catch {
    // not JSON after all
  }
  return (
    <Dialog open={!!endpoint} onClose={onClose} label={t("apis.tester")} wide>
      <div className="space-y-3 p-5">
        <h2 className="text-[14px] font-semibold">{t("apis.tester")}</h2>
        <div className="flex gap-2">
          <select
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
            aria-label={t("apis.method")}
            className={`${tester} w-28`}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            aria-label="URL"
            className={tester}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button variant="primary" icon={Send} disabled={busy} onClick={send}>
            {t("apis.send")}
          </Button>
        </div>
        <p className="text-[11px] text-fg-subtle">{t("apis.testerHint")}</p>
        <textarea
          value={form.headers}
          onChange={(e) => setForm({ ...form, headers: e.target.value })}
          placeholder="authorization: Bearer …"
          aria-label={t("apis.headers")}
          rows={2}
          className={`${tester} h-auto py-1.5`}
        />
        {form.method !== "GET" && form.method !== "HEAD" && (
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            aria-label={t("apis.body")}
            rows={5}
            className={`${tester} h-auto py-1.5`}
          />
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {res && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-xs">
              <Badge
                tone={
                  res.status < 300 ? "success" : res.status < 400 ? "accent" : res.status < 500 ? "warning" : "danger"
                }
              >
                {res.status} {res.statusText}
              </Badge>
              <span className="text-fg-subtle">
                {res.ms} ms · {Math.round(res.size / 102.4) / 10} KB{res.truncated ? ` · ${t("apis.truncated")}` : ""}
              </span>
            </p>
            <pre className="max-h-80 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11px] whitespace-pre-wrap">
              {pretty || "—"}
            </pre>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Every API the project talks to and every endpoint it serves (plan.md 5.5). */
export function ApiMapView({ projectId, map }: { projectId: string; map: ApiMap }) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [base, setBase] = useState("http://localhost:3000");
  const [trying, setTrying] = useState<Endpoint>();
  const [health, setHealth] = useState<Record<string, number | "error">>();
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    api
      .httpBase(projectId)
      .then((r) => setBase(r.base))
      .catch(() => undefined);
  }, [projectId]);
  /** GET endpoints without parameters, called once each against the base address. */
  const checkHealth = async () => {
    setChecking(true);
    const out: Record<string, number | "error"> = {};
    for (const e of map.endpoints
      .filter((x) => (x.method === "GET" || x.method === "ANY") && !x.path.includes(":") && !x.path.includes("*"))
      .slice(0, 40)) {
      const key = `${e.method} ${e.path}`;
      out[key] = await api
        .http({ method: "GET", url: `${base}${e.path}` })
        .then((r) => r.status)
        .catch(() => "error" as const);
      setHealth({ ...out });
    }
    setChecking(false);
  };
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
          {map.endpoints.length > 0 && (
            <>
              <input
                value={base}
                onChange={(e) => setBase(e.target.value.replace(/\/+$/, ""))}
                aria-label={t("apis.base")}
                data-tip={t("apis.baseTip")}
                className="h-7 w-52 rounded-ui border border-border bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent"
              />
              <Button
                size="sm"
                icon={checking ? LoaderCircle : Activity}
                disabled={checking}
                onClick={() => void checkHealth()}
                data-tip={t("apis.healthTip")}
              >
                {t("apis.health")}
              </Button>
            </>
          )}
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
                  <th className="w-16 py-1" />
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
                        {health?.[`${e.method} ${e.path}`] !== undefined && (
                          <Badge
                            tone={
                              typeof health[`${e.method} ${e.path}`] === "number" &&
                              (health[`${e.method} ${e.path}`] as number) < 400
                                ? "success"
                                : "danger"
                            }
                          >
                            {String(health[`${e.method} ${e.path}`])}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-1 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Play}
                        onClick={() => setTrying(e)}
                        data-tip={t("apis.tryTip")}
                      >
                        {t("apis.try")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ApiTester base={base} endpoint={trying} onClose={() => setTrying(undefined)} />

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
