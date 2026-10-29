import type { ChatChannel, ChatMessage, LinkPreview, TeamMember } from "@igrek/core";
import {
  FileText,
  FolderKanban,
  Hash,
  KanbanSquare,
  MessagesSquare,
  Pencil,
  Pin,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { ChannelList } from "../components/chat/ChannelList";
import { MuteButton, SidePanel, TypingLine, UnreadLine, useTyping } from "../components/chat/ChannelTools";
import { Composer } from "../components/chat/Composer";
import { DirectView } from "../components/chat/DirectView";
import { ForwardDialog, QuoteBox } from "../components/chat/MessageExtras";
import { MessageItem } from "../components/chat/MessageItem";
import { TaskDialog } from "../components/chat/TaskDialog";
import { TeamTimeline } from "../components/chat/Timeline";
import { useMessageWindow } from "../components/chat/window";
import { GapsLine } from "../components/GapsLine";
import { Markdown } from "../components/Markdown";
import { useTeamPeople } from "../components/TeamAvatar";
import { Button, EmptyState, field } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useCoalesced, useServerEvent } from "../lib/live";

/**
 * A list that stays at its newest message while new ones come in. Opened with unread messages, it
 * starts at the "Unread messages" line instead, once.
 */
function useStickToBottom(dep: unknown, start?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const placed = useRef<string>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the list changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = el.querySelector("#unread-line");
    if (start && line && placed.current !== start) {
      placed.current = start;
      line.scrollIntoView({ block: "start" });
    } else el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

/**
 * The next message of a channel or thread: plain, an answer quoting one, or one of mine being
 * edited; and the reply, edit and forward handlers each message gets.
 */
function useDraft(
  channelId: string,
  parentId: string | undefined,
  reload: () => void,
  onForward: (m: ChatMessage) => void,
) {
  const { t } = useTranslation();
  const [quoting, setQuoting] = useState<ChatMessage>();
  const [editing, setEditing] = useState<ChatMessage>();
  const reset = () => {
    setQuoting(undefined);
    setEditing(undefined);
  };
  const banner = editing ? (
    <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
      <Pencil size={13} aria-hidden="true" />
      {t("teamChat.editing")}
    </p>
  ) : quoting ? (
    <QuoteBox
      quote={{ id: quoting.id, author: quoting.author, mine: quoting.mine, text: quoting.text }}
      onClick={() => undefined}
    />
  ) : undefined;
  return {
    composer: {
      key: `${channelId}-${editing?.id ?? ""}`,
      banner,
      initialText: editing?.text ?? "",
      onCancel: reset,
      onTyping: () => void api.chatTyping(channelId).catch(() => undefined),
      // A file goes out on its own, quoting what was being answered; threads keep to text.
      onFile: parentId
        ? undefined
        : (file: File) =>
            api.sendChatFile(channelId, file, file.name, undefined, quoting?.id).then(() => {
              reset();
              reload();
            }),
      onSend: (text: string, preview?: LinkPreview) =>
        (editing ? api.editChat(editing.id, text) : api.postChat(channelId, text, parentId, quoting?.id, preview)).then(
          () => {
            reset();
            reload();
          },
        ),
    },
    handlers: (m: ChatMessage) => ({
      onQuote: () => {
        setEditing(undefined);
        setQuoting(m);
      },
      onEdit:
        m.mine && !m.bot
          ? () => {
              setQuoting(undefined);
              setEditing(m);
            }
          : undefined,
      onForward: () => onForward(m),
    }),
  };
}

function Thread({
  channel,
  root,
  members,
  meId,
  writing,
  onClose,
  onTask,
  onForward,
}: {
  channel: ChatChannel;
  root: ChatMessage;
  members: TeamMember[];
  meId?: string;
  writing: boolean;
  onClose: () => void;
  onTask: (m: ChatMessage) => void;
  onForward: (m: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const load = useCallback(
    () =>
      void api
        .chatMessages(channel.id, root.id)
        .then(setReplies)
        .catch(() => undefined),
    [channel.id, root.id],
  );
  useEffect(load, [load]);
  useServerEvent("chat-changed", (m) => m.channelId === channel.id && m.writing === undefined && !m.typing && load());
  const list = useStickToBottom(replies.length);
  const draft = useDraft(channel.id, root.id, load, onForward);
  return (
    <aside aria-label={t("teamChat.thread")} className="flex w-full flex-col border-border lg:w-96 lg:border-s">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <p className="text-[13.5px] font-semibold">
          {t("teamChat.thread")} <span className="font-normal text-fg-subtle"># {channel.name}</span>
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label={t("teamChat.closeThread")} />
      </header>
      <div ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        <MessageItem message={root} members={members} meId={meId} projectId={channel.projectId} compact />
        <p className="flex items-center gap-2 px-2 py-1 text-[11.5px] text-fg-subtle">
          {t("teamChat.replies", { count: replies.length })}
          <span className="h-px flex-1 bg-border" />
        </p>
        {replies.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            members={members}
            meId={meId}
            projectId={channel.projectId}
            compact
            onTask={() => onTask(m)}
            {...draft.handlers(m)}
          />
        ))}
        {writing && <AiWriting />}
      </div>
      <div className="border-t border-border p-3">
        <Composer placeholder={t("teamChat.replyPlaceholder")} members={members} autoFocus {...draft.composer} />
      </div>
    </aside>
  );
}

function AiWriting() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-2 px-2 py-1 text-[12.5px] text-fg-subtle" aria-live="polite">
      <Sparkles size={13} className="animate-pulse text-accent" aria-hidden="true" />
      {t("teamChat.aiWriting")}
    </p>
  );
}

