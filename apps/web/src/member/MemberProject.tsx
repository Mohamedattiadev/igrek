import { History, MousePointerClick, SquareCheckBig } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Card, PageHeader, Segmented, TabBar } from "../components/ui";
import { relativeTime } from "../lib/format";
import type { MemberClient } from "./client";
import { BoardView } from "./MemberBoard";
import { MemberComments } from "./MemberComments";
import { LiveNow } from "./MemberHome";
import { PersonAvatar } from "./MemberMessage";
import { SessionList, SessionView, sessionTitle } from "./MemberSessions";
import type { MemberComment, MemberProject } from "./model";

type Tab = "overview" | "sessions" | "board" | "decisions";

/** A note on a part of a screen (plan.md 19.5): its target is the picked element's description. */
function elementOf(c: MemberComment): { url: string; text?: string; tag?: string } | undefined {
  try {
    const v = JSON.parse(c.targetId) as { url?: unknown; text?: unknown; tag?: unknown };
    return typeof v.url === "string"
      ? { url: v.url, text: typeof v.text === "string" ? v.text : undefined, tag: String(v.tag ?? "") }
      : undefined;
  } catch {
    return undefined;
  }
}

function ScreenNotes({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const notes = [...project.comments.values()]
    .filter((c) => c.targetKind === "ui" && !c.deleted)
    .map((c) => ({ c, el: elementOf(c) }))
    .filter((n) => n.el)
    .sort((a, b) => b.c.at - a.c.at);
  return (
    <Card className="space-y-2 p-4">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <MousePointerClick size={15} className="text-accent" aria-hidden="true" /> {t("member.screenNotes")}
      </h2>
      {notes.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("member.screenNotesNone")}</p>}
      {notes.map(({ c, el }) => (
        <div key={c.id} className="flex items-start gap-2 text-[13px]">
          <PersonAvatar client={client} id={c.authorId} size={22} />
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap">{c.text}</p>
            <p className="truncate text-[11.5px] text-fg-subtle">
              {el?.text ? `"${el.text}"` : `<${el?.tag}>`} · {el?.url} · {c.author} · {relativeTime(c.at)}
            </p>
          </div>
        </div>
      ))}
    </Card>
  );
}

function Overview({
  client,
  project,
  onSession,
}: {
  client: MemberClient;
  project: MemberProject;
  onSession: (id: string) => void;
}) {
  const { t } = useTranslation();
  const open = [...project.tasks.values()]
    .filter((x) => !x.deleted && x.status !== "done")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = [...project.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
          <SquareCheckBig size={15} className="text-accent" aria-hidden="true" /> {t("member.openCards")}
        </h2>
        {open.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("member.openCardsNone")}</p>}
        {open.slice(0, 12).map((task) => (
          <p key={task.id} className="flex items-center gap-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
            {(task.claimedBy ?? task.assignee) && (
              <span className="text-[11.5px] text-fg-subtle">{task.claimedBy?.name ?? task.assignee?.name}</span>
            )}
            <Badge>{t(`board.col_${task.status}`)}</Badge>
          </p>
        ))}
      </Card>
      <LiveNow client={client} project={project.key} />
      <Card className="space-y-1 p-4">
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
          <History size={15} className="text-accent" aria-hidden="true" /> {t("member.recent")}
        </h2>
        {recent.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("member.nothingYet")}</p>}
        {recent.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSession(s.id)}
            className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
          >
            <PersonAvatar client={client} id={s.authorId} size={20} />
            <span className="min-w-0 flex-1 truncate">{sessionTitle(s, t("member.untitled"))}</span>
            <span className="shrink-0 text-[11.5px] text-fg-subtle">{relativeTime(s.updatedAt)}</span>
          </button>
        ))}
      </Card>
      <ScreenNotes client={client} project={project} />
    </div>
  );
}

/** The project's decisions; each can be commented on, as in Igrek (plan.md 20.3: comments on decisions). */
function Decisions({ client, project }: { client: MemberClient; project: MemberProject }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string>();
  const items = [...project.memory.values()]
    .filter((m) => m.status !== "rejected")
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const count = (id: string) =>
    [...project.comments.values()].filter((c) => c.targetKind === "memory" && c.targetId === id).length;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg">
      {items.map((m) => (
        <li key={m.id} className="space-y-2 px-4 py-2.5 text-[13px]">
          <div className="flex items-start gap-2">
            <Badge>{t(`memory.${m.section}`, { defaultValue: m.section })}</Badge>
            <span className="min-w-0 flex-1">{m.text}</span>
            <span className="shrink-0 text-[11px] text-fg-subtle">{m.author}</span>
            <button
              type="button"
              className="shrink-0 text-[12px] text-accent hover:underline"
              onClick={() => setOpen((o) => (o === m.id ? undefined : m.id))}
            >
              {t("member.comments")} {count(m.id) > 0 && `(${count(m.id)})`}
            </button>
          </div>
          {open === m.id && <MemberComments client={client} project={project} kind="memory" id={m.id} />}
        </li>
      ))}
      {items.length === 0 && <li className="px-4 py-6 text-center text-xs text-fg-subtle">{t("member.nothingYet")}</li>}
    </ul>
  );
}

/** A project in the browser (plan.md 20.1): an overview first, then its sessions, board and decisions. */
export function MemberProjectPage({
  client,
  project,
  tab = "overview",
  onTab,
}: {
  client: MemberClient;
  project: MemberProject;
  tab?: string;
  onTab: (tab: Tab) => void;
}) {
  const { t } = useTranslation();
  const [session, setSession] = useState<string>();
  const current = (["overview", "sessions", "board", "decisions"] as const).find((x) => x === tab) ?? "overview";
  const open = [...project.tasks.values()].filter((x) => !x.deleted && x.status !== "done").length;
  return (
    <>
      <PageHeader
        title={project.name}
        actions={
          <span className="text-[12.5px] text-fg-subtle">
            {t("member.stats", { sessions: project.sessions.size, count: open })}
          </span>
        }
      />
      {!session && (
        <TabBar>
          <Segmented
            label={project.name}
            value={current}
            onChange={onTab}
            options={[
              { value: "overview", label: t("member.overview") },
              { value: "sessions", label: t("member.sessions") },
              { value: "board", label: t("member.board") },
              { value: "decisions", label: t("member.decisions") },
            ]}
          />
        </TabBar>
      )}
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
        {session ? (
          <SessionView client={client} project={project} id={session} onBack={() => setSession(undefined)} />
        ) : (
          <>
            {current === "overview" && <Overview client={client} project={project} onSession={setSession} />}
            {current === "sessions" && <SessionList project={project} onOpen={setSession} />}
            {current === "board" && <BoardView client={client} project={project} />}
            {current === "decisions" && <Decisions client={client} project={project} />}
          </>
        )}
      </div>
    </>
  );
}
