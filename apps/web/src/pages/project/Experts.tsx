import {
  CORE_EXPERTS,
  type ExpertsState,
  type ExpertView,
  type Persona,
  type PersonaGroup,
  type ProjectDetail,
  viewSummary,
} from "@igrek/core";
import { ChevronDown, MessageSquare, MessageSquarePlus, RefreshCw, ScanSearch, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Markdown } from "../../components/Markdown";
import { Button, Dialog } from "../../components/ui";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useServerEvent } from "../../lib/live";
import { PersonaIcon, startPersonaChat, usePersonaLabel, usePersonas } from "../../lib/personas";

const GROUPS: PersonaGroup[] = ["engineering", "leadership", "research", "testing"];
const EMPTY: ExpertsState = { views: [], running: [], errors: {} };

/** A new chat in the project with this text waiting in the box (nothing is sent yet). */
async function chatWith(projectId: string, draft: string, navigate: (to: string) => void): Promise<void> {
  const chat = await api.startChat({ projectId });
  navigate(`/c/${chat.id}?draft=${encodeURIComponent(draft)}`);
}

function ExpertCard({
  persona,
  view,
  running,
  error,
  projectId,
  onLook,
}: {
  persona: Persona;
  view?: ExpertView;
  running: boolean;
  error?: string;
  projectId: string;
  onLook: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const label = usePersonaLabel();
  const { name, role } = label(persona);
  const [open, setOpen] = useState(false);
  const parts = view ? viewSummary(view.text) : undefined;
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
      <div className="mt-3 min-h-0 flex-1 space-y-2">
        {running && (
          <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {t(view ? "experts.rereading" : "experts.reading", { name })}
          </p>
        )}
        {parts?.summary && <p className="text-[13.5px] font-medium leading-snug">{parts.summary}</p>}
        {parts ? (
          <div className={cn("relative", !open && "max-h-28 overflow-hidden")}>
            <Markdown text={parts.rest} className="prose-igrek prose-chat text-[13px]" />
            {!open && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg-subtle" />
            )}
          </div>
        ) : (
          !running && <p className="text-[12.5px] text-fg-muted">{t("experts.noView", { name })}</p>
        )}
        {error && !running && <p className="text-[12px] text-danger">{t("experts.failed", { error })}</p>}
      </div>
      <footer className="mt-3 flex flex-wrap items-center gap-1.5">
        {view && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? t("experts.less") : t("experts.more")}
          </Button>
        )}
        <span className="flex-1" />
        {view && (
          <Button
            size="sm"
            variant="ghost"
            icon={MessageSquarePlus}
            data-tip={t("experts.useTip")}
            onClick={() =>
              void chatWith(projectId, t("experts.useDraft", { name, view: view.text }), (to) => void navigate(to))
            }
          >
            {t("experts.use")}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={MessageSquare}
          data-tip={view ? t("experts.discussTip", { name }) : undefined}
          onClick={() => void startPersonaChat(persona.id, projectId, navigate)}
        >
          {view ? t("experts.discuss") : t("experts.chat")}
        </Button>
        <Button
          usesModel
          size="sm"
          variant={view ? "secondary" : "primary"}
          icon={view ? RefreshCw : ScanSearch}
          onClick={onLook}
          disabled={running}
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
  const navigate = useNavigate();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [state, setState] = useState<ExpertsState>(EMPTY);
  const [all, setAll] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    // Another project opened before the answer came: drop the old answer.
    let current = true;
    api
      .projectExperts(project.id)
      .then((next) => current && setState(next))
      .catch(() => current && setState(EMPTY));
    return () => {
      current = false;
    };
  }, [project.id]);
  useEffect(load, [load]);
  // Views are written on the server; this page may have been left and opened again meanwhile.
  useServerEvent("experts-changed", (message) => {
    if (message.projectId === project.id) load();
  });
  const start = (ids?: string[]) => {
    setError(undefined);
    (ids?.length === 1 ? api.refreshExpertView(project.id, ids[0] ?? "") : api.askAllExperts(project.id, ids))
      .then(setState)
      .catch((err: Error) => setError(err.message));
  };
  const viewOf = (id: string) => state.views.find((v) => v.personaId === id);
  // Experts who already looked (or are looking) come first, then the core panel.
  const shown = (p: Persona) => !!viewOf(p.id) || state.running.includes(p.id) || CORE_EXPERTS.includes(p.id);
  const first = personas
    .filter(shown)
    .sort(
      (a, b) =>
        Number(!!viewOf(b.id)) - Number(!!viewOf(a.id)) || CORE_EXPERTS.indexOf(a.id) - CORE_EXPERTS.indexOf(b.id),
    );
  const rest = personas.filter((p) => !first.includes(p));
  const waiting = (id: string) => !viewOf(id) && !state.running.includes(id);
  // The core panel by default; every expert when asked for (a user expected "all" to mean all of them).
  const missing = CORE_EXPERTS.filter(waiting);
  const missingAll = personas.map((p) => p.id).filter(waiting);
  const toChat = () => {
    const views = state.views
      .map(
        (v) =>
          `## ${
            label(
              personas.find((p) => p.id === v.personaId),
              v.personaId,
            ).name
          }\n\n${v.text}`,
      )
      .join("\n\n");
    void chatWith(project.id, t("experts.useAllDraft", { views }), (to) => void navigate(to));
  };
  const card = (persona: Persona) => (
    <ExpertCard
      key={persona.id}
      persona={persona}
      view={viewOf(persona.id)}
      running={state.running.includes(persona.id)}
      error={state.errors[persona.id]}
      projectId={project.id}
      onLook={() => start([persona.id])}
    />
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{t("experts.title")}</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-fg-muted">{t("experts.intro")}</p>
        </div>
        {state.views.length > 0 && (
          <Button icon={MessageSquarePlus} onClick={toChat} data-tip={t("experts.useAllTip")}>
            {t("experts.useAll")}
          </Button>
        )}
        <Button
          usesModel
          variant="primary"
          icon={UsersRound}
          disabled={missingAll.length === 0}
          onClick={() => setConfirm(true)}
          data-tip={t("experts.askAllTip")}
        >
          {t("experts.askAll")}
        </Button>
      </div>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
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
      <Dialog open={confirm} onClose={() => setConfirm(false)} label={t("experts.askAll")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("experts.askAll")}</h2>
          <p className="text-[13px] text-fg-muted">{t("experts.askWhich")}</p>
          {missing.length > 0 && (
            <p className="text-[12.5px]">
              <span className="font-medium">{t("experts.coreTeam", { count: missing.length })}: </span>
              {missing
                .map(
                  (id) =>
                    label(
                      personas.find((p) => p.id === id),
                      id,
                    ).name,
                )
                .join(", ")}
            </p>
          )}
          <p className="text-[12px] text-fg-subtle">{t("experts.askCost")}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("persona.cancel")}
            </Button>
            {missing.length > 0 && (
              <Button
                usesModel
                icon={UsersRound}
                onClick={() => {
                  setConfirm(false);
                  start(missing);
                }}
              >
                {t("experts.askCore", { count: missing.length })}
              </Button>
            )}
            <Button
              usesModel
              variant="primary"
              icon={UsersRound}
              onClick={() => {
                setConfirm(false);
                start(missingAll);
              }}
            >
              {t("experts.askEvery", { count: missingAll.length })}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
