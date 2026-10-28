import { CHAT_REACTIONS, type ChatMessage, type ChatReaction, type TeamMember } from "@igrek/core";
import { SmilePlus, SquareCheckBig } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { REACTION_ICONS as ICONS } from "./reaction-icons";

const react = (message: ChatMessage, reaction: ChatReaction) =>
  void api.reactToMessage(message.id, reaction).catch(() => undefined);

/**
 * The reactions on a message, like WhatsApp's: one small pill sitting on the message's lower edge,
 * an icon per kind (a count when more than one gave it), mine stand out, a tap takes mine back.
 */
export function ReactionChips({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  if (!message.reactions.length) return null;
  return (
    <div className="relative z-10 -mb-3 mt-0.5 inline-flex items-center gap-0.5 rounded-full border border-border bg-bg p-0.5 shadow-ui">
      {message.reactions.map((r) => {
        const { icon: Icon, tone } = ICONS[r.reaction];
        const label = `${t(`teamChat.reaction_${r.reaction}`)}: ${r.names.join(", ")}`;
        return (
          <button
            key={r.reaction}
            type="button"
            onClick={() => react(message, r.reaction)}
            aria-pressed={r.mine}
            aria-label={label}
            data-tip={label}
            className={cn(
              "inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11.5px] tabular-nums hover:bg-bg-hover",
              r.mine && "bg-accent-soft",
            )}
          >
            <Icon size={13} className={tone} aria-hidden="true" />
            {r.count > 1 && r.count}
          </button>
        );
      })}
    </div>
  );
}

/** The button over a message that opens the six reactions to pick from. */
export function ReactionPicker({ message, className }: { message: ChatMessage; className: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={className}
        aria-expanded={open}
        data-tip={t("teamChat.react")}
        aria-label={t("teamChat.react")}
      >
        <SmilePlus size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute end-0 bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-border bg-bg p-1 shadow-ui"
        >
          {CHAT_REACTIONS.map((r) => {
            const { icon: Icon, tone } = ICONS[r];
            const mine = message.reactions.some((g) => g.reaction === r && g.mine);
            return (
              <button
                key={r}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  react(message, r);
                }}
                aria-label={t(`teamChat.reaction_${r}`)}
                data-tip={t(`teamChat.reaction_${r}`)}
                className={cn("rounded-full p-1.5 hover:bg-bg-hover", mine && "bg-accent-soft")}
              >
                <Icon size={16} className={tone} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "@kerim can you look at the login" is most often a job for Kerim: one tap makes it a card on the
 * board for them, without opening the dialog. Shown to the writer while it is not a card yet.
 */
export function MentionTask({
  message,
  members,
  meId,
}: {
  message: ChatMessage;
  members: TeamMember[];
  meId?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // Only the writer's own message can carry the card's link, so the chip stays with them.
  if (message.task || message.bot || !message.mine) return null;
  const named = members.filter(
    (m) =>
      m.id !== meId &&
      new RegExp(`(^|\\s)@${m.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(message.text),
  );
  if (!named.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {named.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void api
              .messageToTask(message.id, { assignee: m.id })
              .catch(() => undefined)
              .finally(() => setBusy(false));
          }}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[12px] text-fg-muted hover:border-accent hover:text-accent"
        >
          <SquareCheckBig size={12} aria-hidden="true" />
          {t("teamChat.taskFor", { name: m.displayName || m.username })}
        </button>
      ))}
    </div>
  );
}
