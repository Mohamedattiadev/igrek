import { Ban, Hash, KanbanSquare, MessageSquareReply, Send, Sparkles, SquareCheckBig, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "../components/ui";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import type { MemberClient, MemberComment, MemberProject } from "./client";
import { MemberReactions } from "./MemberReactions";

/** Every channel this browser knows of: made in Igrek, or seen in a message. */
function channelsOf(project: MemberProject): { id: string; name: string; topic: string }[] {
  const all = new Map(project.channels);
  for (const c of project.comments.values())
    if (c.targetKind === "channel" && !all.has(c.targetId))
      all.set(c.targetId, { id: c.targetId, name: c.targetId.split(":")[1] ?? "general", topic: "" });
  return [...all.values()].sort((a, b) =>
    a.name === "general" ? -1 : b.name === "general" ? 1 : a.name.localeCompare(b.name),
  );
}

function Note({ c }: { c: MemberComment }) {
  const { t } = useTranslation();
  const [, kind, rest = ""] = c.text.match(/^igrek:(task|error):([\s\S]*)$/) ?? [];
  return (
    <p className="flex items-center gap-2 py-1 ps-10 text-[12px] text-fg-subtle">
      <KanbanSquare size={13} className={kind === "error" ? "text-danger" : "text-accent"} aria-hidden="true" />
      {kind === "error" ? t("teamChat.aiFailed", { reason: rest }) : t(`teamChat.task_${rest}`, { who: c.author })}
    </p>
  );
}

/** The message a reply quotes, in a small box above it. */
function Quoted({ project, id }: { project: MemberProject; id: string }) {
  const { t } = useTranslation();
  const q = project.comments.get(id);
  return (
    <span className="mb-1 block max-w-md rounded-ui border-s-[3px] border-accent bg-bg-muted px-2 py-1 text-[12.5px]">
      {q ? (
        <>
          <span className="block font-semibold text-accent">{q.author}</span>
          <span className="line-clamp-2 text-fg-muted">{q.deleted ? t("teamChat.deleted") : q.text}</span>
        </>
      ) : (
        <span className="text-fg-subtle italic">{t("teamChat.quoteMissing")}</span>
      )}
    </span>
  );
}

function Text({ c, project }: { c: MemberComment; project: MemberProject }) {
  const { t } = useTranslation();
  if (c.deleted)
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle italic">
        <Ban size={13} aria-hidden="true" />
        {t("teamChat.deleted")}
      </p>
    );
  return (
    <>
      {c.quoteId && <Quoted project={project} id={c.quoteId} />}
      <p className="whitespace-pre-wrap text-[13.5px]">{c.text}</p>
    </>
  );
}

