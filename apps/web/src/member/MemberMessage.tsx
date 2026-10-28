import type { ChatMessage } from "@igrek/core";
import { KanbanSquare, MessageSquareReply, Pencil, Pin, Reply, Sparkles, SquareCheckBig, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AttachmentView } from "../components/chat/Attachments";
import { LinkCard } from "../components/chat/LinkCard";
import { DeletedNote, SeenTicks } from "../components/chat/MessageExtras";
import { TeamAvatar } from "../components/TeamAvatar";
import { Badge } from "../components/ui";
import { dateTime, relativeTime } from "../lib/format";
import type { MemberClient, MemberPerson } from "./client";
import { MemberReactions } from "./MemberReactions";
import { channelName, type MemberComment, type MemberProject } from "./model";

/** A teammate's picture or initials; someone the hub no longer lists gets their initial. */
export function PersonAvatar({ client, id, size = 32 }: { client: MemberClient; id: string; size?: number }) {
  const person: MemberPerson = client.members.get(id) ?? {
    id,
    username: id,
    displayName: client.nameOf(id),
    role: "member",
  };
  return <TeamAvatar member={{ ...person, displayName: client.nameOf(id) }} size={size} />;
}

/** A file whose parts are all here, as an address the page can show; freed when it is no longer shown. */
function useFileUrl(client: MemberClient, file?: { hash: string; type: string }): string | undefined {
  const bytes = file ? client.files.done.get(file.hash) : undefined;
  const url = useMemo(
    () => (bytes && file ? URL.createObjectURL(new Blob([bytes], { type: file.type })) : undefined),
    [bytes, file],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

function Attachment({ client, c }: { client: MemberClient; c: MemberComment }) {
  const url = useFileUrl(client, c.attachment);
  if (!c.attachment) return null;
  return <AttachmentView file={{ ...c.attachment, here: !!url }} src={url ?? ""} />;
}

/** The message a reply quotes, in a small box above it. */
export function Quoted({ author, text, missing }: { author?: string; text: string; missing?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="mb-1 block max-w-md rounded-ui border-s-[3px] border-accent bg-bg-muted px-2 py-1 text-[12.5px]">
      {missing ? (
        <span className="text-fg-subtle italic">{t("teamChat.quoteMissing")}</span>
      ) : (
        <>
          <span className="block font-semibold text-accent">{author}</span>
          <span className="line-clamp-2 text-fg-muted">{text}</span>
        </>
      )}
    </span>
  );
}

/** "Card created", "Igrek could not answer": a short line, not a message. */
function Note({ c }: { c: MemberComment }) {
  const { t } = useTranslation();
  const [, kind, rest = ""] = c.text.match(/^igrek:(task|error):([\s\S]*)$/) ?? [];
  return (
    <p className="flex items-center gap-2 py-1 ps-11 text-[12px] text-fg-subtle">
      <KanbanSquare size={13} className={kind === "error" ? "text-danger" : "text-accent"} aria-hidden="true" />
      {kind === "error" ? t("teamChat.aiFailed", { reason: rest }) : t(`teamChat.task_${rest}`, { who: c.author })}
    </p>
  );
}

function Body({ c, client, project }: { c: MemberComment; client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  if (c.deleted) return <DeletedNote />;
  const q = c.quoteId ? project.comments.get(c.quoteId) : undefined;
  const task = c.taskId ? project.tasks.get(c.taskId) : undefined;
  return (
    <>
      {c.quoteId && (
        <Quoted author={q?.author} text={q?.deleted ? t("teamChat.deleted") : (q?.text ?? "")} missing={!q} />
      )}
      {c.text && <p className="whitespace-pre-wrap break-words text-[13.5px]">{c.text}</p>}
      {c.preview && <LinkCard preview={c.preview} />}
      <Attachment client={client} c={c} />
      {task && (
        <span className="mt-1.5 inline-flex items-center gap-2 rounded-ui border border-border px-2.5 py-1 text-[12.5px]">
          <SquareCheckBig size={13} className="text-accent" aria-hidden="true" />
          {task.title}
          <Badge>{t(`teamChat.status_${task.status}`)}</Badge>
        </span>
      )}
    </>
  );
}

export interface MessageActions {
  onQuote?: () => void;
  onThread?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Reply, thread, edit and delete over the message while it is pointed at, as in Igrek. */
function Actions({ actions }: { actions: MessageActions }) {
  const { t } = useTranslation();
  const action = "rounded px-2 py-1 text-[12px] hover:bg-bg-hover";
  const items = [
    { on: actions.onQuote, icon: Reply, label: t("teamChat.quoteReply") },
    { on: actions.onThread, icon: MessageSquareReply, label: t("teamChat.openThread") },
    { on: actions.onEdit, icon: Pencil, label: t("teamChat.edit") },
    { on: actions.onDelete, icon: Trash2, label: t("teamChat.delete") },
  ].filter((i) => i.on);
  if (!items.length) return null;
  return (
    <div className="absolute -top-3 end-2 hidden gap-0.5 rounded-ui border border-border bg-bg p-0.5 shadow-ui group-focus-within:flex group-hover:flex">
      {items.map(({ on, icon: Icon, label }) => (
        <button key={label} type="button" onClick={on} className={action} data-tip={label} aria-label={label}>
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** Who has read my message: teammates whose "seen" mark is past it. */
function seenBy(client: MemberClient, project: MemberProject, c: MemberComment): string[] {
  const marks = project.seen.get(channelName(c.targetId));
  return [...(marks ?? [])].filter(([id, at]) => id !== c.authorId && at >= c.at).map(([id]) => client.nameOf(id));
}

/** One message in a channel, laid out as in Igrek's team chat. */
export function ChannelMessage({
  c,
  client,
  project,
  replies,
  actions,
}: {
  c: MemberComment;
  client: MemberClient;
  project: MemberProject;
  replies?: number;
  actions: MessageActions;
}) {
  const { t } = useTranslation();
  if (c.bot && /^igrek:(task|error):/.test(c.text)) return <Note c={c} />;
  const mine = c.authorId === client.me()?.id;
  const ticks = { mine, bot: c.bot, deleted: c.deleted, seenBy: mine ? seenBy(client, project, c) : [] };
  return (
    <article
      id={`msg-${c.id}`}
      className="group relative flex gap-3 rounded-ui px-2 py-1.5 transition-colors hover:bg-bg-hover"
    >
      {c.bot ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={15} aria-hidden="true" />
        </span>
      ) : (
        <PersonAvatar client={client} id={c.authorId} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold">
            {c.bot ? t("teamChat.aiFor", { name: c.author }) : c.author}
          </span>
          {c.bot && <Badge tone="accent">{t("teamChat.aiBadge")}</Badge>}
          <span className="text-[11px] text-fg-subtle" title={dateTime(c.at)}>
            {relativeTime(c.at)}
          </span>
          {c.editedAt && !c.deleted && <span className="text-[11px] text-fg-subtle">{t("teamChat.edited")}</span>}
          {c.pinned && <Pin size={12} className="self-center text-accent" aria-label={t("teamChat.pinned")} />}
          <span className="self-center">
            <SeenTicks message={ticks as unknown as ChatMessage} />
          </span>
        </p>
        <Body c={c} client={client} project={project} />
        {!!replies && (
          <button
            type="button"
            onClick={actions.onThread}
            className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
          >
            <MessageSquareReply size={13} aria-hidden="true" /> {t("teamChat.replies", { count: replies })}
          </button>
        )}
        {!c.deleted && (
          <MemberReactions
            client={client}
            project={project}
            messageId={c.id}
            canReact={client.me()?.role !== "viewer"}
          />
        )}
      </div>
      {!c.deleted && <Actions actions={actions} />}
    </article>
  );
}

/** One direct message: the same look, only quoting (as on a computer). */
export function DirectMessageItem({
  client,
  author,
  text,
  at,
  quote,
  onQuote,
}: {
  client: MemberClient;
  author: string;
  text: string;
  at: number;
  quote?: { author?: string; text: string; missing?: boolean };
  onQuote: () => void;
}) {
  return (
    <article className="group relative flex gap-3 rounded-ui px-2 py-1.5 transition-colors hover:bg-bg-hover">
      <PersonAvatar client={client} id={author} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold">{client.nameOf(author)}</span>
          <span className="text-[11px] text-fg-subtle" title={dateTime(at)}>
            {relativeTime(at)}
          </span>
        </p>
        {quote && <Quoted {...quote} />}
        <p className="whitespace-pre-wrap break-words text-[13.5px]">{text}</p>
      </div>
      <Actions actions={{ onQuote }} />
    </article>
  );
}
