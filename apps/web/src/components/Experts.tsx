import type { ChatEvent, Persona, PersonaGroup } from "@igrek/core";
import { ChevronDown, ChevronRight, UsersRound, XCircle } from "lucide-react";
import { type KeyboardEvent, type RefObject, type SyntheticEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { filterMentions, insertMention, type MentionItem, mentionQuery } from "../lib/mention";
import { PersonaIcon, usePersonaLabel, usePersonas } from "../lib/personas";
import { Markdown } from "./Markdown";
import { Button, Dialog } from "./ui";

type ToolEvent = Extract<ChatEvent, { kind: "tool" }>;

const GROUPS: PersonaGroup[] = ["engineering", "leadership", "research", "testing"];

/** The answer without the "<name> answered:" line the MCP tool puts first for the model. */
function answerText(result: string | undefined): string {
  return (result ?? "").replace(/^[^\n]*answered:\n+/, "").trim();
}

/** A chat asked an expert persona in the background: who, what, and the answer (folded). */
export function ExpertCard({ event }: { event: ToolEvent }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const input = (event.input ?? {}) as { expert?: string; question?: string };
  const persona = personas.find((p) => p.id === input.expert);
  const name = label(persona, input.expert).name;
  const [open, setOpen] = useState(false);
  const running = event.status === "running";
  const failed = event.status === "error";
  return (
    <div className="rounded-2xl border border-border bg-bg-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-start"
      >
        <PersonaIcon persona={persona} size={12} className="size-6 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium">
            {running
              ? t("chat.expertAsking", { name })
              : failed
                ? t("chat.expertFailed", { name })
                : t("chat.expertAsked", { name })}
          </span>
          {input.question && <span className="block truncate text-[11.5px] text-fg-muted">{input.question}</span>}
        </span>
        {running ? (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
        ) : failed ? (
          <XCircle size={13} className="shrink-0 text-danger" aria-hidden="true" />
        ) : open ? (
          <ChevronDown size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden="true" />
        )}
      </button>
      {open && !running && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          {input.question && (
            <p className="text-[12px] text-fg-muted">
              <span className="font-medium text-fg">{t("chat.expertQuestion")}:</span> {input.question}
            </p>
          )}
          <Markdown text={answerText(event.result)} className="prose-igrek prose-chat text-[13px]" />
        </div>
      )}
    </div>
  );
}

/** Composer button: pick experts to bring in; the chat consults each one it is given as @id. */
export function ExpertPicker({ onPick }: { onPick: (mention: string) => void }) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [open, setOpen] = useState(false);
  const pick = (persona: Persona) => {
    onPick(`@${persona.id}`);
    setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="ghost" icon={UsersRound} onClick={() => setOpen(true)} data-tip={t("chat.expertsTip")}>
        {t("chat.experts")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("chat.experts")}>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          <div>
            <h2 className="text-[15px] font-semibold">{t("chat.experts")}</h2>
            <p className="mt-1 text-[12.5px] text-fg-muted">{t("chat.expertsHint")}</p>
          </div>
          {GROUPS.map((group) => {
            const members = personas.filter((p) => p.group === group);
            if (!members.length) return null;
            return (
              <section key={group}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                  {t(`persona.group_${group}`)}
                </h3>
                <div className="grid gap-1 sm:grid-cols-2">
                  {members.map((persona) => {
                    const { name, role } = label(persona);
                    return (
                      <button
                        key={persona.id}
                        type="button"
                        onClick={() => pick(persona)}
                        className="flex items-center gap-2.5 rounded-ui px-2 py-1.5 text-start hover:bg-bg-hover"
                      >
                        <PersonaIcon persona={persona} size={12} className="size-7 rounded-full" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{name}</span>
                          {role && <span className="block truncate text-[11.5px] text-fg-muted">{role}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}

/**
 * The "@" list in the composer: typing "@" after a space opens it, the word after it narrows it,
 * arrows move, Enter or Tab puts "@<id> " in the text, Escape closes it. Works like the "/" list.
 */
export function useExpertMentions(
  text: string,
  setText: (text: string) => void,
  input: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
) {
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Escape closes the list for the "@" it was opened for; a new "@" opens it again.
  const [closedAt, setClosedAt] = useState<number>();
  const at = enabled ? mentionQuery(text, caret) : undefined;
  const items =
    at && closedAt !== at.start
      ? filterMentions(
          personas.map((p) => ({ id: p.id, ...label(p) })),
          at.query,
        )
      : [];
  const current = Math.min(active, Math.max(0, items.length - 1));
  const track = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const next = e.currentTarget.selectionStart;
    setCaret(next);
    if (!mentionQuery(e.currentTarget.value, next)) setClosedAt(undefined);
  };
  const pick = (item: MentionItem) => {
    if (!at) return;
    const next = insertMention(text, { start: at.start, caret }, item.id);
    setText(next.text);
    setCaret(next.caret);
    setActive(0);
    // The box gets the new value on the next render; put the caret after the mention then.
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  /** True when the key belonged to the list, so the composer does nothing else with it. */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!items.length || !at) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      const item = items[current];
      if (item) pick(item);
    } else if (e.key === "Escape") {
      setClosedAt(at.start);
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  };
  return { items, active: current, pick, track, onKeyDown };
}

/** The list itself, shown above the composer. */
export function MentionMenu({
  items,
  active,
  onPick,
}: {
  items: MentionItem[];
  active: number;
  onPick: (item: MentionItem) => void;
}) {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  if (!items.length) return null;
  return (
    <div
      role="listbox"
      aria-label={t("chat.mentionTitle")}
      className="mb-1 max-h-72 overflow-auto rounded-ui border border-border bg-bg p-1 shadow-ui"
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start",
            i === active ? "bg-bg-active" : "hover:bg-bg-hover",
          )}
        >
          <PersonaIcon persona={personas.find((p) => p.id === item.id)} size={12} className="size-6 rounded-full" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium">{item.name}</span>
            {item.role && <span className="block truncate text-[11px] text-fg-subtle">{item.role}</span>}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-fg-subtle">@{item.id}</span>
        </button>
      ))}
    </div>
  );
}
