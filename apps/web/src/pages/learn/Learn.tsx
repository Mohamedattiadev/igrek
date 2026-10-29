import {
  type LatestInfo,
  type LearnHit,
  type LearnState,
  type ProjectTech,
  type RoadmapInfo,
  SHEET_CATEGORIES,
  type SheetInfo,
} from "@igrek/learn";
import { ArrowUpCircle, GraduationCap, Map as MapIcon, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Badge, Card, field, PageHeader, Segmented } from "../../components/ui";
import { cn } from "../../lib/cn";
import { hitLink, learnApi } from "../../lib/learn-api";
import { useProjects } from "../../lib/live";
import { usePersonaLabel, usePersonas } from "../../lib/personas";

const input = cn(field, "w-full");

export interface LearnIndex {
  sheets: SheetInfo[];
  roadmaps: RoadmapInfo[];
  latest: LatestInfo[];
  state: LearnState;
}

/** The hub's data, shared by the pages under /learn. */
export function useLearnIndex(): { index?: LearnIndex; error?: string } {
  const { i18n } = useTranslation();
  const [index, setIndex] = useState<LearnIndex>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    learnApi
      .index(i18n.language)
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, [i18n.language]);
  return { index, error };
}

/** "react/hooks" → where it opens. */
/** Search across every cheatsheet item and roadmap step. */
function LearnSearch({ autoFocus }: { autoFocus?: boolean }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LearnHit[]>([]);
  useEffect(() => {
    if (!query.trim()) return setHits([]);
    let live = true;
    const timer = setTimeout(
      () =>
        void learnApi
          .search(query, i18n.language)
          .then((list) => live && setHits(list))
          .catch(() => live && setHits([])),
      150,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, i18n.language]);
  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search size={15} className="absolute top-2.5 left-3 text-fg-subtle" aria-hidden="true" />
        <input
          // biome-ignore lint/a11y/noAutofocus: the search is the page's main action
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("learn.searchHint")}
          aria-label={t("learn.search")}
          className={cn(input, "ps-9")}
        />
      </label>
      {query.trim() && (
        <Card className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {hits.map((h) => (
            <Link
              key={`${h.kind}:${h.sheet ?? h.roadmap ?? ""}:${h.id}`}
              to={hitLink(h)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{h.title}</span>
                <span className="block truncate font-mono text-[11.5px] text-fg-muted">{h.snippet}</span>
              </span>
              <Badge tone={h.kind === "step" ? "accent" : "neutral"}>
                {h.kind === "step" ? t("learn.step") : h.kind === "sheet" ? t("learn.sheet") : (h.sheet ?? "")}
              </Badge>
            </Link>
          ))}
          {!hits.length && <p className="px-3 py-4 text-center text-xs text-fg-subtle">{t("learn.noHits")}</p>}
        </Card>
      )}
    </div>
  );
}

function SheetCard({ s, tech, latest }: { s: SheetInfo; tech?: ProjectTech; latest?: LatestInfo }) {
  const { t } = useTranslation();
  return (
    <Link to={`/learn/s/${s.id}`} className="block">
      <Card className="h-full space-y-1 p-pad transition-colors hover:border-accent">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{s.title}</p>
          {s.version && <span className="text-[11px] text-fg-subtle">{s.version}</span>}
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{s.summary}</p>
        <div className="flex flex-wrap gap-1 pt-1">
          {tech && (
            <Badge tone="accent">
              {tech.version ? t("learn.inProjectV", { v: tech.version }) : t("learn.inProject")}
            </Badge>
          )}
          {latest?.behind && (
            <Badge tone="warning">
              <ArrowUpCircle size={11} className="me-1" aria-hidden="true" />
              {t("learn.newer", { v: latest.latest })}
            </Badge>
          )}
          <span className="ms-auto text-[11px] text-fg-subtle">{t("learn.items", { count: s.items })}</span>
        </div>
      </Card>
    </Link>
  );
}

