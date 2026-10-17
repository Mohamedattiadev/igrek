import type { Feedback } from "@godeye/core";
import { Check, ClipboardPlus, EyeOff, MessageCircleHeart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "../../components/ui";
import { request } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";

const TONE = { bug: "danger", feature: "accent", praise: "success", question: "warning", other: "neutral" } as const;

/** What your product's users wrote (plan.md 13.5), sorted by the PM persona. */
export function FeedbackPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Feedback[]>();
  const [filter, setFilter] = useState<Feedback["kind"] | "all">("all");
  const load = useCallback(
    () =>
      void request<Feedback[]>(`/api/projects/${projectId}/feedback`)
        .then(setList)
        .catch(() => undefined),
    [projectId],
  );
  useEffect(load, [load]);
  useServerEvent("ops-changed", (m) => m.what === "feedback" && load());
  const open = (list ?? []).filter((f) => f.status !== "dismissed" && f.status !== "done");
  const shown = open.filter((f) => filter === "all" || f.kind === filter);
  const counts = (["bug", "feature", "praise", "question", "other"] as const).map(
    (k) => [k, open.filter((f) => f.kind === k).length] as const,
  );
  const unsorted = open.filter((f) => !f.kind).length;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[14px] font-semibold">{t("feedback.title")}</h2>
        {unsorted > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void request(`/api/projects/${projectId}/feedback/sort`, { method: "POST", body: "{}" })}
          >
            {t("feedback.sort", { count: unsorted })}
          </Button>
        )}
      </div>
      {!list?.length ? (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <MessageCircleHeart size={13} aria-hidden="true" />
          {t("feedback.empty")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                filter === "all" ? "border-accent bg-accent-soft" : "border-border",
              )}
            >
              {t("feedback.all", { count: open.length })}
            </button>
            {counts.map(([k, n]) =>
              n ? (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px]",
                    filter === k ? "border-accent bg-accent-soft" : "border-border",
                  )}
                >
                  {t(`feedback.kind_${k}`)} {n}
                </button>
              ) : null,
            )}
          </div>
          <Card>
            <ul className="divide-y divide-border">
              {shown.slice(0, 50).map((f) => (
                <li key={f.id} className="flex flex-wrap items-start gap-2 px-pad py-2">
                  {f.kind && <Badge tone={TONE[f.kind]}>{t(`feedback.kind_${f.kind}`)}</Badge>}
                  <div className="min-w-0 flex-1">
                    {f.summary && <p className="text-[13px] font-medium">{f.summary}</p>}
                    <p className="whitespace-pre-wrap text-xs text-fg-muted">{f.text}</p>
                    <p className="text-[11px] text-fg-subtle">
                      {relativeTime(f.at)}
                      {f.page && ` · ${f.page}`}
                      {f.contact && ` · ${f.contact}`}
                      {f.sentiment && ` · ${t(`feedback.mood_${f.sentiment}`)}`}
                    </p>
                  </div>
                  {f.taskId ? (
                    <Badge tone="accent">{t("feedback.onBoard")}</Badge>
                  ) : (
                    (f.kind === "bug" || f.kind === "feature") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={ClipboardPlus}
                        onClick={() => void request(`/api/feedback/${f.id}/task`, { method: "POST", body: "{}" })}
                      >
                        {t("host.toBoard")}
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Check}
                    aria-label={t("feedback.done")}
                    data-tip={t("feedback.done")}
                    onClick={() =>
                      void request(`/api/feedback/${f.id}/status`, {
                        method: "POST",
                        body: JSON.stringify({ status: "done" }),
                      })
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={EyeOff}
                    aria-label={t("feedback.dismiss")}
                    data-tip={t("feedback.dismiss")}
                    onClick={() =>
                      void request(`/api/feedback/${f.id}/status`, {
                        method: "POST",
                        body: JSON.stringify({ status: "dismissed" }),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  );
}
