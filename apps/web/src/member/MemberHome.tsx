import { AtSign, Hash, Inbox, Lock, Radio, SquareCheckBig, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Count, PageHeader, Panel } from "../components/ui";
import { relativeTime } from "../lib/format";
import { channelKey, directKey, type MemberClient } from "./client";
import { PersonAvatar } from "./MemberMessage";
import { dayOf, sessionTitle } from "./MemberSessions";
import { channelName, channelsOf, type MemberProject, type MemberTask } from "./model";

const WEEK = 7 * 86_400_000;

const Empty = ({ text }: { text: string }) => <p className="text-[12.5px] text-fg-subtle">{text}</p>;

const itemButton = "flex w-full items-start gap-2 rounded-ui px-2 py-1.5 text-start text-[13px] hover:bg-bg-hover";

/** Cards given to me or that I took, not done yet, across every project. */
export function myCards(client: MemberClient): { project: MemberProject; task: MemberTask }[] {
  const me = client.me()?.id;
  return [...client.projects.values()].flatMap((project) =>
    [...project.tasks.values()]
      .filter(
        (task) =>
          !task.deleted &&
          task.status !== "done" &&
          ((task.assignee?.kind === "person" && task.assignee.id === me) || task.claimedBy?.id === me),
      )
      .map((task) => ({ project, task })),
  );
}

function Assigned({ client, go }: { client: MemberClient; go: (to: string) => void }) {
  const { t } = useTranslation();
  const cards = myCards(client);
  return (
    <Panel icon={SquareCheckBig} title={t("member.assigned")}>
      {cards.length === 0 && <Empty text={t("member.assignedNone")} />}
      {cards.map(({ project, task }) => (
        <button key={task.id} type="button" className={itemButton} onClick={() => go(`project/${project.key}/board`)}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{task.title}</span>
            <span className="text-[11.5px] text-fg-subtle">{project.name}</span>
          </span>
          <Badge>{t(`board.col_${task.status}`)}</Badge>
        </button>
      ))}
    </Panel>
  );
}

function Mentions({ client, go }: { client: MemberClient; go: (to: string) => void }) {
  const { t } = useTranslation();
  const list = [...client.projects.values()]
    .flatMap((p) =>
      [...p.comments.values()].filter((c) => c.targetKind === "channel" && client.mentionsMe(c)).map((c) => ({ p, c })),
    )
    .sort((a, b) => b.c.at - a.c.at)
    .slice(0, 12);
  return (
    <Panel icon={AtSign} title={t("member.mentions")}>
      {list.length === 0 && <Empty text={t("member.mentionsNone")} />}
      {list.map(({ p, c }) => {
        const key = channelKey(p.key, c.targetId);
        const fresh = c.at > client.readMark(key);
        return (
          <button key={c.id} type="button" className={itemButton} onClick={() => go(`chat/${key}`)}>
            <PersonAvatar client={client} id={c.authorId} size={22} />
            <span className="min-w-0 flex-1">
              <span className={fresh ? "font-semibold" : "font-medium"}>{c.author}</span>{" "}
              <span className="text-[11.5px] text-fg-subtle">
                #{channelName(c.targetId)} · {relativeTime(c.at)}
              </span>
              <span className="line-clamp-2 block text-fg-muted">{c.text}</span>
            </span>
          </button>
        );
      })}
    </Panel>
  );
}