function RoadmapCard({ r, done }: { r: RoadmapInfo; done: number }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  return (
    <Link to={`/learn/r/${r.id}`} className="block">
      <Card className="h-full space-y-1.5 p-pad transition-colors hover:border-accent">
        <div className="flex items-center gap-2">
          <MapIcon size={14} className="text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{r.title}</p>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{r.summary}</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
          <div className="h-full bg-success" style={{ width: `${(done / r.steps) * 100}%` }} />
        </div>
        <p className="flex flex-wrap gap-x-2 text-[11px] text-fg-subtle">
          <span>{t("learn.progress", { done, total: r.steps })}</span>
          <span>{t("learn.hours", { count: Math.max(1, Math.round(r.minutes / 60)) })}</span>
          <span>
            {t("learn.teacher", {
              name: label(
                personas.find((p) => p.id === r.teacher),
                r.teacher,
              ).name,
            })}
          </span>
        </p>
      </Card>
    </Link>
  );
}

/** Learning center (plan.md Faz 14): cheatsheets and roadmaps, searchable, tied to your projects. */
export function LearnPage() {
  const { t } = useTranslation();
  const { index, error } = useLearnIndex();
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "roadmaps" ? "roadmaps" : "sheets";
  const projectId = params.get("project") ?? "";
  const [techs, setTechs] = useState<ProjectTech[]>([]);
  useEffect(() => {
    if (!projectId) return setTechs([]);
    void learnApi
      .techs(projectId)
      .then(setTechs)
      .catch(() => setTechs([]));
  }, [projectId]);
  const latest = useMemo(() => new Map(index?.latest.map((l) => [l.sheet, l])), [index]);
  const techOf = useMemo(() => new Map(techs.map((x) => [x.id, x])), [techs]);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };
  const favorites = index?.state.favorites ?? [];
  return (
    <>
      <PageHeader title={t("learn.title")} />
      <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <GraduationCap size={17} className="text-accent" aria-hidden="true" />
            {t("learn.heading")}
          </h2>
          <p className="text-[13px] text-fg-muted">{t("learn.intro")}</p>
        </div>
        <LearnSearch autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={(v) => set({ view: v === "sheets" ? "" : v })}
            label={t("learn.title")}
            options={[
              { value: "sheets", label: t("learn.sheets") },
              { value: "roadmaps", label: t("learn.roadmaps") },
            ]}
          />
          <div className="flex-1" />
          {view === "sheets" && (
            <select
              value={projectId}
              onChange={(e) => set({ project: e.target.value })}
              aria-label={t("learn.forProject")}
              className={cn(field, "max-w-[260px]")}
            >
              <option value="">{t("learn.forProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {index && view === "sheets" && (
          <div className="space-y-6">
            {techs.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[13px] font-semibold">{t("learn.projectSheets")}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {index.sheets
                    .filter((s) => techOf.has(s.id))
                    .map((s) => (
                      <SheetCard key={s.id} s={s} tech={techOf.get(s.id)} latest={latest.get(s.id)} />
                    ))}
                </div>
              </section>
            )}
            {favorites.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Star size={13} className="fill-warning text-warning" aria-hidden="true" />
                  {t("learn.favorites")}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {favorites.map((key) => {
                    const [sheet, item] = key.split("/");
                    return (
                      <Link
                        key={key}
                        to={`/learn/s/${sheet}#${item}`}
                        className="rounded-ui border border-border px-2 py-1 font-mono text-[12px] hover:border-accent"
                      >
                        {key}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
            {SHEET_CATEGORIES.map((cat) => {
              const list = index.sheets.filter((s) => s.category === cat && !techOf.has(s.id));
              return list.length ? (
                <section key={cat} className="space-y-2">
                  <h3 className="text-[13px] font-semibold">{t(`learn.cat_${cat}`)}</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((s) => (
                      <SheetCard key={s.id} s={s} latest={latest.get(s.id)} />
                    ))}
                  </div>
                </section>
              ) : null;
            })}
          </div>
        )}
        {index && view === "roadmaps" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {index.roadmaps.map((r) => (
              <RoadmapCard key={r.id} r={r} done={index.state.done.filter((d) => d.startsWith(`${r.id}/`)).length} />
            ))}
            {!index.roadmaps.length && <p className="text-xs text-fg-subtle">{t("learn.noRoadmaps")}</p>}
          </div>
        )}
      </div>
    </>
  );
}
