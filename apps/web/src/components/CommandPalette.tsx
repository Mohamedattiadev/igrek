import type { ProjectListItem, SearchHit } from "@godeye/core";
import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import { Contrast, FolderKanban, MessageSquare, Rows3 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useSettings } from "../lib/settings";
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
}: {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  keywords?: string[];
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-muted data-[selected=true]:bg-bg-hover data-[selected=true]:text-fg"
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    api
      .projects()
      .then(setProjects)
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .search(q)
        .then(setHits)
        .catch(() => setHits([]));
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
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
      <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
        <Command.Empty className="py-8 text-center text-[13px] text-fg-subtle">{t("palette.empty")}</Command.Empty>
        {projects.length > 0 && (
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
        {hits.length > 0 && (
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
        <Command.Group heading={t("palette.goTo")} className={GROUP}>
          {NAV_ITEMS.map((item) => (
            <Item key={item.to} icon={item.icon} label={t(item.label)} onSelect={() => run(() => navigate(item.to))} />
          ))}
        </Command.Group>
        <Command.Group heading={t("palette.actions")} className={GROUP}>
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
          <Item
            icon={Rows3}
            label={t("palette.toggleDensity")}
            onSelect={() =>
              run(() => void update({ density: settings.density === "compact" ? "comfortable" : "compact" }))
            }
          />
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