/** Conversations with something I have not read, channels and direct talks alike. */
function Unread({ client, go }: { client: MemberClient; go: (to: string) => void }) {
  const { t } = useTranslation();
  const channels = [...client.projects.values()].flatMap((p) =>
    channelsOf(p)
      .map((c) => ({
        key: channelKey(p.key, c.id),
        name: `#${c.name}`,
        sub: p.name,
        n: client.unreadIn(p, c.id),
        dm: false,
      }))
      .filter((x) => x.n > 0),
  );
  const direct = [...client.members.keys()]
    .map((id) => ({ key: directKey(id), name: client.nameOf(id), sub: "", n: client.unreadDirect(id), dm: true }))
    .filter((x) => x.n > 0);
  const all = [...direct, ...channels];
  return (
    <Panel icon={Inbox} title={t("member.unread")}>
      {all.length === 0 && <Empty text={t("member.unreadNone")} />}
      {all.map((x) => (
        <button key={x.key} type="button" className={itemButton} onClick={() => go(`chat/${x.key}`)}>
          {x.dm ? (
            <Lock size={14} className="mt-0.5 text-fg-subtle" aria-hidden="true" />
          ) : (
            <Hash size={14} className="mt-0.5 text-fg-subtle" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {x.name} {x.sub && <span className="text-[11.5px] font-normal text-fg-subtle">{x.sub}</span>}
          </span>
          <Count n={x.n} />
        </button>
      ))}
    </Panel>
  );
}

/** Teammates working in Igrek right now, and on what. */
export function LiveNow({ client, project }: { client: MemberClient; project?: string }) {
  const { t } = useTranslation();
  const now = client.working(project);
  return (
    <Panel icon={Radio} title={t("member.liveNow")}>
      {now.length === 0 && <Empty text={t("member.liveNone")} />}
      {now.map((w) => (
        <p key={`${w.userId}:${w.project}`} className="flex items-start gap-2 px-2 text-[13px]">
          <PersonAvatar client={client} id={w.userId} size={22} />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{client.nameOf(w.userId)}</span>{" "}
            <span className="text-fg-muted">{w.title || w.tool}</span>
            <span className="block text-[11.5px] text-fg-subtle">
              {client.projects.get(w.project)?.name} · {w.tool}
              {w.files.length > 0 && ` · ${w.files.slice(-2).join(", ")}`}
            </span>
          </span>
        </p>
      ))}
    </Panel>
  );
}

/** Who worked on what, day by day, over the last week: sessions and finished cards. */
function TeamFeed({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const since = Date.now() - WEEK;
  const items = [...client.projects.values()]
    .flatMap((p) => [
      ...[...p.sessions.values()]
        .filter((s) => s.updatedAt > since)
        .map((s) => ({
          id: s.id,
          who: s.authorId,
          at: s.updatedAt,
          text: sessionTitle(s, t("member.untitled")),
          project: p.name,
          done: false,
        })),
      ...[...p.tasks.values()]
        .filter((x) => !x.deleted && x.status === "done" && x.updatedAt > since)
        .map((x) => ({
          id: x.id,
          who: x.claimedBy?.id ?? "",
          at: x.updatedAt,
          text: x.title,
          project: p.name,
          done: true,
        })),
    ])
    .sort((a, b) => b.at - a.at);
  const days = new Map<string, typeof items>();
  for (const item of items) {
    const day = dayOf(item.at, t);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return (
    <Panel icon={Users} title={t("member.feed")}>
      {items.length === 0 && <Empty text={t("member.feedNone")} />}
      {[...days].map(([day, list]) => (
        <section key={day} className="space-y-1">
          <h3 className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{day}</h3>
          {list.map((x) => (
            <p key={x.id} className="flex items-start gap-2 px-2 text-[13px]">
              {x.who ? (
                <PersonAvatar client={client} id={x.who} size={20} />
              ) : (
                <SquareCheckBig size={16} className="text-success" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                {x.who && <span className="font-medium">{client.nameOf(x.who)} </span>}
                {x.done && <Badge tone="success">{t("member.finished")}</Badge>}{" "}
                <span className="text-fg-muted">{x.text}</span>
                <span className="block text-[11.5px] text-fg-subtle">
                  {x.project} · {relativeTime(x.at)}
                </span>
              </span>
            </p>
          ))}
        </section>
      ))}
    </Panel>
  );
}

/** The first page: what is for me (cards, mentions, unread), who is working now, and the team's week. */
export function MemberHome({ client, go }: { client: MemberClient; go: (to: string) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("member.hello", { name: client.me()?.displayName ?? "" })} />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Assigned client={client} go={go} />
          <Unread client={client} go={go} />
          <Mentions client={client} go={go} />
          <LiveNow client={client} />
        </div>
        <TeamFeed client={client} />
      </div>
    </>
  );
}
