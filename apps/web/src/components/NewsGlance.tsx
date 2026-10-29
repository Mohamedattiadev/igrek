import type { KnowledgeOverview } from "@igrek/core";
import { ArrowRight, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { Panel } from "./ui";

/**
 * The most important of the experts' reading (the Gündem page) on the first screen: a user saw that
 * page for the first time after weeks, and said it mattered. Three items, and what touches a project.
 */
export function NewsGlance() {
  const { t } = useTranslation();
  const [data, setData] = useState<KnowledgeOverview>();
  useEffect(() => {
    let current = true;
    void api
      .knowledge()
      .then((d) => current && setData(d))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const top = [...(data?.items ?? [])].sort((a, b) => b.importance - a.importance).slice(0, 3);
  const touching = data?.updates.length ?? 0;
  if (!top.length && !touching) return null;
  return (
    <Panel
      icon={Newspaper}
      title={t("newsGlance.title")}
      action={
        <Link
          to="/knowledge"
          className="inline-flex items-center gap-1 text-[12px] font-normal text-accent hover:underline"
        >
          {t("newsGlance.all")} <ArrowRight size={12} className="rtl:rotate-180" aria-hidden="true" />
        </Link>
      }
    >
      {touching > 0 && (
        <Link to="/knowledge" className="block text-[12.5px] text-warning hover:underline">
          {t("newsGlance.touching", { count: touching })}
        </Link>
      )}
      <ul className="space-y-1.5">
        {top.map((n) => (
          <li key={n.id} className="text-[12.5px]">
            <a href={n.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium hover:text-accent">
              {n.title}
            </a>
            <span className="text-[11px] text-fg-subtle">{n.source}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
