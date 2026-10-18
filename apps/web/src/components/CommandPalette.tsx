import type { AskAnswer, ProjectListItem, SearchHit } from "@godeye/core";
import type { LearnHit } from "@godeye/learn";
import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Compass,
  Contrast,
  FolderKanban,
  Map as MapIcon,
  Maximize2,
  MessageSquare,
  Rows3,
  Sparkles,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { hitLink, learnApi } from "../lib/learn-api";
import { showKeys, usePageActionList } from "../lib/page-actions";
import { useSettings } from "../lib/settings";
import { startTour } from "../lib/tour";
import { toggleZen } from "../lib/zen";
import { NAV_ITEMS } from "./nav";
import { Kbd } from "./ui";

const GROUP = "px-1 text-[11px] text-fg-subtle [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:py-1.5";

/** Renders FTS snippets, where matches come wrapped in [[ ]]. */
function Snippet({ text }: { text: string }) {
  let offset = 0;
  return (
    <>
      {text.split(/(\[\[.*?\]\])/).map((part) => {
        const key = offset;
        offset += part.length;
        return part.startsWith("[[") ? (
          <mark key={key} className="rounded-sm bg-accent-soft px-0.5 text-accent">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <Fragment key={key}>{part}</Fragment>
        );
      })}
    </>
  );
}

