import type { Idea, IdeaStatus, ProjectListItem } from "@godeye/core";
import { Lightbulb, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { actions } from "../lib/actions";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";

const STATUSES: IdeaStatus[] = ["new", "accepted", "later", "dropped"];
const VALUE_TONE = { low: "neutral", medium: "accent", high: "success" } as const;

/** Every idea in one place, sorted by a PM persona so none gets lost and none derails focus. */
export function IdeasPage() {
  const { t } = useTranslation();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [filter, setFilter] = useState<IdeaStatus>("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    api
      .ideas()
      .then(setIdeas)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
    // Refresh when an idea is captured with Ctrl+I.
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const triage = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setIdeas(await api.triageIdeas());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (idea: Idea, status: IdeaStatus) => {
    await api.updateIdea(idea.id, { status });
    load();
  };
  const name = (id: string | null) => projects.find((p) => p.id === id)?.name;
  const shown = ideas.filter((i) => i.status === filter);

  return (
    <>
      <PageHeader
        title={t("ideas.title")}
        actions={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" icon={Sparkles} onClick={triage} disabled={busy}>
              {busy ? t("ideas.triaging") : t("ideas.triage")}
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => actions.captureIdea()}>
              {t("ideas.capture")}
            </Button>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
        <div className="flex gap-1">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={cn(
                "rounded-ui px-3 py-1 text-[13px]",
                filter === status ? "bg-bg-active font-medium text-fg" : "text-fg-muted hover:bg-bg-hover",
              )}
            >
              {t(`ideas.${status}`)}
              <span className="ms-1.5 text-fg-subtle">{ideas.filter((i) => i.status === status).length}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {shown.length === 0 ? (
          <EmptyState icon={Lightbulb} title={t("ideas.title")} body={t("ideas.empty")} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {shown.map((idea) => (
                <li key={idea.id} data-nav-item tabIndex={-1} className="group space-y-1.5 px-pad py-3">
                  <div className="flex items-start gap-3">
                    <p className="flex-1 text-[13.5px] leading-relaxed">{idea.text}</p>
                    <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(idea.createdAt)}</span>
                  </div>
                  {idea.triage && <p className="text-xs text-fg-muted">{idea.triage.note}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(idea.projectId || idea.triage) && (
                      <Badge tone="accent">{name(idea.projectId) ?? t("ideas.noProject")}</Badge>
                    )}
                    {idea.triage && (
                      <>
                        <Badge>{t(`ideas.kind_${idea.triage.kind}`)}</Badge>
                        <Badge>{t(`ideas.effort_${idea.triage.effort}`)}</Badge>
                        <Badge tone={VALUE_TONE[idea.triage.value]}>{t(`ideas.value_${idea.triage.value}`)}</Badge>
                      </>
                    )}
                    <div className="flex-1" />
                    {STATUSES.filter((s) => s !== idea.status).map((status) => (
                      <Button key={status} size="sm" variant="ghost" onClick={() => setStatus(idea, status)}>
                        {t(`ideas.${status}`)}
                      </Button>
                    ))}
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={async () => {
                        await api.deleteIdea(idea.id);
                        load();
                      }}
                      className="p-1 text-fg-subtle opacity-0 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
