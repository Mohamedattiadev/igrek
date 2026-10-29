import { canAnnounce, type OrgPost, seesAnnouncement } from "@igrek/core";
import { Bot, CheckCheck, Hash, Megaphone, Pencil, Send, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { TeamAvatar } from "../TeamAvatar";
import { Badge, Button } from "../ui";
import { nameOf, type OrgApi, type OrgView, teamName } from "./api";

/** What the bot said, in the reader's language: a text key and its values. */
export function BotText({ say, view }: { say: NonNullable<OrgPost["say"]>; view: OrgView }) {
  const { t } = useTranslation();
  const vars: Record<string, string | number> = { ...say.vars };
  if (typeof vars.due === "number") vars.due = vars.due ? dateTime(vars.due) : t("org.noDue");
  if (typeof vars.who === "string" && view.people.some((p) => p.id === vars.who)) vars.who = nameOf(view, vars.who);
  if (typeof vars.why === "string" && vars.why) vars.why = t(`orgBot.${vars.why}`, vars);
  return <>{t(`orgBot.${say.key}`, vars)}</>;
}

function Avatar({ view, id, bot }: { view: OrgView; id: string; bot?: boolean }) {
  if (bot)
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Bot size={15} aria-hidden="true" />
      </span>
    );
  const p = view.people.find((x) => x.id === id) ?? {
    id,
    username: id,
    displayName: nameOf(view, id),
    role: "member" as const,
  };
  return <TeamAvatar member={p} size={32} />;
}

/** Who read an announcement, for whoever wrote it (plan.md 20.5). */
function Readers({ view, post }: { view: OrgView; post: OrgPost }) {
  const { t } = useTranslation();
  const read = Object.keys(view.state.reads[post.id] ?? {});
  const names = read.map((id) => nameOf(view, id)).join(", ");
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-subtle" title={names}>
      <CheckCheck size={13} aria-hidden="true" />
      {t("org.readBy", { count: read.length })}
    </span>
  );
}

function PostItem({ api, view, post }: { api?: OrgApi; view: OrgView; post: OrgPost }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string>();
  const mine = post.by === view.me.id && !post.bot;
  const edit = (change: { text?: string; deleted?: boolean }) =>
    void api?.act("org-post-edit", { id: post.id, at: Date.now(), ...change }).then(() => setEditing(undefined));
  return (
    <article className="group relative flex gap-3 rounded-ui px-2 py-1.5 transition-colors hover:bg-bg-hover">
      <Avatar view={view} id={post.by} bot={post.bot} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13.5px] font-semibold">{post.bot ? view.state.bot.name : nameOf(view, post.by)}</span>
          {post.announce && <Badge tone="accent">{t("org.announcement")}</Badge>}
          {post.audience?.length ? (
            <span className="text-[11px] text-fg-subtle">
              {post.audience.map((id) => teamName(view, id)).join(", ")}
            </span>
          ) : null}
          <span className="text-[11px] text-fg-subtle" title={dateTime(post.at)}>
            {relativeTime(post.at)}
          </span>
          {post.editedAt && !post.deleted && <span className="text-[11px] text-fg-subtle">{t("teamChat.edited")}</span>}
        </p>
        {post.deleted ? (
          <p className="text-[13px] text-fg-subtle italic">{t("teamChat.deleted")}</p>
        ) : editing !== undefined ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing.trim()) edit({ text: editing.trim() });
            }}
          >
            <input
              className="h-8 w-full rounded-ui border border-border bg-bg px-2.5 text-[13px] outline-none focus:border-accent"
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(undefined)}
              aria-label={t("teamChat.edit")}
            />
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words text-[13.5px]">
            {post.say ? <BotText say={post.say} view={view} /> : post.text}
          </p>
        )}
        {post.image && <img src={post.image} alt="" className="mt-1.5 max-w-sm rounded-ui border border-border" />}
        {post.announce && post.by === view.me.id && <Readers view={view} post={post} />}
      </div>
      {mine && !post.deleted && api && (
        <div className="absolute -top-3 end-2 hidden gap-0.5 rounded-ui border border-border bg-bg p-0.5 shadow-ui group-focus-within:flex group-hover:flex">
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] hover:bg-bg-hover"
            aria-label={t("teamChat.edit")}
            onClick={() => setEditing(post.text)}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-[12px] hover:bg-bg-hover"
            aria-label={t("teamChat.delete")}
            onClick={() => confirm(t("teamChat.deleteConfirm")) && edit({ deleted: true })}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}

/** A channel's messages, oldest first. */
export function PostList({ api, view, channel }: { api?: OrgApi; view: OrgView; channel: string }) {
  const posts = Object.values(view.state.posts)
    .filter((p) => p.channel === channel)
    .sort((a, b) => a.at - b.at);
  return (
    <div className="space-y-0.5">
      {posts.map((p) => (
        <PostItem key={p.id} api={api} view={view} post={p} />
      ))}
    </div>
  );
}