function Item({
  icon: Icon,
  label,
  onSelect,
  keywords,
  value,
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  keywords?: string[];
  value?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      value={value}
      keywords={keywords}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-muted data-[selected=true]:bg-bg-hover data-[selected=true]:text-fg"
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [learnHits, setLearnHits] = useState<LearnHit[]>([]);
  const [answer, setAnswer] = useState<AskAnswer | "loading">();

  const ask = async (question: string) => {
    setAnswer("loading");
    try {
      setAnswer(await api.ask(question));
    } catch {
      setAnswer({ answer: "", sources: [] });
    }
  };

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAnswer(undefined);
    api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLearnHits([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .search(q)
        .then(setHits)
        .catch(() => setHits([]));
      learnApi
        .search(q, i18n.language)
        .then((list) => setLearnHits(list.slice(0, 5)))
        .catch(() => setLearnHits([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [query, i18n.language]);

  // ">" at the start: only actions, like VS Code's command mode.
  const actionMode = query.trimStart().startsWith(">");
  const actionQuery = query.trimStart().slice(1).trim().toLowerCase();
  const shown = (label: string) => !actionMode || label.toLowerCase().includes(actionQuery);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={!actionMode}
      label={t("palette.placeholder")}
      overlayClassName="fixed inset-0 bg-black/25"
      contentClassName="fixed left-1/2 top-[15vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg text-fg shadow-ui"
    >
      <div className="flex items-center border-b border-border px-4">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t("palette.placeholder")}
          className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle"
        />
        <Kbd>Esc</Kbd>
      </div>
      {answer && (
        <div className="max-h-56 overflow-y-auto border-b border-border bg-bg-subtle px-4 py-3 text-[13px] leading-relaxed">
          {answer === "loading" ? (
            <p className="animate-pulse text-fg-muted">{t("ask.thinking")}</p>
          ) : (
            <>
              <p>{answer.answer || t("ask.noAnswer")}</p>
              {answer.sources.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                  {t("ask.sources")}:
                  {answer.sources.slice(0, 6).map((source, i) => (
                    <button
                      key={source.messageId}
                      type="button"
                      onClick={() => run(() => navigate(`/p/${source.projectId}/s/${source.sessionId}`))}
                      className="hover:text-accent"
                    >
                      [{i + 1}] {source.sessionTitle.slice(0, 30)}
                    </button>
                  ))}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
        <Command.Empty className="py-8 text-center text-[13px] text-fg-subtle">{t("palette.empty")}</Command.Empty>
        <PageActionGroup shown={shown} run={run} />
        {!actionMode && query.trim().length >= 4 && (
          <Command.Group heading={t("ask.action")} className={GROUP}>
            <Item
              icon={Sparkles}
              label={`${t("ask.action")}: “${query.trim()}”`}
              value={`ask ${query}`}
              keywords={[query]}
              onSelect={() => ask(query.trim())}
            />
          </Command.Group>
        )}
        {!actionMode && (
          <Command.Group heading={t("palette.goTo")} className={GROUP}>
            {NAV_ITEMS.map((item) => (
              <Item
                key={item.to}
                icon={item.icon}
                label={t(item.label)}
                onSelect={() => run(() => navigate(item.to))}
              />
            ))}
            <Item icon={BookOpen} label={t("guide.title")} onSelect={() => run(() => navigate("/guide"))} />
          </Command.Group>
        )}
        {!actionMode && projects.length > 0 && (
          <Command.Group heading={t("nav.projects")} className={GROUP}>
            {projects
              .filter((p) => !p.hidden)
              .map((project) => (
                <Item
                  key={project.id}
                  icon={FolderKanban}
                  label={project.name}
                  keywords={[project.path]}
                  onSelect={() => run(() => navigate(`/p/${project.id}`))}
                />
              ))}
          </Command.Group>
        )}
        {!actionMode && hits.length > 0 && (
          <Command.Group heading={t("search.results")} className={GROUP}>
            {hits.map((hit) => (
              <Command.Item
                key={hit.messageId}
                value={`hit-${hit.messageId}`}
                keywords={[query]}
                onSelect={() => run(() => navigate(`/p/${hit.projectId}/s/${hit.sessionId}`))}
                className="flex cursor-default gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-fg-muted data-[selected=true]:bg-bg-hover data-[selected=true]:text-fg"
              >
                <MessageSquare size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-xs text-fg-subtle">
                    {hit.projectName} · {hit.sessionTitle} · {relativeTime(hit.ts)}
                  </p>
                  <p className="line-clamp-2 text-[13px]">
                    <Snippet text={hit.snippet} />
                  </p>
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!actionMode && learnHits.length > 0 && (
          <Command.Group heading={t("nav.learn")} className={GROUP}>
            {learnHits.map((h) => (
              <Item
                key={`${h.kind}:${h.sheet ?? h.roadmap ?? ""}:${h.id}`}
                icon={h.kind === "step" ? MapIcon : BookOpen}
                label={`${h.title} · ${h.kind === "item" ? h.sheet : h.snippet}`}
                value={`learn-${h.kind}-${h.sheet ?? h.roadmap ?? ""}-${h.id}`}
                keywords={[query]}
                onSelect={() => run(() => navigate(hitLink(h)))}
              />
            ))}
          </Command.Group>
        )}
        <ActionGroup shown={shown} run={run} />
      </Command.List>
    </Command.Dialog>
  );
}

type GroupProps = { shown: (label: string) => boolean; run: (action: () => void) => void };

/** What the page in front can do, with its shortcut (plan.md 16.4). */
function PageActionGroup({ shown, run }: GroupProps) {
  const { t } = useTranslation();
  const list = usePageActionList().filter((a) => shown(a.label));
  if (!list.length) return null;
  return (
    <Command.Group heading={t("palette.thisPage")} className={GROUP}>
      {list.map((a) => (
        <Item
          key={a.id}
          icon={a.icon}
          label={a.keys ? `${a.label} (${showKeys(a.keys)})` : a.label}
          onSelect={() => run(a.run)}
        />
      ))}
    </Command.Group>
  );
}

/** Actions that work anywhere: theme, zen, tour, density. */
function ActionGroup({ shown, run }: GroupProps) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  return (
    <Command.Group heading={t("palette.actions")} className={GROUP}>
      {shown(t("palette.toggleTheme")) && (
        <Item
          icon={Contrast}
          label={t("palette.toggleTheme")}
          onSelect={() =>
            run(() => {
              const dark = document.documentElement.dataset.theme === "dark";
              void update({ theme: dark ? "light" : "dark" });
            })
          }
        />
      )}
      {shown(t("zen.toggle")) && <Item icon={Maximize2} label={t("zen.toggle")} onSelect={() => run(toggleZen)} />}
      {shown(t("tour.start")) && <Item icon={Compass} label={t("tour.start")} onSelect={() => run(startTour)} />}
      {shown(t("palette.toggleDensity")) && (
        <Item
          icon={Rows3}
          label={t("palette.toggleDensity")}
          onSelect={() =>
            run(() => void update({ density: settings.density === "compact" ? "comfortable" : "compact" }))
          }
        />
      )}
    </Command.Group>
  );
}
