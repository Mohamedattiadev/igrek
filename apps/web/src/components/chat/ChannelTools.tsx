import type { ChatChannel, ChatMessage } from "@igrek/core";
import { Bell, BellOff, Pin, Search, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { Button, field } from "../ui";
import { showMessage } from "./MessageExtras";

/** Where the messages I have not read start, like WhatsApp's "Unread messages" band. */
export function UnreadLine({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <p id="unread-line" className="my-2 flex items-center gap-2 px-2 text-[11.5px] font-medium text-accent">
      <span className="h-px flex-1 bg-accent/40" />
      {t("teamChat.unreadLine", { count })}
      <span className="h-px flex-1 bg-accent/40" />
    </p>
  );
}

/** "Kerim is typing...", from the presence teammates' Igrek sends while they type. */
export function TypingLine({ names }: { names: string[] }) {
  const { t } = useTranslation();
  if (!names.length) return null;
  return (
    <p className="px-4 py-1 text-[12px] text-fg-subtle italic" aria-live="polite">
      {t("teamChat.typing", { count: names.length, names: names.join(", ") })}
    </p>
  );
}

/** Names typing in a channel; each event carries the whole list, and it fades on its own. */
export function useTyping(channel?: string): [string[], (names: string[]) => void] {
  const [names, setNames] = useState<string[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new channel starts with nobody typing
  useEffect(() => setNames([]), [channel]);
  useEffect(() => {
    if (!names.length) return;
    const timer = setTimeout(() => setNames([]), 6000);
    return () => clearTimeout(timer);
  }, [names]);
  return [names, setNames];
}

export function MuteButton({ channel, onChanged }: { channel: ChatChannel; onChanged: () => void }) {
  const { t } = useTranslation();
  const label = t(channel.muted ? "teamChat.unmute" : "teamChat.mute");
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={channel.muted ? BellOff : Bell}
      aria-label={label}
      data-tip={label}
      onClick={() => void api.muteChannel(channel.id, !channel.muted).then(onChanged)}
    />
  );
}

function Found({ message, onPick }: { message: ChatMessage; onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <li>
      <button type="button" onClick={onPick} className="w-full px-3 py-2 text-start hover:bg-bg-hover">
        <span className="flex items-baseline gap-2 text-[12px]">
          <span className="inline-block font-semibold first-letter:uppercase">
            {message.mine ? t("team.you") : message.author}
          </span>
          <span className="text-fg-subtle">{relativeTime(message.at)}</span>
        </span>
        <span className="line-clamp-2 text-[13px] text-fg-muted">{message.text}</span>
      </button>
    </li>
  );
}

/**
 * Searching a channel, its pinned messages, or my starred ones: one panel beside the talk. A pick
 * scrolls to the message when it is in the list, or opens its thread.
 */
export function SidePanel({
  kind,
  channel,
  onClose,
  onOpen,
}: {
  kind: "search" | "pinned" | "starred";
  channel: ChatChannel;
  onClose: () => void;
  onOpen: (message: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ChatMessage[]>();
  useEffect(() => {
    // Typing on: an answer to an older query that lands late must not replace the newer one.
    let current = true;
    const show = (found: ChatMessage[]) => current && setList(found);
    const load = () =>
      (kind === "search"
        ? api.searchChat(channel.id, query)
        : kind === "pinned"
          ? api.pinnedChat(channel.id)
          : api.starredChat()
      )
        .then(show)
        .catch(() => show([]));
    if (kind === "search" && !query.trim()) setList(undefined);
    const timer =
      kind === "search" && !query.trim() ? undefined : setTimeout(() => void load(), kind === "search" ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, query, channel.id]);
  const Icon = { search: Search, pinned: Pin, starred: Star }[kind];
  const pick = (m: ChatMessage) => {
    if (document.getElementById(`msg-${m.id}`)) showMessage(m.id);
    else onOpen(m);
  };
  return (
    <aside aria-label={t(`teamChat.panel_${kind}`)} className="flex w-full flex-col border-border lg:w-80 lg:border-s">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Icon size={14} className="text-accent" aria-hidden="true" />
          {t(`teamChat.panel_${kind}`)}
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label={t("teamChat.closePanel")} />
      </header>
      {kind === "search" && (
        <div className="border-b border-border p-3">
          <input
            // biome-ignore lint/a11y/noAutofocus: the panel opens to type in it
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("teamChat.searchPlaceholder", { channel: channel.name })}
            aria-label={t("teamChat.searchPlaceholder", { channel: channel.name })}
            className={`${field} w-full`}
          />
        </div>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {list?.map((m) => (
          <Found key={m.id} message={m} onPick={() => pick(m)} />
        ))}
      </ul>
      {list && !list.length && (
        <p className="px-4 py-6 text-center text-[12.5px] text-fg-subtle">{t(`teamChat.panelEmpty_${kind}`)}</p>
      )}
    </aside>
  );
}
