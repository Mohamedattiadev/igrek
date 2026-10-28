import type { ChatMessage, TaskStatus, TeamMember } from "@igrek/core";
import {
  CircleAlert,
  Forward,
  KanbanSquare,
  MessageSquareReply,
  Pin,
  Reply,
  Sparkles,
  SquareCheckBig,
  Star,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { dateTime, relativeTime } from "../../lib/format";
import { Markdown } from "../Markdown";
import { TeamAvatar } from "../TeamAvatar";
import { Badge } from "../ui";
import { AttachmentView } from "./Attachments";
import { LinkCard } from "./LinkCard";
import { DeletedNote, MoreMenu, QuoteBox, SeenTicks } from "./MessageExtras";
import { MentionTask, ReactionChips, ReactionPicker } from "./Reactions";

const STATUS_TONE: Record<TaskStatus, "neutral" | "accent" | "warning" | "success"> = {
  todo: "neutral",
  doing: "accent",
  review: "warning",
  done: "success",
};

/** "igrek:task:doing" and "igrek:error:..." are notes from Igrek, worded here in the reader's language. */
function SystemNote({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const [, kind, rest = ""] = message.text.match(/^igrek:(task|error):([\s\S]*)$/) ?? [];
  const who = message.mine ? t("team.you") : (message.author ?? "");
  return (
    <div className="flex items-center gap-2 py-1 ps-11 text-[12px] text-fg-subtle">
      {kind === "error" ? (
        <CircleAlert size={13} className="text-danger" aria-hidden="true" />
      ) : (
        <KanbanSquare size={13} className="text-accent" aria-hidden="true" />
      )}
      <span>{kind === "error" ? t("teamChat.aiFailed", { reason: rest }) : t(`teamChat.task_${rest}`, { who })}</span>
      <span>· {relativeTime(message.at)}</span>
    </div>
  );
}

/** Mentions stand out, the rest is the message as written (Markdown, like Slack's). */
function highlight(text: string): string {
  return text.replace(/(^|\s)@([\w.-]{2,32})/g, "$1**@$2**");
}

const isNote = (m: ChatMessage) => m.bot && /^igrek:(task|error):/.test(m.text);

function Face({ message, member, name }: { message: ChatMessage; member?: TeamMember; name: string }) {
  if (message.bot)
    return (
      <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Sparkles size={15} aria-hidden="true" />
      </span>
    );
  if (member) return <TeamAvatar member={member} size={32} />;
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-bg-muted text-[13px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function TaskChip({ task, projectId }: { task: NonNullable<ChatMessage["task"]>; projectId: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/p/${projectId}?tab=board&card=${task.id}`}
      className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-ui border border-border bg-bg px-2.5 py-1.5 text-[12.5px] hover:border-accent"
    >
      <SquareCheckBig size={13} className="shrink-0 text-accent" aria-hidden="true" />
      <span className="truncate font-medium">{task.title}</span>
      <Badge tone={STATUS_TONE[task.status]}>{t(`teamChat.status_${task.status}`)}</Badge>
      {task.assignee && <span className="shrink-0 text-fg-subtle">{task.assignee}</span>}
    </Link>
  );
}

function RepliesLink({ message, onThread }: { message: ChatMessage; onThread?: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onThread}
      className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
    >
      <MessageSquareReply size={13} aria-hidden="true" />
      {t("teamChat.replies", { count: message.replies })}
      {message.lastReplyAt && <span className="font-normal text-fg-subtle">· {relativeTime(message.lastReplyAt)}</span>}
    </button>
  );
}

export interface MessageHandlers {
  onThread?: () => void;
  onTask?: () => void;
  /** Answer it with the message quoted above mine, like swiping it on WhatsApp. */
  onQuote?: () => void;
  onEdit?: () => void;
  onForward?: () => void;
  /** A direct message: only quoting; reactions, pins and the rest are for channels. */
  plain?: boolean;
}

/** React, quote-reply, open its thread, and the rest behind "more", over the message while it is pointed at. */
function Actions({
  message,
  compact,
  handlers,
}: {
  message: ChatMessage;
  compact?: boolean;
  handlers: MessageHandlers;
}) {
  const { t } = useTranslation();
  const action = "rounded px-2 py-1 text-[12px] hover:bg-bg-hover";
  const canTask = !!handlers.onTask && !message.task && !message.bot;
  return (
    <div className="absolute -top-3 end-2 hidden gap-0.5 rounded-ui border border-border bg-bg p-0.5 shadow-ui group-focus-within:flex group-hover:flex">
      {!handlers.plain && <ReactionPicker message={message} className={action} />}
      {handlers.onQuote && (
        <button
          type="button"
          onClick={handlers.onQuote}
          className={action}
          data-tip={t("teamChat.quoteReply")}
          aria-label={t("teamChat.quoteReply")}
        >
          <Reply size={14} aria-hidden="true" />
        </button>
      )}
      {handlers.onThread && !compact && (
        <button
          type="button"
          onClick={handlers.onThread}
          className={action}
          data-tip={t("teamChat.reply")}
          aria-label={t("teamChat.reply")}
        >
          <MessageSquareReply size={14} aria-hidden="true" />
        </button>
      )}
      {!handlers.plain && (
        <MoreMenu
          message={message}
          actions={{
            onEdit: handlers.onEdit,
            onForward: handlers.onForward,
            onTask: canTask ? handlers.onTask : undefined,
          }}
        />
      )}
    </div>
  );
}

/** The time, then what is true of the message: edited, pinned, starred, and for mine whether it was seen. */
function Meta({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  return (
    <>
      <time
        className="text-[11px] text-fg-subtle"
        dateTime={new Date(message.at).toISOString()}
        title={dateTime(message.at)}
      >
        {relativeTime(message.at)}
      </time>
      {message.editedAt && !message.deleted && (
        <span className="text-[11px] text-fg-subtle" title={dateTime(message.editedAt)}>
          {t("teamChat.edited")}
        </span>
      )}
      {message.pinned && <Pin size={12} className="self-center text-accent" aria-label={t("teamChat.pinned")} />}
      {message.starred && <Star size={12} className="self-center text-warning" aria-label={t("teamChat.starred")} />}
      <span className="self-center">
        <SeenTicks message={message} />
      </span>
    </>
  );
}

function Body({
  message,
  projectId,
  members,
  meId,
}: {
  message: ChatMessage;
  projectId: string;
  members: TeamMember[];
  meId?: string;
}) {
  const { t } = useTranslation();
  if (message.deleted) return <DeletedNote />;
  return (
    <>
      {message.forwarded && (
        <p className="flex items-center gap-1 text-[11.5px] text-fg-subtle italic">
          <Forward size={12} aria-hidden="true" />
          {t("teamChat.forwarded")}
        </p>
      )}
      {message.quote && <QuoteBox quote={message.quote} />}
      <Markdown text={highlight(message.text)} className="prose-igrek text-[13.5px]" />
      {message.preview && <LinkCard preview={message.preview} />}
      {message.attachment && <AttachmentView file={message.attachment} />}
      {message.task && <TaskChip task={message.task} projectId={projectId} />}
      <MentionTask message={message} members={members} meId={meId} />
    </>
  );
}

function useAuthorName(message: ChatMessage, member?: TeamMember): string {
  const { t } = useTranslation();
  if (message.bot) return t("teamChat.aiFor", { name: message.mine ? t("team.you") : (message.author ?? "") });
  // My name as the team knows it now, not as it was when I wrote.
  if (message.mine) return member?.displayName ?? message.author ?? t("team.you");
  return member?.displayName ?? message.author ?? "";
}

export function MessageItem({
  message,
  members,
  projectId,
  compact,
  meId,
  ...handlers
}: {
  message: ChatMessage;
  members: TeamMember[];
  meId?: string;
  projectId: string;
  compact?: boolean;
} & MessageHandlers) {
  const { t } = useTranslation();
  // My own messages carry no author id here; my face is the one with my id.
  const member = members.find((m) => m.id === (message.mine ? meId : message.authorId));
  const name = useAuthorName(message, member);
  if (isNote(message)) return <SystemNote message={message} />;
  return (
    <article
      id={`msg-${message.id}`}
      className={`group relative flex gap-3 rounded-ui px-2 py-1.5 transition-colors hover:bg-bg-hover ${message.reactions.length ? "pb-4" : ""}`}
    >
      <span className="pt-0.5">
        <Face message={message} member={member} name={name} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold">{name}</span>
          {message.bot && <Badge tone="accent">{t("teamChat.aiBadge")}</Badge>}
          <Meta message={message} />
        </p>
        <Body message={message} projectId={projectId} members={members} meId={meId} />
        {!compact && message.replies > 0 && <RepliesLink message={message} onThread={handlers.onThread} />}
        <div>
          <ReactionChips message={message} />
        </div>
      </div>
      {!message.deleted && <Actions message={message} compact={compact} handlers={handlers} />}
    </article>
  );
}
