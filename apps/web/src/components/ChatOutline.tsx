import type { ChatEvent } from "@igrek/core";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";

/** At most this many marks on the strip; a longer chat shows its latest messages. */
const MAX_MARKS = 40;

/** Where a user message is in the list: its element's id. */
export const messageId = (eventId: string) => `msg-${eventId}`;

/**
 * Beside a long chat: one mark per message the user wrote, and on hover their first words, to jump to
 * any of them (as in DeepSeek's chat), plus "to the top" and "to the bottom".
 */
export function ChatOutline({ events, list }: { events: ChatEvent[]; list: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const asks = events.filter((e): e is Extract<ChatEvent, { kind: "user" }> => e.kind === "user").slice(-MAX_MARKS);
  const jump = (id: string) =>
    document.getElementById(messageId(id))?.scrollIntoView({ block: "start", behavior: "smooth" });
  const edge = (where: "top" | "bottom") =>
    list.current?.scrollTo({ top: where === "top" ? 0 : list.current.scrollHeight, behavior: "smooth" });
  const button = "flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-hover hover:text-fg";
  return (
    // Clipped to the chat: an absolutely placed strip taller than the chat stretched the page around it
    // and gave it a second scrollbar.
    <div className="pointer-events-none absolute inset-y-0 end-1 hidden flex-col items-end justify-center gap-1 overflow-hidden py-4 md:flex">
      <button
        type="button"
        onClick={() => edge("top")}
        aria-label={t("chat.toTop")}
        data-tip={t("chat.toTop")}
        className={cn(button, "pointer-events-auto")}
      >
        <ArrowUpToLine size={14} aria-hidden="true" />
      </button>
      {asks.length > 1 && (
        <nav
          aria-label={t("chat.outline")}
          className="pointer-events-auto relative flex min-h-0 flex-col items-end"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
        >
          {open ? (
            <ul className="ge-pop-in max-h-full w-64 origin-right overflow-y-auto rounded-ui border border-border bg-bg p-1 shadow-ui">
              {asks.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => jump(e.id)}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-start text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
                  >
                    {e.text.trim().replace(/\s+/g, " ") || t("chat.image")}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex min-h-0 flex-col items-end gap-1.5 overflow-hidden px-1 py-2">
              {asks.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => jump(e.id)}
                    aria-label={e.text.slice(0, 80)}
                    className="block h-0.5 w-3 rounded-full bg-accent/50 transition-all duration-150 hover:w-5 hover:bg-accent"
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
      <button
        type="button"
        onClick={() => edge("bottom")}
        aria-label={t("chat.toBottom")}
        data-tip={t("chat.toBottom")}
        className={cn(button, "pointer-events-auto")}
      >
        <ArrowDownToLine size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
