import type { LaunchPart } from "@igrek/core";
import { ExternalLink, Play, Rocket, ScrollText, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "../../components/ui";
import { request } from "../../lib/api";
import { useServerEvent } from "../../lib/live";

type Launch = { parts: LaunchPart[]; auto: string[] };

const TONE: Record<LaunchPart["status"], "neutral" | "accent" | "success" | "danger"> = {
  stopped: "neutral",
  starting: "accent",
  running: "success",
  failed: "danger",
};

const call = (projectId: string, action: string, body: unknown = {}) =>
  request<Launch>(`/api/projects/${projectId}/launch/${action}`, { method: "POST", body: JSON.stringify(body) });

/** A part's last lines, opened under it. */
function Logs({ projectId, part }: { projectId: string; part: string }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    const load = () =>
      void request<string[]>(`/api/projects/${projectId}/launch/logs?part=${encodeURIComponent(part)}`)
        .then((l) => current && setLines(l))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 2000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [projectId, part]);
  return (
    <pre className="max-h-48 overflow-auto rounded-ui bg-bg-muted p-2 font-mono text-[11.5px] leading-relaxed">
      {lines.slice(-80).join("\n") || "…"}
    </pre>
  );
}

/**
 * Start the project (plan.md 19.4): each part it names (apps' dev scripts, Compose services,
 * Procfile processes, Makefile targets) with its state, address and log, started one by one or
 * all at once; ticked parts start by themselves when the project is opened.
 */
export function LaunchPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [launch, setLaunch] = useState<Launch>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();
  const load = useCallback(
    () =>
      void request<Launch>(`/api/projects/${projectId}/launch`)
        .then(setLaunch)
        .catch(() => setLaunch({ parts: [], auto: [] })),
    [projectId],
  );
  useEffect(load, [load]);
  useServerEvent("launch-changed", (m) => m.projectId === projectId && load());
  const act = (action: string, body?: unknown) =>
    void call(projectId, action, body)
      .then((l) => {
        setLaunch(l);
        setError(undefined);
      })
      .catch((err: Error) => setError(err.message));
  if (!launch?.parts.length) return null;
  const anyRunning = launch.parts.some((p) => p.status === "running" || p.status === "starting");
  return (
    <Card className="space-y-2 p-pad">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Rocket size={14} className="text-accent" aria-hidden="true" />
          {t("launch.title")}
        </h3>
        <span className="flex-1 text-[12px] text-fg-subtle">{t("launch.hint")}</span>
        <Button size="sm" variant="primary" icon={Play} onClick={() => act("start-all")}>
          {t("launch.startAll")}
        </Button>
        {anyRunning && (
          <Button size="sm" icon={Square} onClick={() => act("stop-all")}>
            {t("launch.stopAll")}
          </Button>
        )}
      </div>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      <ul className="divide-y divide-border text-[12.5px]">
        {launch.parts.map((p) => {
          const on = p.status === "running" || p.status === "starting";
          const auto = launch.auto.includes(p.id);
          return (
            <li key={p.id} className="space-y-1.5 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[p.status]}>{t(`launch.status_${p.status}`)}</Badge>
                <span className="font-medium">{p.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-subtle">{p.command}</span>
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    {p.url.replace(/^https?:\/\//, "")}
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
                {!p.url && p.port && <span className="text-fg-muted">:{p.port}</span>}
                <label className="flex items-center gap-1 text-fg-muted" data-tip={t("launch.autoTip")}>
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={() =>
                      act("auto", { parts: auto ? launch.auto.filter((a) => a !== p.id) : [...launch.auto, p.id] })
                    }
                  />
                  {t("launch.auto")}
                </label>
                {p.kind !== "compose" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ScrollText}
                    aria-label={t("launch.logs")}
                    data-tip={t("launch.logs")}
                    onClick={() => setOpen(open === p.id ? undefined : p.id)}
                  />
                )}
                <Button size="sm" icon={on ? Square : Play} onClick={() => act(on ? "stop" : "start", { part: p.id })}>
                  {t(on ? "launch.stop" : "launch.start")}
                </Button>
              </div>
              {open === p.id && <Logs projectId={projectId} part={p.id} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
