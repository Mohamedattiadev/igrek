import type { DevServerInfo, PickedElement, PreviewError, ProjectDetail, QuickEdit, VisualCheck } from "@igrek/core";
import {
  ArrowDown,
  ArrowUp,
  Crosshair,
  ExternalLink,
  Monitor,
  Play,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Smartphone,
  Square,
  Tablet,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Badge, Button, Card } from "../../components/ui";
import { api, fs } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useServerEvent } from "../../lib/live";
import { startPersonaChat, usePersonaLabel, usePersonas } from "../../lib/personas";

const DEVICES = { desktop: 1280, tablet: 768, phone: 390 } as const;
type Device = keyof typeof DEVICES;
const PERSONAS = ["frontend", "uiux", "a11y-tester", "security"];

/** Live preview with pick-and-change (plan.md Faz 10). */
export function PreviewTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [server, setServer] = useState<DevServerInfo | null>(null);
  const [plan, setPlan] = useState<{ script: string; framework: string; vite: boolean } | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedElement>();
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [instruction, setInstruction] = useState("");
  const [persona, setPersona] = useState("frontend");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<QuickEdit>();
  const [logs, setLogs] = useState<string[]>();
  const [visual, setVisual] = useState<VisualCheck>();
  const [visualBusy, setVisualBusy] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [error, setError] = useState<string>();
  const { personas } = usePersonas();
  const label = usePersonaLabel();

  const load = () => {
    api
      .preview(project.id)
      .then((r) => {
        setServer(r.server);
        setPlan(r.plan);
      })
      .catch(() => undefined);
  };
  useEffect(load, [project.id]);
  useServerEvent("devservers-changed", (m) => m.projectId === project.id && load());

  const send = (msg: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage({ igrek: true, ...msg }, "*");
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.igrek) return;
      if (e.data.type === "picked") {
        setPicked(e.data.element as PickedElement);
        setPicking(false);
        send({ type: "pick", on: false });
      } else if (e.data.type === "error") setErrors((list) => [e.data.error as PreviewError, ...list].slice(0, 30));
      else if (e.data.type === "ready") {
        // After a hot reload or navigation: keep the same element selected.
        if (picked) send({ type: "reselect", selector: picked.selector });
        if (picking) send({ type: "pick", on: true });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });
  useEffect(() => {
    if (!logs) return;
    const timer = setInterval(() => {
      api
        .previewLogs(project.id)
        .then(setLogs)
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [logs, project.id]);

  const start = async () => {
    setError(undefined);
    try {
      setServer(await api.startPreview(project.id, externalUrl || undefined));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const change = async () => {
    if (!picked) return;
    setBusy(true);
    setEdit(undefined);
    try {
      setEdit(await api.previewEdit(project.id, { instruction, element: picked, personaId: persona || undefined }));
    } catch (err) {
      setEdit({ ok: false, summary: "", ms: 0, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const runVisual = async (action: "baseline" | "compare") => {
    setVisualBusy(true);
    try {
      setVisual(await api.previewVisual(project.id, picked?.url ?? "/", action));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVisualBusy(false);
    }
  };
  const running = server?.status === "running" && server.previewUrl;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-2">
        {running ? (
          <>
            <Badge tone="success">{t("preview.running")}</Badge>
            <span className="font-mono text-[11px] text-fg-subtle">{server?.url}</span>
            {server?.sourceMap ? (
              <Badge tone="accent">{t("preview.sourceOn")}</Badge>
            ) : (
              <Badge>{t("preview.sourceOff")}</Badge>
            )}
            <div className="flex-1" />
            <div className="flex rounded-ui border border-border p-0.5">
              {(Object.keys(DEVICES) as Device[]).map((d) => {
                const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={t(`preview.device_${d}`)}
                    aria-pressed={device === d}
                    onClick={() => setDevice(d)}
                    className={cn(
                      "rounded p-1",
                      device === d ? "bg-bg-active text-fg" : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <Button
              size="sm"
              variant={picking ? "primary" : "secondary"}
              icon={Crosshair}
              onClick={() => {
                send({ type: "pick", on: !picking });
                setPicking(!picking);
              }}
            >
              {picking ? t("preview.picking") : t("preview.pick")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={RefreshCw}
              aria-label={t("preview.reload")}
              onClick={() => frame.current?.contentWindow?.location.reload()}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={ScrollText}
              aria-label={t("preview.logs")}
              onClick={() => setLogs(logs ? undefined : [])}
            />
            <a
              href={server?.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1 text-fg-subtle hover:text-fg"
              aria-label={t("preview.open")}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            <Button size="sm" variant="ghost" icon={Square} onClick={() => void api.stopPreview(project.id)}>
              {t("chat.stop")}
            </Button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-fg-muted">
              {server?.status === "starting"
                ? t("preview.starting")
                : server?.status === "failed"
                  ? t("preview.failed")
                  : plan
                    ? t("preview.plan", { script: plan.script, framework: plan.framework })
                    : t("preview.noScript")}
            </span>
            <div className="flex-1" />
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder={t("preview.urlHint")}
              aria-label={t("preview.url")}
              className="h-8 w-56 rounded-md border border-border bg-bg px-2 font-mono text-[12px]"
            />
            <Button
              size="sm"
              variant="primary"
              icon={Play}
              disabled={server?.status === "starting" || (!plan && !externalUrl)}
              onClick={() => void start()}
            >
              {t("preview.start")}
            </Button>
          </>
        )}
      </Card>
      {error && <p className="text-xs text-danger">{error}</p>}
      {server?.status === "failed" && server.error && (
        <pre className="max-h-40 overflow-auto rounded bg-danger-soft p-2 text-[11px] text-danger">{server.error}</pre>
      )}
      {logs && (
        <pre className="max-h-48 overflow-auto rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11px]">
          {logs.join("\n") || "…"}
        </pre>
      )}
      {running && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-auto rounded-ui border border-border bg-bg-subtle p-2">
            <iframe
              ref={frame}
              src={server?.previewUrl}
              title={t("preview.title")}
              className="mx-auto block h-[70vh] rounded border border-border bg-white"
              style={{ width: `${DEVICES[device]}px`, maxWidth: "100%" }}
            />
          </div>
          <div className="space-y-3">
            <Card className="space-y-2 p-pad">
              <p className="text-[13px] font-semibold">{t("preview.selected")}</p>
              {!picked ? (
                <p className="text-xs text-fg-muted">{t("preview.pickHint")}</p>
              ) : (
                <>
                  <p className="font-mono text-[12px]">
                    &lt;{picked.tag}&gt;{picked.id ? `#${picked.id}` : ""}
                    {picked.classes.length ? `.${picked.classes.slice(0, 3).join(".")}` : ""}
                  </p>
                  {picked.source ? (
                    <Link
                      to={`/p/${project.id}?tab=code&file=${encodeURIComponent(picked.source.split(":")[0] ?? "")}`}
                      className="block truncate font-mono text-[11.5px] text-accent hover:underline"
                    >
                      {picked.source}
                    </Link>
                  ) : (
                    <p className="text-[11px] text-fg-subtle">{t("preview.noSource")}</p>
                  )}
                  {picked.text && <p className="line-clamp-2 text-xs text-fg-muted">"{picked.text}"</p>}
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={ArrowUp} onClick={() => send({ type: "up" })}>
                      {t("preview.parent")}
                    </Button>
                    <Button size="sm" variant="ghost" icon={ArrowDown} onClick={() => send({ type: "down" })}>
                      {t("preview.child")}
                    </Button>
                  </div>
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && instruction.trim() && !busy) {
                        e.preventDefault();
                        void change();
                      }
                    }}
                    rows={2}
                    placeholder={t("preview.instructionHint")}
                    aria-label={t("preview.instruction")}
                    className="w-full rounded-md border border-border bg-bg px-2 py-1 text-[12.5px] outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={persona}
                      onChange={(e) => setPersona(e.target.value)}
                      aria-label={t("persona.picker")}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-1.5 text-[12px]"
                    >
                      <option value="">{t("persona.none")}</option>
                      {PERSONAS.map((id) => (
                        <option key={id} value={id}>
                          {
                            label(
                              personas.find((p) => p.id === id),
                              id,
                            ).name
                          }
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={Wand2}
                      disabled={busy || !instruction.trim()}
                      onClick={() => void change()}
                    >
                      {busy ? t("preview.changing") : t("preview.change")}
                    </Button>
                  </div>
                </>
              )}
              {edit && (
                <div className="space-y-1.5 border-t border-border pt-2">
                  {edit.ok ? (
                    <p className="text-xs">
                      {edit.summary} <span className="text-fg-subtle">· {(edit.ms / 1000).toFixed(1)} s</span>
                    </p>
                  ) : (
                    <p className="text-xs text-danger">{edit.error}</p>
                  )}
                  {(edit.before || edit.after) && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {edit.before && (
                        <figure>
                          <img
                            src={`/api/preview/shots/${edit.before}`}
                            alt={t("preview.before")}
                            className="w-full rounded border border-border"
                          />
                          <figcaption className="text-[10px] text-fg-subtle">{t("preview.before")}</figcaption>
                        </figure>
                      )}
                      {edit.after && (
                        <figure>
                          <img
                            src={`/api/preview/shots/${edit.after}`}
                            alt={t("preview.after")}
                            className="w-full rounded border border-border"
                          />
                          <figcaption className="text-[10px] text-fg-subtle">{t("preview.after")}</figcaption>
                        </figure>
                      )}
                    </div>
                  )}
                  {edit.checkpointId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RotateCcw}
                      onClick={() =>
                        void fs
                          .restoreCheckpoint(project.id, edit.checkpointId as string)
                          .then(() => setEdit(undefined))
                      }
                    >
                      {t("preview.undo")}
                    </Button>
                  )}
                </div>
              )}
            </Card>
            <Card className="space-y-2 p-pad">
              <p className="text-[13px] font-semibold">{t("preview.visual")}</p>
              <p className="text-[11px] text-fg-subtle">{t("preview.visualHint")}</p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" disabled={visualBusy} onClick={() => void runVisual("baseline")}>
                  {t("preview.baseline")}
                </Button>
                <Button size="sm" disabled={visualBusy} onClick={() => void runVisual("compare")}>
                  {visualBusy ? t("meeting.looking") : t("preview.compare")}
                </Button>
              </div>
              {visual?.sizes.map((s) => (
                <div key={s.name} className="space-y-1">
                  <p className="text-xs">
                    {t(`preview.device_${s.name}`)}:{" "}
                    <span className={s.changed > 0.005 ? "text-warning" : "text-success"}>
                      {t("preview.changedPct", { n: (s.changed * 100).toFixed(1) })}
                    </span>
                  </p>
                  {s.diff && (
                    <img
                      src={`/api/preview/shots/${s.diff}`}
                      alt={t("preview.diff")}
                      className="w-full rounded border border-border"
                    />
                  )}
                </div>
              ))}
            </Card>
            {errors.length > 0 && (
              <Card className="space-y-1.5 p-pad">
                <p className="text-[13px] font-semibold">{t("preview.errors", { count: errors.length })}</p>
                <ul className="space-y-1.5">
                  {errors.slice(0, 8).map((e) => (
                    <li key={`${e.at}-${e.message}`} className="rounded border border-border p-1.5 text-[11.5px]">
                      <p className="flex items-center gap-1.5">
                        <Badge tone="danger">{t(`preview.err_${e.kind}`)}</Badge>
                        <span className="min-w-0 flex-1 truncate">{e.message}</span>
                      </p>
                      {e.url && <p className="truncate font-mono text-[10.5px] text-fg-subtle">{e.url}</p>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void startPersonaChat(
                            "frontend",
                            project.id,
                            navigate,
                            t("preview.fixDraft", {
                              kind: e.kind,
                              message: e.message,
                              url: e.url ?? "",
                              stack: e.stack ?? "",
                            }),
                          )
                        }
                      >
                        {t("preview.fix")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
