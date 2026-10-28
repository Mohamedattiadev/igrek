import { ArrowLeft, FolderKanban, Hash, Lock, MessagesSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TypingLine, UnreadLine } from "../components/chat/ChannelTools";
import { Button, EmptyState } from "../components/ui";
import { cn } from "../lib/cn";
import { channelKey, directKey, type MemberClient } from "./client";
import { type ComposerQuote, MemberComposer } from "./MemberComposer";
import { ChannelMessage, DirectMessageItem, PersonAvatar } from "./MemberMessage";
import { channelsOf, type MemberComment, type MemberProject, messagesIn } from "./model";

const row = (on: boolean, unread: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px]",
    on ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover",
    unread && !on && "font-semibold text-fg",
  );

function Count({ n }: { n: number }) {
  if (!n) return null;
  return <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-white">{n}</span>;
}

/** Channels grouped by project, then a direct talk with each teammate, as in Igrek's sidebar. */
function Conversations({
  client,
  open,
  onOpen,
}: {
  client: MemberClient;
  open?: string;
  onOpen: (key: string) => void;
}) {
  const { t } = useTranslation();
  const me = client.me()?.id;
  const projects = [...client.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  const people = [...client.members.values()].filter((m) => m.id !== me);
  return (
    <nav aria-label={t("teamChat.channels")} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
      {projects.map((p) => (
        <section key={p.key}>
          <h3 className="flex items-center gap-1.5 px-2 py-1 text-[12px] font-medium text-fg-muted">
            <FolderKanban size={12} aria-hidden="true" />
            <span className="truncate">{p.name}</span>
          </h3>
          <ul>
            {channelsOf(p).map((c) => {
              const key = channelKey(p.key, c.id);
              const n = client.unreadIn(p, c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(key)}
                    aria-current={open === key ? "page" : undefined}
                    className={row(open === key, n > 0)}
                  >
                    <Hash size={13} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {open !== key && <Count n={n} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {people.length > 0 && (
        <section>
          <h2 className="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("teamChat.direct")}
          </h2>
          <ul>
            {people.map((m) => {
              const key = directKey(m.id);
              const n = client.unreadDirect(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(key)}
                    aria-current={open === key ? "page" : undefined}
                    className={row(open === key, n > 0)}
                  >
                    <PersonAvatar client={client} id={m.id} size={18} />
                    <span className="min-w-0 flex-1 truncate">{client.nameOf(m.id)}</span>
                    {open !== key && <Count n={n} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </nav>
  );
}

/** Keeps the newest message in view as they come, and marks the conversation read while it is open. */
function useFollow(count: number, onSeen: () => void) {
  const end = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message is the reason to scroll and mark read
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    if (document.visibilityState === "visible") onSeen();
    // Pictures take their height once decoded: follow them down once more.
    const later = setTimeout(() => end.current?.scrollIntoView({ block: "end" }), 400);
    return () => clearTimeout(later);
  }, [count]);
  return end;
}

function Header({
  title,
  sub,
  icon: Icon,
  onBack,
}: {
  title: string;
  sub?: string;
  icon: typeof Hash;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 text-[13.5px] font-semibold">
      {onBack && <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack} aria-label={t("member.back")} />}
      <Icon size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
      <span className="truncate">{title}</span>
      {sub && <span className="truncate text-[12.5px] font-normal text-fg-subtle">{sub}</span>}
    </header>
  );
}

function ChannelView({
  client,
  project,
  channelId,
  onBack,
}: {
  client: MemberClient;
  project: MemberProject;
  channelId: string;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const [thread, setThread] = useState<string>();
  const [quote, setQuote] = useState<ComposerQuote>();
  const [editing, setEditing] = useState<MemberComment>();
  const [firstUnread] = useState(() => client.readMark(channelKey(project.key, channelId)));
  const channel = channelsOf(project).find((c) => c.id === channelId);
  const all = messagesIn(project, channelId);
  const top = all.filter((c) => !c.parentId);
  const end = useFollow(all.length, () => void client.markSeen(project.key, channelId));
  const viewer = client.me()?.role === "viewer";
  const me = client.me()?.id;
  const replies = (id: string) => all.filter((c) => c.parentId === id);
  const root = thread ? all.find((c) => c.id === thread) : undefined;
  const unread = top.filter((c) => c.at > firstUnread && c.authorId !== me);
  const actionsFor = (c: MemberComment) => ({
    onQuote: viewer ? undefined : () => setQuote({ id: c.id, author: c.author, text: c.text }),
    onThread: () => setThread(c.id),
    onEdit: c.authorId === me && !c.attachment ? () => setEditing(c) : undefined,
    onDelete:
      c.authorId === me
        ? () => {
            if (confirm(t("teamChat.deleteConfirm"))) void client.updateMessage(project.key, c.id, { deleted: true });
          }
        : undefined,
  });
  const send = async (text: string, parentId?: string) => {
    if (editing) {
      await client.updateMessage(project.key, editing.id, { text });
      setEditing(undefined);
      return;
    }
    await client.comment(project.key, { kind: "channel", id: channelId }, text, { parentId, quoteId: quote?.id });
    setQuote(undefined);
  };
  const name = channel?.name ?? "general";
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className={cn("min-w-0 flex-1 flex-col", root ? "hidden lg:flex" : "flex")}>
        <Header title={name} sub={channel?.topic || project.name} icon={Hash} onBack={onBack} />
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {top.map((c) => (
            <div key={c.id}>
              {c.id === unread[0]?.id && <UnreadLine count={unread.length} />}
              <ChannelMessage
                c={c}
                client={client}
                project={project}
                replies={replies(c.id).length}
                actions={actionsFor(c)}
              />
            </div>
          ))}
          <div ref={end} />
        </div>
        <TypingLine names={client.typingIn(project.key, channelId)} />
        {!viewer && (
          <div className="p-3 pt-0">
            <MemberComposer
              placeholder={t("teamChat.placeholder", { channel: name })}
              quote={quote}
              onClearQuote={() => setQuote(undefined)}
              editing={editing?.text}
              onCancelEdit={() => setEditing(undefined)}
              onSend={(text) => send(text)}
              onFile={(file) =>
                client.comment(project.key, { kind: "channel", id: channelId }, "", { file, quoteId: quote?.id })
              }
              onTyping={() => void client.sendTyping(project.key, channelId)}
            />
          </div>
        )}
      </section>
      {root && (
        <aside aria-label={t("teamChat.thread")} className="flex w-full flex-col border-border lg:w-80 lg:border-s">
          <header className="flex h-11 items-center justify-between border-b border-border px-4 text-[13.5px] font-semibold">
            {t("teamChat.thread")}
            <Button
              size="sm"
              variant="ghost"
              icon={X}
              onClick={() => setThread(undefined)}
              aria-label={t("teamChat.closeThread")}
            />
          </header>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {[root, ...replies(root.id)].map((c) => (
              <ChannelMessage key={c.id} c={c} client={client} project={project} actions={{}} />
            ))}
          </div>
          {!viewer && (
            <div className="p-3 pt-0">
              <MemberComposer placeholder={t("teamChat.replyPlaceholder")} onSend={(text) => send(text, root.id)} />
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function DirectView({ client, peer, onBack }: { client: MemberClient; peer: string; onBack?: () => void }) {
  const { t } = useTranslation();
  const [quote, setQuote] = useState<ComposerQuote>();
  const talk = client.direct.talks.get(peer) ?? [];
  const end = useFollow(talk.length, () => void client.markDirectRead(peer));
  const me = client.me()?.id ?? "";
  const name = client.nameOf(peer);
  const byId = new Map(talk.map((m) => [m.id, m]));
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Header title={name} sub={t("teamChat.directSealed")} icon={Lock} onBack={onBack} />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {talk.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">{t("teamChat.directFirst", { name })}</p>
        )}
        {talk.map((m) => {
          const q = m.quoteId ? byId.get(m.quoteId) : undefined;
          return (
            <DirectMessageItem
              key={m.id}
              client={client}
              author={m.mine ? me : peer}
              text={m.text}
              at={m.at}
              quote={
                m.quoteId
                  ? { author: q && client.nameOf(q.mine ? me : peer), text: q?.text ?? "", missing: !q }
                  : undefined
              }
              onQuote={() => setQuote({ id: m.id, author: client.nameOf(m.mine ? me : peer), text: m.text })}
            />
          );
        })}
        <div ref={end} />
      </div>
      {client.me()?.role !== "viewer" && (
        <div className="p-3 pt-0">
          <MemberComposer
            placeholder={t("teamChat.directPlaceholder", { name })}
            quote={quote}
            onClearQuote={() => setQuote(undefined)}
            onSend={async (text) => {
              await client.sendDirect(peer, text, quote?.id);
              setQuote(undefined);
            }}
          />
        </div>
      )}
    </section>
  );
}

/**
 * The team chat in the browser (plan.md 20.1): the same channels, threads and direct messages as
 * in Igrek. Asking @ai works from Igrek on a computer (it answers with that person's own Claude).
 */
export function MemberChat({
  client,
  open,
  onOpen,
  narrow,
}: {
  client: MemberClient;
  open?: string;
  onOpen: (key?: string) => void;
  narrow: boolean;
}) {
  const { t } = useTranslation();
  const [project, channelId] = open && !open.startsWith("dm:") ? open.split("|") : [];
  const p = project ? client.projects.get(project) : undefined;
  const peer = open?.startsWith("dm:") ? open.slice(3) : undefined;
  const view = p && channelId ? "channel" : peer ? "direct" : undefined;
  const back = narrow ? () => onOpen(undefined) : undefined;
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "w-full shrink-0 flex-col border-e border-border bg-bg-subtle md:w-60",
          view && narrow ? "hidden" : "flex",
        )}
      >
        <Conversations client={client} open={open} onOpen={onOpen} />
      </div>
      {view === "channel" && p && channelId && (
        <ChannelView key={open} client={client} project={p} channelId={channelId} onBack={back} />
      )}
      {view === "direct" && peer && <DirectView key={open} client={client} peer={peer} onBack={back} />}
      {!view && !narrow && (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState icon={MessagesSquare} title={t("member.pickChat")} body={t("member.pickChatBody")} />
        </div>
      )}
    </div>
  );
}
