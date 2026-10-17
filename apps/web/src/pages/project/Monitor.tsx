import type { AppErrorGroup, ProjectDetail } from "@godeye/core";
import { Bug, Check, ChevronDown, ChevronRight, Code, EyeOff, RotateCcw, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Badge, Button, Card, CopyButton, Dialog, EmptyState, Segmented } from "../../components/ui";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { opsApi } from "../../lib/ops-api";
import { IncidentButton } from "../Incident";
import { LogsPanel } from "../tools/Logs";
import { AnalyticsPanel } from "./Analytics";
import { FeedbackPanel } from "./FeedbackPanel";
import { PerfPanel } from "./Perf";

function Snippet({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<{ browser: string; server: string }>();
  const [kind, setKind] = useState<"browser" | "server">("browser");
  useEffect(() => {
    if (open && !code)
      opsApi
        .errorSnippet(projectId)
        .then(setCode)
        .catch(() => undefined);
  }, [open, code, projectId]);
  return (
    <Dialog open={open} onClose={onClose} label={t("apperrors.setup")} wide>
      <div className="space-y-3 p-5">
        <h2 className="text-[15px] font-semibold">{t("apperrors.setup")}</h2>
        <p className="text-[13px] text-fg-muted">{t("apperrors.setupBody")}</p>
        <Segmented
          label={t("apperrors.setup")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "browser", label: t("apperrors.browser") },
            { value: "server", label: t("apperrors.server") },
          ]}
        />
        {code && (
          <div className="relative">
            <pre className="max-h-80 overflow-auto rounded-ui border border-border bg-bg-subtle p-3 font-mono text-[11.5px]">
              {code[kind]}
            </pre>
            <div className="absolute end-2 top-2">
              <CopyButton text={code[kind]} />
            </div>
          </div>
        )}
        <p className="text-xs text-fg-subtle">{t("apperrors.setupNote")}</p>
        <div className="flex justify-end">
          <Button onClick={onClose}>{t("apperrors.done")}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function ErrorRow({ g }: { g: AppErrorGroup }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const status = (s: AppErrorGroup["status"]) => void opsApi.setErrorStatus(g.id, s);
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
            <span className="block truncate font-mono text-[12.5px]">{g.message}</span>
            <span className="block text-[11px] text-fg-subtle">
              {t("apperrors.seen", { count: g.count, first: relativeTime(g.firstAt), last: relativeTime(g.lastAt) })}
              {g.browsers.length > 0 && ` · ${g.browsers.join(", ")}`}
            </span>
          </span>
        </button>
        {g.status !== "open" && <Badge>{t(`apperrors.status_${g.status}`)}</Badge>}
        {g.firstRelease && (
          <Badge tone="accent">
            <span className="font-mono">{t("apperrors.since", { release: g.firstRelease.slice(0, 7) })}</span>
          </Badge>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Wrench}
          onClick={async () => navigate(`/runs/${(await opsApi.fixAppError(g.id)).runId}`)}
          data-tip={t("logs.fixTip")}
        >
          {t("logs.fix")}
        </Button>
        {g.status === "open" ? (
          <>
            <Button size="sm" variant="ghost" icon={Check} onClick={() => status("resolved")}>
              {t("apperrors.resolve")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={EyeOff}
              aria-label={t("apperrors.ignore")}
              data-tip={t("apperrors.ignore")}
              onClick={() => status("ignored")}
            />
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => status("open")}>
            {t("apperrors.reopen")}
          </Button>
        )}
      </div>
      {open && (
        <div className="ms-6 space-y-2">
          {g.stack && (
            <pre className="max-h-60 overflow-auto rounded-ui bg-bg-subtle p-2 font-mono text-[11px]">{g.stack}</pre>
          )}
          {g.urls.length > 0 && <p className="break-all text-xs text-fg-muted">{g.urls.join(" · ")}</p>}
          {g.suspects?.length ? (
            <div className="text-xs">
              <p className="font-medium">{t("apperrors.suspects")}</p>
              <ul className="mt-1 space-y-0.5">
                {g.suspects.map((s) => (
                  <li key={s.hash}>
                    <span className="font-mono text-fg-subtle">{s.hash}</span> {s.subject}{" "}
                    <span className="text-fg-subtle">· {s.author}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-fg-subtle">{t("apperrors.noSuspects")}</p>
          )}
        </div>
      )}
    </li>
  );
}

/** Errors the app reported and its logs (plan.md 12). */
export function MonitorTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<AppErrorGroup[]>();
  const [setup, setSetup] = useState(false);
  const load = useCallback(
    () =>
      void opsApi
        .appErrors(project.id)
        .then(setGroups)
        .catch(() => undefined),
    [project.id],
  );
  useEffect(load, [load]);
  useServerEvent("ops-changed", (m) => m.what === "errors" && load());
  return (
    <div className="space-y-8">
      <IncidentButton projectId={project.id} />
      <AnalyticsPanel projectId={project.id} />
      <FeedbackPanel projectId={project.id} />
      <PerfPanel projectId={project.id} />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{t("apperrors.title")}</h2>
          <Button variant="ghost" icon={Code} onClick={() => setSetup(true)}>
            {t("apperrors.setup")}
          </Button>
        </div>
        {groups && !groups.length ? (
          <EmptyState icon={Bug} title={t("apperrors.emptyTitle")} body={t("apperrors.emptyBody")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {(groups ?? []).map((g) => (
                <ErrorRow key={g.id} g={g} />
              ))}
            </ul>
          </Card>
        )}
        <Snippet projectId={project.id} open={setup} onClose={() => setSetup(false)} />
      </section>
      <section className="space-y-3">
        <h2 className="text-[14px] font-semibold">{t("logs.title")}</h2>
        <LogsPanel projectId={project.id} />
      </section>
    </div>
  );
}
