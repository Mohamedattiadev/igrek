import type { ChatChannel, ChatMessage } from "@igrek/core";
import {
  Ban,
  Check,
  CheckCheck,
  Ellipsis,
  Forward,
  Pencil,
  Pin,
  PinOff,
  SquareCheckBig,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Button, Dialog, field } from "../ui";

/** Scrolls to a message in the list and lights it up for a moment, like tapping a quote on WhatsApp. */
export function showMessage(id: string): void {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("bg-accent-soft");
  setTimeout(() => el.classList.remove("bg-accent-soft"), 1500);
}

/** The message this one answers, in a small box above it. */
export function QuoteBox({ quote, onClick }: { quote: NonNullable<ChatMessage["quote"]>; onClick?: () => void }) {
  const { t } = useTranslation();
  const raw = quote.mine ? t("team.you") : (quote.author ?? "");
  // "you" starts the box, so it starts with a capital ("Sen", "You").
  const who = raw.charAt(0).toLocaleUpperCase() + raw.slice(1);
  return (
    <button
      type="button"
      onClick={onClick ?? (() => showMessage(quote.id))}
      className="mb-1 block w-full max-w-md rounded-ui border-s-[3px] border-accent bg-bg-muted px-2 py-1 text-start text-[12.5px] hover:bg-bg-active"
    >
      {quote.missing ? (
        <span className="text-fg-subtle italic">{t("teamChat.quoteMissing")}</span>
      ) : (
        <>
          <span className="block font-semibold text-accent">{who}</span>
          <span className="line-clamp-2 text-fg-muted">{quote.text || t("teamChat.deleted")}</span>
        </>
      )}
    </button>
  );
}

export function DeletedNote() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle italic">
      <Ban size={13} aria-hidden="true" />
      {t("teamChat.deleted")}
    </p>
  );
}

/** Two ticks on my own message: coloured once a teammate has read past it, their names on hover. */
export function SeenTicks({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  if (!message.mine || message.bot || message.deleted) return null;
  const seen = message.seenBy ?? [];
  const label = seen.length ? t("teamChat.seenBy", { names: seen.join(", ") }) : t("teamChat.notSeen");
  const Icon = seen.length ? CheckCheck : Check;
  return (
    <span role="img" aria-label={label} data-tip={label} className={seen.length ? "text-accent" : "text-fg-subtle"}>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

export interface MessageMenuActions {
  onEdit?: () => void;
  onForward?: () => void;
  onTask?: () => void;
}

/** Edit, delete, pin, star, forward and "make a card", behind one button so the bar stays small. */
export function MoreMenu({ message, actions }: { message: ChatMessage; actions: MessageMenuActions }) {
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
  const run = (fn: () => unknown) => () => {
    setOpen(false);
    void Promise.resolve(fn()).catch(() => undefined);
  };
  const mine = message.mine && !message.bot;
  const items = [
    mine && actions.onEdit && { icon: Pencil, label: t("teamChat.edit"), act: actions.onEdit },
    {
      icon: message.pinned ? PinOff : Pin,
      label: t(message.pinned ? "teamChat.unpin" : "teamChat.pin"),
      act: () => api.pinChat(message.id, !message.pinned),
    },
    {
      icon: message.starred ? StarOff : Star,
      label: t(message.starred ? "teamChat.unstar" : "teamChat.star"),
      act: () => api.starChat(message.id, !message.starred),
    },
    actions.onForward && { icon: Forward, label: t("teamChat.forward"), act: actions.onForward },
    actions.onTask && { icon: SquareCheckBig, label: t("teamChat.toTask"), act: actions.onTask },
    mine && {
      icon: Trash2,
      label: t("teamChat.delete"),
      danger: true,
      act: () => window.confirm(t("teamChat.deleteConfirm")) && api.deleteChat(message.id),
    },
  ].filter(Boolean) as { icon: typeof Pin; label: string; act: () => unknown; danger?: boolean }[];
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("teamChat.more")}
        data-tip={t("teamChat.more")}
        className="rounded px-2 py-1 text-[12px] hover:bg-bg-hover"
      >
        <Ellipsis size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute end-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-ui border border-border bg-bg py-1 shadow-ui"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={run(item.act)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-start text-[13px] hover:bg-bg-hover",
                item.danger && "text-danger",
              )}
            >
              <item.icon size={14} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sends a message on to another channel, where it shows as "Forwarded". */
export function ForwardDialog({
  message,
  channels,
  onClose,
}: {
  message?: ChatMessage;
  channels: ChatChannel[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const others = channels.filter((c) => c.id !== message?.channelId);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [error, setError] = useState<string>();
  return (
    <Dialog open={!!message} onClose={onClose} label={t("teamChat.forward")}>
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (message && to)
            void api
              .forwardChat(message.id, to)
              .then(onClose)
              .catch((err: Error) => setError(err.message));
        }}
      >
        <h2 className="text-[15px] font-semibold">{t("teamChat.forward")}</h2>
        <p className="line-clamp-3 rounded-ui bg-bg-muted px-3 py-2 text-[12.5px] text-fg-muted">{message?.text}</p>
        <label className="block space-y-1 text-[12.5px]">
          <span className="font-medium">{t("teamChat.forwardTo")}</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={cn(field, "w-full")}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                # {c.name} · {c.project}
              </option>
            ))}
          </select>
        </label>
        {!others.length && <p className="text-[12.5px] text-fg-subtle">{t("teamChat.forwardNone")}</p>}
        {error && <p className="text-[12.5px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("teamChat.cancel")}
          </Button>
          <Button type="submit" variant="primary" icon={Forward} disabled={!to}>
            {t("teamChat.forwardSend")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