function Message({
  c,
  client,
  project,
  replies,
  onThread,
}: {
  c: MemberComment;
  client: MemberClient;
  project: MemberProject;
  replies?: number;
  onThread?: () => void;
}) {
  const { t } = useTranslation();
  if (c.bot && /^igrek:(task|error):/.test(c.text)) return <Note c={c} />;
  const task = c.taskId ? project.tasks.get(c.taskId) : undefined;
  return (
    <article className="flex gap-3 rounded-ui px-2 py-1.5 hover:bg-bg-hover">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
          c.bot ? "bg-accent-soft text-accent" : "bg-bg-muted",
        )}
      >
        {c.bot ? <Sparkles size={15} /> : c.author.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-semibold">
            {c.bot ? t("teamChat.aiFor", { name: c.author }) : c.author}
          </span>
          {c.bot && <Badge tone="accent">{t("teamChat.aiBadge")}</Badge>}
          <span className="text-[11px] text-fg-subtle">{relativeTime(c.at)}</span>
          {c.editedAt && !c.deleted && <span className="text-[11px] text-fg-subtle">{t("teamChat.edited")}</span>}
        </p>
        <Text c={c} project={project} />
        {task && (
          <span className="mt-1.5 inline-flex items-center gap-2 rounded-ui border border-border px-2.5 py-1 text-[12.5px]">
            <SquareCheckBig size={13} className="text-accent" aria-hidden="true" />
            {task.title}
            <Badge>{t(`teamChat.status_${task.status}`)}</Badge>
          </span>
        )}
        {!!replies && (
          <button
            type="button"
            onClick={onThread}
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
            canReact={client.state.phase === "ready" && client.state.user.role !== "viewer"}
          />
        )}
      </div>
      {onThread && !replies && (
        <button
          type="button"
          onClick={onThread}
          aria-label={t("teamChat.reply")}
          className="self-start rounded p-1 text-fg-subtle hover:bg-bg-active"
        >
          <MessageSquareReply size={14} aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

function Writer({
  placeholder,
  onSend,
  disabled,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  if (disabled) return null;
  const send = () => {
    if (text.trim()) void onSend(text.trim()).then(() => setText(""));
  };
  return (
    <div className="flex items-end gap-2 rounded-xl border border-border bg-bg px-3 py-2 focus-within:border-accent">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[13.5px] outline-none"
      />
      <Button
        size="sm"
        variant="primary"
        icon={Send}
        disabled={!text.trim()}
        onClick={send}
        aria-label={t("teamChat.send")}
      />
    </div>
  );
}

/**
 * The team chat in the browser: the same channels and threads as in Igrek. Asking @ai works from
 * Igrek on a computer (it answers with that person's own Claude); here messages are read and written.
 */
export function MemberChat({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const channels = channelsOf(project);
  const [picked, setPicked] = useState<string>();
  const [thread, setThread] = useState<string>();
  const viewer = client.state.phase === "ready" && client.state.user.role === "viewer";
  const channel = channels.find((c) => c.id === picked) ?? channels[0];
  if (!channel) return <p className="py-8 text-center text-[13px] text-fg-subtle">{t("member.noChannels")}</p>;
  const inChannel = [...project.comments.values()]
    .filter((c) => c.targetKind === "channel" && c.targetId === channel.id)
    .sort((a, b) => a.at - b.at);
  const top = inChannel.filter((c) => !c.parentId);
  const repliesTo = (id: string) => inChannel.filter((c) => c.parentId === id);
  const root = thread ? inChannel.find((c) => c.id === thread) : undefined;
  const post = (text: string, parentId?: string) => client.comment(project.key, "channel", channel.id, text, parentId);
  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-80 overflow-hidden rounded-xl border border-border bg-bg">
      <nav
        aria-label={t("teamChat.channels")}
        className="hidden w-48 shrink-0 border-e border-border bg-bg-subtle p-2 sm:block"
      >
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setPicked(c.id);
              setThread(undefined);
            }}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-ui px-2 py-1 text-start text-[13px]",
              c.id === channel.id ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover",
            )}
          >
            <Hash size={13} aria-hidden="true" /> <span className="truncate">{c.name}</span>
          </button>
        ))}
      </nav>
      <section className={cn("min-w-0 flex-1 flex-col", root ? "hidden lg:flex" : "flex")}>
        <header className="flex h-11 items-center gap-2 border-b border-border px-4 text-[13.5px] font-semibold">
          <Hash size={14} className="text-fg-subtle" aria-hidden="true" /> {channel.name}
          {channel.topic && <span className="truncate text-[12.5px] font-normal text-fg-subtle">{channel.topic}</span>}
        </header>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {top.map((c) => (
            <Message
              key={c.id}
              c={c}
              client={client}
              project={project}
              replies={repliesTo(c.id).length}
              onThread={() => setThread(c.id)}
            />
          ))}
        </div>
        <div className="p-3 pt-0">
          <Writer
            placeholder={t("teamChat.placeholder", { channel: channel.name })}
            disabled={viewer}
            onSend={(text) => post(text)}
          />
        </div>
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
            <Message c={root} client={client} project={project} />
            {repliesTo(root.id).map((c) => (
              <Message key={c.id} c={c} client={client} project={project} />
            ))}
          </div>
          <div className="p-3 pt-0">
            <Writer
              placeholder={t("teamChat.replyPlaceholder")}
              disabled={viewer}
              onSend={(text) => post(text, root.id)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
