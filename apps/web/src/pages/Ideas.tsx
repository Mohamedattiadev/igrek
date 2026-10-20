import type { Idea, IdeaReview, IdeaStatus, ProjectListItem } from "@igrek/core";
import { Briefcase, Lightbulb, ListFilter, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { actions } from "../lib/actions";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { deferDelete, usePendingDeletes } from "../lib/undo";

const STATUSES: IdeaStatus[] = ["new", "accepted", "later", "dropped"];
const VALUE_TONE = { low: "neutral", medium: "accent", high: "success" } as const;

const VERDICT_STATUS = { now: "accepted", later: "later", drop: "dropped" } as const;

/** The CEO advisor's weekly look: what to do now, later, or drop (plan.md 2.6c). Nothing changes until you apply it. */
function ReviewPanel({
  review,
  ideas,
  onApply,
  onClose,
}: {
  review: IdeaReview;
  ideas: Idea[];
  onApply: (items: IdeaReview["items"]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const text = (id: string) => ideas.find((i) => i.id === id)?.text ?? id;
  return (
    <Card className="space-y-3 border-accent p-pad">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Briefcase size={14} className="text-accent" aria-hidden="true" /> {t("ideas.reviewTitle")}
      </p>
      {review.focus && <p className="text-[13px] leading-relaxed">{review.focus}</p>}
      {(["now", "later", "drop"] as const).map((verdict) => {
        const items = review.items.filter((i) => i.verdict === verdict);
        if (!items.length) return null;
        return (
          <div key={verdict}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
              {t(`ideas.verdict_${verdict}`)}
            </p>
            <ul className="mt-1 space-y-1">
              {items.map((i) => (
                <li key={i.id} className="text-[12.5px]">
                  <span className="font-medium">{text(i.id)}</span>
                  {i.why && <span className="text-fg-muted"> · {i.why}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("ideas.reviewClose")}
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onApply(review.items).finally(() => setBusy(false));
          }}
        >
          {t("ideas.reviewApply")}
        </Button>
      </div>
    </Card>
  );
}

/** Every idea in one place, sorted by a PM persona so none gets lost and none derails focus. */
export function IdeasPage() {
  const { t } = useTranslation();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [filter, setFilter] = useState<IdeaStatus>("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [review, setReview] = useState<IdeaReview>();
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const runReview = async () => {
    setReviewing(true);
    setError(undefined);
    try {
      setReview(await api.reviewIdeas());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReviewing(false);
    }
  };

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
  const { isPending } = usePendingDeletes();
  const shown = ideas.filter((i) => i.status === filter && !isPending(`idea-${i.id}`));

  return (
    <>
      <PageHeader
        title={t("ideas.title")}
        actions={
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon={Briefcase}
              onClick={() => void runReview()}
              disabled={reviewing}
              data-tip={t("ideas.reviewTip")}
              aria-label={t("ideas.review")}
            >
              <span className="hidden md:inline">{reviewing ? t("ideas.reviewing") : t("ideas.review")}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={ListFilter}
              onClick={triage}
              disabled={busy}
              aria-label={t("ideas.triage")}
            >
              <span className="hidden md:inline">{busy ? t("ideas.triaging") : t("ideas.triage")}</span>
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
        {notice && <p className="text-xs text-success">{notice}</p>}
        {review && (
          <ReviewPanel
            review={review}
            ideas={ideas}
            onClose={() => setReview(undefined)}
            onApply={async (items) => {
              for (const item of items) await api.updateIdea(item.id, { status: VERDICT_STATUS[item.verdict] });
              setReview(undefined);
              load();
            }}
          />
        )}
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
                    {idea.status === "accepted" && idea.projectId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.addCard(idea.projectId as string, {
                            title: idea.text,
                            origin: t("ideas.fromIdea"),
                          });
                          setNotice(t("ideas.onBoard", { project: name(idea.projectId) ?? "" }));
                        }}
                      >
                        {t("ideas.toBoard")}
                      </Button>
                    )}
                    {STATUSES.filter((s) => s !== idea.status).map((status) => (
                      <Button key={status} size="sm" variant="ghost" onClick={() => setStatus(idea, status)}>
                        {t(`ideas.${status}`)}
                      </Button>
                    ))}
                    <button
                      type="button"
                      aria-label={t("memory.delete")}
                      onClick={() =>
                        deferDelete(`idea-${idea.id}`, idea.text.slice(0, 60), () => api.deleteIdea(idea.id), load)
                      }
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
