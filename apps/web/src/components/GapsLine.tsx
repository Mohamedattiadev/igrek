import type { ProjectGap } from "@igrek/core";
import { BookOpenText, CircleAlert, FlaskConical, KanbanSquare, Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { request } from "../lib/api";

const ICON = { tests: FlaskConical, readme: BookOpenText, cards: KanbanSquare, errors: CircleAlert };

/**
 * What the project lacks (suggestions.ts, plan.md 19.8), as one quiet line: "no tests yet",
 * "the README is behind", "2 cards wait for review", "3 open errors". Writing tests or the README
 * fills the box (`onWrite`, where there is one); cards and errors open where they are.
 */
export function GapsLine({ projectId, onWrite }: { projectId: string; onWrite?: (text: string) => void }) {
  const { t } = useTranslation();
  const [gaps, setGaps] = useState<ProjectGap[]>([]);
  useEffect(() => {
    let current = true;
    void request<ProjectGap[]>(`/api/projects/${projectId}/gaps`)
      .then((g) => current && setGaps(g))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [projectId]);
  if (!gaps.length) return null;
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 hover:bg-bg-hover hover:text-fg";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-fg-muted">
      <Lightbulb size={13} className="text-warning" aria-hidden="true" />
      {gaps.map((g) => {
        const Icon = ICON[g.kind];
        const label = t(`gaps.${g.kind}${g.missing ? "Missing" : ""}`, { count: g.count ?? 0 });
        const inner = (
          <>
            <Icon size={12} aria-hidden="true" />
            {label}
          </>
        );
        if (g.kind === "cards" || g.kind === "errors")
          return (
            <Link key={g.kind} to={`/p/${projectId}?tab=${g.kind === "cards" ? "board" : "monitor"}`} className={chip}>
              {inner}
            </Link>
          );
        return onWrite ? (
          <button key={g.kind} type="button" onClick={() => onWrite(t(`gaps.${g.kind}Prompt`))} className={chip}>
            {inner}
          </button>
        ) : (
          <span key={g.kind} className={chip}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
