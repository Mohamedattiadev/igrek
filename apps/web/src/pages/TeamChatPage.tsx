import type { ChatChannel, ChatMessage, TeamMember } from "@igrek/core";
import { FileText, FolderKanban, Hash, KanbanSquare, MessagesSquare, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { ChannelList } from "../components/chat/ChannelList";
import { Composer } from "../components/chat/Composer";
import { MessageItem } from "../components/chat/MessageItem";
import { TaskDialog } from "../components/chat/TaskDialog";
import { TeamTimeline } from "../components/chat/Timeline";
import { Markdown } from "../components/Markdown";
import { useTeamPeople } from "../components/TeamAvatar";
import { Button, EmptyState } from "../components/ui";
import { api } from "../lib/api";
import { useServerEvent } from "../lib/live";

/** A list that stays at its newest message while new ones come in. */
function useStickToBottom(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the list changes
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function Thread({
  channel,
  root,
  members,
  meId,
  writing,
  onClose,
  onTask,
}: {
  channel: ChatChannel;
  root: ChatMessage;
  members: TeamMember[];
  meId?: string;
  writing: boolean;
  onClose: () => void;
  onTask: (m: ChatMessage) => void;
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
  useServerEvent("chat-changed", (m) => m.channelId === channel.id && !m.writing && load());
  const list = useStickToBottom(replies.length);
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
          />
        ))}
        {writing && <AiWriting />}
      </div>
      <div className="border-t border-border p-3">
        <Composer
          placeholder={t("teamChat.replyPlaceholder")}
          members={members}
          autoFocus
          onSend={(text) => api.postChat(channel.id, text, root.id).then(load)}
        />
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

function ChannelHeader({ channel }: { channel: ChatChannel }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="flex min-w-0 items-center gap-1 text-[14px] font-semibold">
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
      className="m-2 h-8 rounded-ui border border-border bg-bg px-2 text-[13px] md:hidden"
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

/**
 * The team chat (team-chat.ts): channels per shared project, threads, @teammate and @ai, and any
 * message can become a card on the board. Everything goes to the team end-to-end encrypted.
 */
export function TeamChatPage() {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const members = (people.status?.members ?? []).filter((m) => m.id !== people.status?.user?.id);
  const [params, setParams] = useSearchParams();
  const [channels, setChannels] = useState<ChatChannel[]>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [writing, setWriting] = useState(false);
  const [taskFor, setTaskFor] = useState<ChatMessage>();
  const loadChannels = useCallback(
    () =>
      void api
        .chatChannels()
        .then(setChannels)
        .catch(() => setChannels([])),
    [],
  );
  useEffect(loadChannels, [loadChannels]);
  const channel = channels?.find((c) => c.id === params.get("c")) ?? channels?.[0];
  const loadMessages = useCallback(() => {
    if (channel)
      void api
        .chatMessages(channel.id)
        .then(setMessages)
        .catch(() => undefined);
  }, [channel]);
  useEffect(loadMessages, [loadMessages]);
  useServerEvent("chat-changed", (m) => {
    if (m.channelId === channel?.id) {
      if (m.writing !== undefined) setWriting(m.writing);
      else loadMessages();
    }
    if (m.writing === undefined) loadChannels();
  });
  const list = useStickToBottom(messages.length);
  const thread = messages.find((m) => m.id === params.get("thread"));
  const open = (id: string, threadId?: string) => setParams(threadId ? { c: id, thread: threadId } : { c: id });
  const timeline = params.get("view") === "timeline";

  if (channels && !channels.length)
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
          selected={channel?.id}
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
      {channel && !timeline && (
        <section className={`min-w-0 flex-1 flex-col ${thread ? "hidden lg:flex" : "flex"}`}>
          <ChannelSelect
            channels={channels ?? []}
            value={channel.id}
            onPick={open}
            onTimeline={() => setParams({ view: "timeline" })}
          />
          <ChannelHeader key={channel.id} channel={channel} />
          <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {messages.length === 0 && (
              <p className="px-4 py-8 text-center text-[13px] text-fg-subtle">{t("teamChat.firstMessage")}</p>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                meId={people.status?.user?.id}
                members={people.status?.members ?? []}
                projectId={channel.projectId}
                onThread={() => open(channel.id, m.id)}
                onTask={() => setTaskFor(m)}
              />
            ))}
            {writing && !thread && <AiWriting />}
          </div>
          <div className="p-3 pt-0">
            <Composer
              key={channel.id}
              placeholder={t("teamChat.placeholder", { channel: channel.name })}
              members={members}
              onSend={(text) => api.postChat(channel.id, text).then(loadMessages)}
            />
          </div>
        </section>
      )}
      {channel && thread && (
        <Thread
          key={thread.id}
          channel={channel}
          root={thread}
          members={people.status?.members ?? []}
          meId={people.status?.user?.id}
          writing={writing}
          onClose={() => open(channel.id)}
          onTask={setTaskFor}
        />
      )}
      <TaskDialog
        key={taskFor?.id}
        message={taskFor}
        members={people.status?.members ?? []}
        onClose={() => setTaskFor(undefined)}
      />
    </div>
  );
}