type Panel = "search" | "pinned" | "starred";

function ChannelHeader({
  channel,
  onPanel,
  onChanged,
}: {
  channel: ChatChannel;
  onPanel: (panel: Panel) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 overflow-hidden border-b border-border px-4">
        <h1 className="flex shrink-0 items-center gap-1 text-[14px] font-semibold">
          <Hash size={15} className="text-fg-subtle" aria-hidden="true" />
          <span className="truncate">{channel.name}</span>
        </h1>
        <span className="hidden min-w-0 flex-1 truncate text-[12.5px] text-fg-subtle sm:block">
          {channel.topic || channel.project}
        </span>
        {/* The project and its board one click away: going Messages, Projects, the project, then
            its board was the long way round. */}
        <Link
          to={`/p/${channel.projectId}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-ui px-2 py-1 text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <FolderKanban size={14} aria-hidden="true" />
          <span className="hidden md:inline">{channel.project}</span>
        </Link>
        <Link
          to={`/p/${channel.projectId}?tab=board`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-ui px-2 py-1 text-[12.5px] text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <KanbanSquare size={14} aria-hidden="true" />
          {t("teamChat.board")}
        </Link>
        <Button
          usesModel
          size="sm"
          variant="ghost"
          icon={FileText}
          disabled={busy || !channel.messages}
          onClick={() => {
            setBusy(true);
            void api
              .channelSummary(channel.id)
              .then((r) => setSummary(r.summary))
              .catch((err: Error) => setSummary(err.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? t("briefing.writing") : t("chatTeam.summary")}
        </Button>
        {(
          [
            ["search", Search],
            ["pinned", Pin],
            ["starred", Star],
          ] as const
        ).map(([panel, icon]) => (
          <Button
            key={panel}
            size="sm"
            variant="ghost"
            icon={icon}
            onClick={() => onPanel(panel)}
            aria-label={t(`teamChat.panel_${panel}`)}
            data-tip={t(`teamChat.panel_${panel}`)}
          />
        ))}
        <MuteButton channel={channel} onChanged={onChanged} />
      </header>
      {summary && (
        <div className="flex items-start gap-2 border-b border-border bg-bg-subtle px-4 py-3 text-[13px]">
          <Markdown text={summary} className="prose-igrek min-w-0 flex-1" />
          <Button
            size="sm"
            variant="ghost"
            icon={X}
            onClick={() => setSummary(undefined)}
            aria-label={t("teamChat.closeSummary")}
          />
        </div>
      )}
    </>
  );
}

/** On a phone the channel list is a picker, with the team's timeline first. */
function ChannelSelect({
  channels,
  value,
  onPick,
  onTimeline,
}: {
  channels: ChatChannel[];
  value: string;
  onPick: (id: string) => void;
  onTimeline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === "timeline" ? onTimeline() : onPick(e.target.value))}
      aria-label={t("teamChat.channels")}
      className={cn(field, "m-2 md:hidden")}
    >
      <option value="timeline">{t("timeline.title")}</option>
      {channels.map((c) => (
        <option key={c.id} value={c.id}>
          # {c.name} · {c.project}
        </option>
      ))}
    </select>
  );
}

/** Where the unread ones started when the channel was opened; kept while it stays open. */
function useUnreadStart(channelId: string | undefined, messages: ChatMessage[]) {
  const [start, setStart] = useState<{ channel: string; id: string; count: number }>();
  useEffect(() => {
    if (!channelId || start?.channel === channelId || !messages.length || messages[0]?.channelId !== channelId) return;
    const unread = messages.filter((m) => m.unread && !m.mine);
    setStart({ channel: channelId, id: unread[0]?.id ?? "", count: unread.length });
  }, [channelId, messages, start?.channel]);
  return start && start.channel === channelId && start.id ? start : undefined;
}

/** The project's team bots, offered after "@" like teammates (bots.ts). */
function useBotMembers(projectId: string): TeamMember[] {
  const [bots, setBots] = useState<TeamMember[]>([]);
  useEffect(
    () =>
      void api
        .bots()
        .then((list) =>
          setBots(
            list
              .filter((b) => !b.projectId || b.projectId === projectId)
              .map((b) => ({ id: `bot:${b.id}`, username: b.handle, displayName: b.name, role: "member" as const })),
          ),
        )
        .catch(() => undefined),
    [projectId],
  );
  return bots;
}

/** One channel: its header, the messages with the unread line and who is typing, and the box to write in. */
function ChannelView({
  channel,
  channels,
  thread,
  writing,
  typing,
  messages,
  people,
  onReload,
  onReloadChannels,
  onOpen,
  onTask,
  onForward,
  onPanel,
}: {
  channel: ChatChannel;
  channels: ChatChannel[];
  thread?: ChatMessage;
  writing: boolean;
  typing: string[];
  messages: ChatMessage[];
  people: { members: TeamMember[]; meId?: string };
  onReload: () => void;
  onReloadChannels: () => void;
  onOpen: (id: string, threadId?: string) => void;
  onTask: (m: ChatMessage) => void;
  onForward: (m: ChatMessage) => void;
  onPanel: (panel: Panel) => void;
}) {
  const { t } = useTranslation();
  const unread = useUnreadStart(channel.id, messages);
  const list = useStickToBottom(messages.length, unread ? `${channel.id}:${unread.id}` : undefined);
  const unreadAt = unread ? messages.findIndex((m) => m.id === unread.id) : -1;
  const shown = useMessageWindow(messages.length, channel.id, list, unreadAt >= 0 ? unreadAt : undefined);
  const draft = useDraft(channel.id, undefined, onReload, onForward);
  const others = [...people.members.filter((m) => m.id !== people.meId), ...useBotMembers(channel.projectId)];
  return (
    <section className={`min-w-0 flex-1 flex-col ${thread ? "hidden lg:flex" : "flex"}`}>
      <ChannelSelect channels={channels} value={channel.id} onPick={onOpen} onTimeline={() => onOpen("timeline")} />
      <ChannelHeader key={channel.id} channel={channel} onPanel={onPanel} onChanged={onReloadChannels} />
      <div className="border-b border-border py-1.5">
        <GapsLine projectId={channel.projectId} />
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {messages.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">{t("teamChat.firstMessage")}</p>
        )}
        {shown.start > 0 && <div ref={shown.sentinel} style={{ height: 1 }} />}
        {messages.slice(shown.start).map((m) => (
          <div key={m.id}>
            {unread?.id === m.id && <UnreadLine count={unread.count} />}
            <MessageItem
              message={m}
              meId={people.meId}
              members={people.members}
              projectId={channel.projectId}
              onThread={() => onOpen(channel.id, m.id)}
              onTask={() => onTask(m)}
              {...draft.handlers(m)}
            />
          </div>
        ))}
        {writing && !thread && <AiWriting />}
      </div>
      <TypingLine names={typing} />
      <div className="p-3 pt-0">
        <Composer
          placeholder={t("teamChat.placeholder", { channel: channel.name })}
          members={others}
          {...draft.composer}
        />
      </div>
    </section>
  );
}

/**
 * The team chat (team-chat.ts): channels per shared project, threads, @teammate and @ai, and any
 * message can become a card on the board. Like WhatsApp: quoted replies, edits and deletions,
 * "seen" ticks, "typing...", pins, stars, search, forwarding, and a chime unless muted.
 * Everything goes to the team end-to-end encrypted.
 */
export function TeamChatPage() {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const [params, setParams] = useSearchParams();
  const [channels, setChannels] = useState<ChatChannel[]>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [writing, setWriting] = useState(false);
  const [taskFor, setTaskFor] = useState<ChatMessage>();
  const [forwarding, setForwarding] = useState<ChatMessage>();
  const [panel, setPanel] = useState<Panel>();
  const loadChannels = useCallback(
    () =>
      void api
        .chatChannels()
        .then(setChannels)
        .catch(() => setChannels([])),
    [],
  );
  useEffect(loadChannels, [loadChannels]);
  const [directs, setDirects] = useState<{ peer: string; unread: number }[]>([]);
  const loadDirects = useCallback(
    () =>
      void api
        .directChats()
        .then(setDirects)
        .catch(() => undefined),
    [],
  );
  useEffect(loadDirects, [loadDirects]);
  const team = { members: people.status?.members ?? [], meId: people.status?.user?.id };
  const teammates = team.members
    .filter((m) => m.id !== team.meId)
    .map((member) => ({ member, unread: directs.find((d) => d.peer === member.id)?.unread ?? 0 }));
  const picked = params.get("c") ?? "";
  const peer = picked.startsWith("dm:") ? teammates.find((p) => `dm:${p.member.id}` === picked)?.member : undefined;
  const channel = peer ? undefined : (channels?.find((c) => c.id === picked) ?? channels?.[0]);
  const [typing, setTyping] = useTyping(channel?.id);
  const loadMessages = useCallback(() => {
    if (channel)
      void api
        .chatMessages(channel.id)
        .then(setMessages)
        .catch(() => undefined);
  }, [channel]);
  useEffect(loadMessages, [loadMessages]);
  // Messages follow fast; the channel list and direct messages can wait a moment (plan.md 19.10).
  const messagesSoon = useCoalesced(loadMessages, 120);
  const channelsSoon = useCoalesced(loadChannels, 400);
  const directsSoon = useCoalesced(loadDirects, 400);
  useServerEvent("chat-changed", (m) => {
    if (m.typing) return m.channelId === channel?.id && setTyping(m.typing);
    if (m.channelId.startsWith("dm:")) return directsSoon();
    if (m.channelId === channel?.id) {
      if (m.writing !== undefined) setWriting(m.writing);
      else messagesSoon();
    }
    if (m.writing === undefined) channelsSoon();
  });
  const thread = messages.find((m) => m.id === params.get("thread"));
  const open = (id: string, threadId?: string) => {
    if (id === "timeline") return setParams({ view: "timeline" });
    setParams(threadId ? { c: id, thread: threadId } : { c: id });
  };
  const timeline = params.get("view") === "timeline";

  if (channels && !channels.length && !teammates.length)
    return (
      <div className="p-6">
        <EmptyState icon={MessagesSquare} title={t("teamChat.emptyTitle")} body={t("teamChat.emptyBody")} />
        <p className="mt-3 text-center">
          <Link to="/team" className="text-[13px] text-accent hover:underline">
            {t("teamChat.openTeam")}
          </Link>
        </p>
      </div>
    );
  return (
    <div className="flex h-full min-h-0">
      <div className="hidden w-60 shrink-0 border-e border-border bg-bg-subtle md:block">
        <ChannelList
          channels={channels ?? []}
          people={teammates}
          selected={peer ? picked : channel?.id}
          timeline={timeline}
          onTimeline={() => setParams({ view: "timeline" })}
          onPick={(id) => open(id)}
          onMade={(id) => {
            loadChannels();
            open(id);
          }}
        />
      </div>
      {timeline && (
        <div className="flex min-w-0 flex-1 flex-col">
          <ChannelSelect channels={channels ?? []} value="timeline" onPick={open} onTimeline={() => undefined} />
          <TeamTimeline />
        </div>
      )}
      {peer && !timeline && <DirectView key={peer.id} peer={peer} members={team.members} meId={team.meId} />}
      {channel && !timeline && (
        <ChannelView
          key={channel.id}
          channel={channel}
          channels={channels ?? []}
          thread={thread}
          writing={writing}
          typing={typing}
          messages={messages}
          people={team}
          onReload={loadMessages}
          onReloadChannels={loadChannels}
          onOpen={open}
          onTask={setTaskFor}
          onForward={setForwarding}
          onPanel={(p) => {
            setPanel(p);
            if (thread) open(channel.id);
          }}
        />
      )}
      {channel && thread && !panel && (
        <Thread
          key={thread.id}
          channel={channel}
          root={thread}
          members={team.members}
          meId={team.meId}
          writing={writing}
          onClose={() => open(channel.id)}
          onTask={setTaskFor}
          onForward={setForwarding}
        />
      )}
      {channel && panel && !timeline && (
        <SidePanel
          key={panel}
          kind={panel}
          channel={channel}
          onClose={() => setPanel(undefined)}
          onOpen={(m) => {
            setPanel(undefined);
            open(m.channelId, m.parentId);
          }}
        />
      )}
      <TaskDialog key={taskFor?.id} message={taskFor} members={team.members} onClose={() => setTaskFor(undefined)} />
      <ForwardDialog
        key={forwarding?.id}
        message={forwarding}
        channels={channels ?? []}
        onClose={() => setForwarding(undefined)}
      />
    </div>
  );
}
