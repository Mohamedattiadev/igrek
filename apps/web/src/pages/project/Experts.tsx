import type { ExpertView, Persona, PersonaGroup, ProjectDetail } from "@igrek/core";
import { ChevronDown, MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Markdown } from "../../components/Markdown";
import { Button } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { PersonaIcon, startPersonaChat, usePersonaLabel, usePersonas } from "../../lib/personas";

/** The experts most projects want a word from first; the rest are one click away. */
const FIRST = ["architect", "uiux", "security", "database", "qa", "performance", "devops", "product-manager"];
const GROUPS: PersonaGroup[] = ["engineering", "leadership", "research", "testing"];

function ExpertCard({
  persona,
  view,
  projectId,
  onView,
}: {
  persona: Persona;
  view?: ExpertView;
  projectId: string;
  onView: (view: ExpertView) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = usePersonaLabel();
  const { name, role } = label(persona);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  const look = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onView(await api.refreshExpertView(projectId, persona.id));
      setOpen(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-bg-subtle p-4">
      <header className="flex items-start gap-3">
        <PersonaIcon persona={persona} size={15} className="size-9 rounded-full" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold">{name}</h3>
          {role && <p className="truncate text-[12px] text-fg-muted">{role}</p>}
        </div>
        {view && <span className="shrink-0 text-[11px] text-fg-subtle">{relativeTime(view.at)}</span>}
      </header>
      <div className="mt-3 min-h-0 flex-1">
        {busy ? (
          <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {t("experts.reading", { name })}
          </p>
        ) : view ? (
          <div className={cn("relative", !open && "max-h-40 overflow-hidden")}>
            <Markdown text={view.text} className="prose-igrek prose-chat text-[13px]" />
            {!open && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg-subtle" />
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-fg-muted">{t("experts.noView", { name })}</p>
        )}
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </div>
      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {view && !busy && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? t("experts.less") : t("experts.more")}
          </Button>
        )}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          icon={MessageSquare}
          onClick={() => void startPersonaChat(persona.id, projectId, navigate)}
        >
          {t("experts.chat")}
        </Button>
        <Button
          size="sm"
          variant={view ? "secondary" : "primary"}
          icon={view ? RefreshCw : Sparkles}
          onClick={look}
          disabled={busy}
        >
          {view ? t("experts.refresh") : t("experts.look")}
        </Button>
      </footer>
    </article>
  );
}

/** Every expert persona's view of this project, each from its own field (plan.md 6). */
export function ExpertsTab({ project }: { project: ProjectDetail }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const [views, setViews] = useState<ExpertView[]>([]);
  const [all, setAll] = useState(false);
  useEffect(() => {
    // Another project opened before the answer came: drop the old answer.
    let current = true;
    api
      .projectExperts(project.id)
      .then((list) => current && setViews(list))
      .catch(() => current && setViews([]));
    return () => {
      current = false;
    };
  }, [project.id]);
  const viewOf = (id: string) => views.find((v) => v.personaId === id);
  const onView = (view: ExpertView) =>
    setViews((list) => [...list.filter((v) => v.personaId !== view.personaId), view]);
  // Experts who already looked come first, then the usual first round.
  const first = personas
    .filter((p) => viewOf(p.id) || FIRST.includes(p.id))
    .sort((a, b) => Number(!!viewOf(b.id)) - Number(!!viewOf(a.id)) || FIRST.indexOf(a.id) - FIRST.indexOf(b.id));
  const rest = personas.filter((p) => !first.includes(p));
  const card = (persona: Persona) => (
    <ExpertCard key={persona.id} persona={persona} view={viewOf(persona.id)} projectId={project.id} onView={onView} />
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold">{t("experts.title")}</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-fg-muted">{t("experts.intro")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{first.map(card)}</div>
      {rest.length > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            className="flex items-center gap-1.5 text-[13px] font-medium text-fg-muted hover:text-fg"
          >
            <ChevronDown size={14} className={cn("transition-transform", all && "rotate-180")} aria-hidden="true" />
            {all ? t("experts.hideOthers") : t("experts.showOthers", { count: rest.length })}
          </button>
          {all &&
            GROUPS.map((group) => {
              const members = rest.filter((p) => p.group === group);
              return members.length ? (
                <section key={group} className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                    {t(`persona.group_${group}`)}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{members.map(card)}</div>
                </section>
              ) : null;
            })}
        </div>
      )}
    </div>
  );
}
