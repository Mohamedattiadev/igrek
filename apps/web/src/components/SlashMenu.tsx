import type { SavedPrompt } from "@godeye/core";
import { BookMarked, SquareSlash } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

export interface SlashItem {
  kind: "command" | "prompt";
  name: string;
  description: string;
  /** Text that replaces the box: "/name " for a command, the prompt's body for a saved prompt. */
  insert: string;
}

/** The "/" list: the project's and user's Claude commands, then saved prompts (plan.md 2.2, 2.7). */
export function useSlashItems(projectId?: string): SlashItem[] {
  const [items, setItems] = useState<SlashItem[]>([]);
  useEffect(() => {
    if (!projectId) return;
    void Promise.all([
      api.slashCommands(projectId).catch(() => []),
      api.prompts().catch(() => [] as SavedPrompt[]),
    ]).then(([commands, prompts]) =>
      setItems([
        ...commands.map((c) => ({
          kind: "command" as const,
          name: c.name,
          description: c.description,
          insert: `/${c.name} `,
        })),
        ...prompts.map((p) => ({
          kind: "prompt" as const,
          name: p.title,
          description: p.body.slice(0, 90),
          insert: p.body,
        })),
      ]),
    );
  }, [projectId]);
  return items;
}

export function filterSlash(items: SlashItem[], text: string): SlashItem[] {
  const m = text.match(/^\/([\w:.-]*)$/);
  if (!m) return [];
  const q = (m[1] ?? "").toLowerCase();
  return items.filter((i) => i.name.toLowerCase().replace(/\s+/g, "-").includes(q)).slice(0, 8);
}

export function SlashMenu({
  items,
  active,
  onPick,
}: {
  items: SlashItem[];
  active: number;
  onPick: (item: SlashItem) => void;
}) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label={t("slash.title")}
      className="mb-1 max-h-72 overflow-auto rounded-ui border border-border bg-bg p-1 shadow-ui"
    >
      {items.map((item, i) => {
        const Icon = item.kind === "command" ? SquareSlash : BookMarked;
        return (
          <button
            key={`${item.kind}-${item.name}`}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            className={cn(
              "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start",
              i === active ? "bg-bg-active" : "hover:bg-bg-hover",
            )}
          >
            <Icon size={14} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12px]">
                {item.kind === "command" ? `/${item.name}` : item.name}
              </span>
              {item.description && (
                <span className="block truncate text-[11px] text-fg-subtle">{item.description}</span>
              )}
            </span>
            <span className="text-[10px] text-fg-subtle">{t(`slash.${item.kind}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