/** The box to write in: Enter sends, Shift+Enter makes a new line; @name and @team notify. */
export function Writer({
  api,
  view,
  channel,
  placeholder,
  card,
}: {
  api: OrgApi;
  view: OrgView;
  channel: string;
  placeholder: string;
  card?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  if (view.me.role === "viewer" && channel.startsWith("bot:")) return null;
  const send = () => {
    if (!text.trim()) return;
    api
      .post({ channel, text: text.trim(), ...(card ? { card } : {}) })
      .then(() => setText(""))
      .catch((err: Error) => setError(err.message));
  };
  return (
    <div className="space-y-1">
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** A new announcement, to everyone or to chosen teams (only the general manager and the leads). */
function Announce({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<string[]>([]);
  if (!canAnnounce(view.structure, view.me)) return null;
  return (
    <form
      className="space-y-2 rounded-ui border border-border bg-bg p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim())
          void api.post({ channel: "general", text: text.trim(), announce: true, audience }).then(() => setText(""));
      }}
    >
      <textarea
        style={{ minHeight: 64 }}
        className="w-full rounded-ui border border-border bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("org.announcePlaceholder")}
        aria-label={t("org.announcePlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-fg-muted">{audience.length ? t("org.toTeams") : t("org.toEveryone")}</span>
        {view.structure.teams.map((x) => (
          <label key={x.id} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={audience.includes(x.id)}
              onChange={(e) => setAudience((a) => (e.target.checked ? [...a, x.id] : a.filter((id) => id !== x.id)))}
            />
            {x.name}
          </label>
        ))}
        <span className="flex-1" />
        <Button type="submit" variant="primary" icon={Megaphone} disabled={!text.trim()}>
          {t("org.announce")}
        </Button>
      </div>
    </form>
  );
}

/** Announcements I may see; opening the list marks them read for their writer to see. */
function Announcements({ api, view }: { api: OrgApi; view: OrgView }) {
  const list = Object.values(view.state.posts)
    .filter((p) => p.announce && !p.deleted && seesAnnouncement(view.structure, p, view.me))
    .sort((a, b) => b.at - a.at);
  const unread = list.filter((p) => p.by !== view.me.id && !view.state.reads[p.id]?.[view.me.id]).map((p) => p.id);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new unread announcement is the reason to mark it
  useEffect(() => {
    for (const id of unread) void api.act("org-read", { id, at: Date.now() });
  }, [unread.join()]);
  return (
    <div className="space-y-3">
      <Announce api={api} view={view} />
      {list.map((p) => (
        <PostItem key={p.id} api={api} view={view} post={p} />
      ))}
    </div>
  );
}

/** Channels a person can be in: the company's, each team's, two teams' shared ones, and the bot. */
function channelsFor(view: OrgView): { id: string; label: string; icon: typeof Hash }[] {
  const me = view.me.id;
  const pairs = new Set(
    Object.values(view.state.posts)
      .filter((p) => p.channel.startsWith("pair:"))
      .map((p) => p.channel),
  );
  const mine = view.structure.teams.filter((x) => x.members.includes(me));
  return [
    { id: "announcements", label: "", icon: Megaphone },
    { id: "general", label: "genel", icon: Hash },
    ...[...mine, ...view.structure.teams.filter((x) => !x.members.includes(me))].map((x) => ({
      id: `team:${x.id}`,
      label: x.name.toLowerCase(),
      icon: Hash,
    })),
    ...[...pairs].map((id) => ({
      id,
      label: id
        .slice(5)
        .split("|")
        .map((x) => teamName(view, x))
        .join(" + "),
      icon: Users,
    })),
    { id: `bot:${me}`, label: view.state.bot.name, icon: Bot },
  ];
}

/** Two teams' shared talk: picked from a list, made by its first message. */
function NewPair({ view, onPick }: { view: OrgView; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const teams = view.structure.teams;
  if (teams.length < 2) return null;
  const select = (value: string, set: (v: string) => void) => (
    <select
      className="h-8 rounded-ui border border-border bg-bg px-2 text-[12px]"
      value={value}
      onChange={(e) => set(e.target.value)}
      aria-label={t("org.teams")}
    >
      <option value="">-</option>
      {teams.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 pt-2 text-[12px]">
      {select(a, setA)}+{select(b, setB)}
      <Button size="sm" disabled={!a || !b || a === b} onClick={() => onPick(`pair:${[a, b].sort().join("|")}`)}>
        {t("org.openPair")}
      </Button>
    </div>
  );
}

/** The company's channels (plan.md 20.4): #genel, a channel per team, two teams together, announcements, the bot. */
export function OrgChannels({ api, view, start }: { api: OrgApi; view: OrgView; start?: string }) {
  const { t } = useTranslation();
  const list = channelsFor(view);
  const [picked, setPicked] = useState(start ?? "general");
  const channel = list.find((c) => c.id === picked) ?? { id: picked, label: picked, icon: Users };
  return (
    <div className="flex min-h-96 overflow-hidden rounded-xl border border-border bg-bg">
      <nav
        aria-label={t("teamChat.channels")}
        className="w-48 shrink-0 overflow-y-auto border-e border-border bg-bg-subtle p-2"
      >
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setPicked(c.id)}
            aria-current={c.id === picked ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-ui px-2 py-1 text-start text-[13px]",
              c.id === picked ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover",
            )}
          >
            <c.icon size={13} aria-hidden="true" />
            <span className="truncate">{c.id === "announcements" ? t("org.announcements") : c.label}</span>
          </button>
        ))}
        <NewPair view={view} onPick={setPicked} />
      </nav>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 text-[13.5px] font-semibold">
          <channel.icon size={14} className="text-fg-subtle" aria-hidden="true" />
          {picked === "announcements" ? t("org.announcements") : channel.label}
          {picked.startsWith("bot:") && (
            <span className="text-[12px] font-normal text-fg-subtle">
              {t("org.botHint", { handle: view.state.bot.handle })}
            </span>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {picked === "announcements" ? (
            <Announcements api={api} view={view} />
          ) : (
            <PostList api={api} view={view} channel={picked} />
          )}
        </div>
        {picked !== "announcements" && view.me.role !== "viewer" && (
          <div className="p-3 pt-0">
            <Writer
              api={api}
              view={view}
              channel={picked}
              placeholder={t("org.writeTo", { channel: picked === "announcements" ? "" : channel.label })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
