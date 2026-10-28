import type { ChatMessage, TeamMember } from "@igrek/core";
import { Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useServerEvent } from "../../lib/live";
import { TeamAvatar } from "../TeamAvatar";
import { UnreadLine } from "./ChannelTools";
import { Composer } from "./Composer";
import { QuoteBox } from "./MessageExtras";
import { MessageItem } from "./MessageItem";

/**
 * A direct conversation with one teammate (sync/direct.ts): sealed for the two people's devices,
 * so the hub, an admin or anyone else with the team key cannot read it. Quoting works as in a
 * channel; reactions, pins and threads are for channels.
 */
export function DirectView({ peer, members, meId }: { peer: TeamMember; members: TeamMember[]; meId?: string }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quoting, setQuoting] = useState<ChatMessage>();
  const [unread, setUnread] = useState<{ id: string; count: number }>();
  const list = useRef<HTMLDivElement>(null);
  const load = useCallback(
    () =>
      void api
        .directMessages(peer.id)
        .then((found) => {
          setMessages(found);
          // Where the unread ones started when the talk was opened; kept while it stays open.
          setUnread((before) => {
            if (before) return before;
            const fresh = found.filter((m) => m.unread && !m.mine);
            return { id: fresh[0]?.id ?? "", count: fresh.length };
          });
        })
        .catch(() => undefined),
    [peer.id],
  );
  useEffect(load, [load]);
  useServerEvent("chat-changed", (m) => m.channelId === `dm:${peer.id}` && !m.typing && load());
  // biome-ignore lint/correctness/useExhaustiveDependencies: follows the newest message
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  const name = peer.displayName || peer.username;
  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <TeamAvatar member={peer} size={24} />
        <h1 className="truncate text-[14px] font-semibold">{name}</h1>
        <span className="flex items-center gap-1 text-[12px] text-fg-subtle" data-tip={t("teamChat.directSealedTip")}>
          <Lock size={12} aria-hidden="true" />
          {t("teamChat.directSealed")}
        </span>
      </header>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {!messages.length && (
          <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">{t("teamChat.directFirst", { name })}</p>
        )}
        {messages.map((m) => (
          <div key={m.id}>
            {unread?.id === m.id && <UnreadLine count={unread.count} />}
            <MessageItem message={m} members={members} meId={meId} projectId="" plain onQuote={() => setQuoting(m)} />
          </div>
        ))}
      </div>
      <div className="p-3">
        <Composer
          key={peer.id}
          placeholder={t("teamChat.directPlaceholder", { name })}
          members={[]}
          hint={t("teamChat.directHint")}
          banner={
            quoting ? (
              <QuoteBox
                quote={{ id: quoting.id, author: quoting.author, mine: quoting.mine, text: quoting.text }}
                onClick={() => undefined}
              />
            ) : undefined
          }
          onCancel={() => setQuoting(undefined)}
          onSend={(text) =>
            api.postDirect(peer.id, text, quoting?.id).then(() => {
              setQuoting(undefined);
              load();
            })
          }
        />
      </div>
    </section>
  );
}
