import type { FlowRun, ProjectListItem } from "@igrek/core";
import { Layers } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Badge, Card, EmptyState, PageHeader, RUN_TONE } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

/**
 * "/batch?runs=a,b": one task sent to several projects from the start box, one run per project in its
 * own copy. Each row opens its run, where the changes are read and merged (or not) one by one.
 */
export function BatchPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const ids = (params.get("runs") ?? "").split(",").filter(Boolean).slice(0, 50);
  const key = ids.join(",");
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const load = useCallback(() => {
    void Promise.all(
      key
        .split(",")
        .filter(Boolean)
        .map((id) => api.flowRun(id).catch(() => undefined)),
    ).then((list) => setRuns(list.filter((r): r is FlowRun => !!r)));
  }, [key]);
  useEffect(load, [load]);
  useEffect(() => {
    api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
  }, []);
  useServerEvent("flows-changed", (m) => (!m.runId || ids.includes(m.runId)) && load());
  const name = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  return (
    <>
      <PageHeader title={t("batch.title")} />
      <div className="mx-auto w-full max-w-4xl space-y-3 p-6">
        {runs[0] && <p className="text-[13px] text-fg-muted">{runs[0].request}</p>}
        {ids.length === 0 ? (
          <EmptyState icon={Layers} title={t("batch.empty")} body={t("batch.emptyBody")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link to={`/runs/${run.id}`} className="flex items-center gap-3 px-pad py-2.5 hover:bg-bg-hover">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name(run.projectId)}</span>
                    <span className="text-[11.5px] text-fg-subtle">
                      {t("batch.files", { count: run.changes?.length ?? 0 })}
                    </span>
                    <span className="text-[11.5px] text-fg-subtle">{relativeTime(run.updatedAt)}</span>
                    <Badge tone={RUN_TONE[run.status]}>{t(`flows.status_${run.status}`)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-[12px] text-fg-subtle">{t("batch.hint")}</p>
      </div>
    </>
  );
}
