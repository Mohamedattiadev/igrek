import type { ProjectGlance, TeamMember, TimelineItem } from "@igrek/core";
import type { OrgApi, OrgView } from "../components/org/api";
import { OrgPage, type OrgTab } from "../components/org/OrgPage";
import type { MemberClient } from "./client";

const WEEK = 7 * 86_400_000;
const OPEN = ["open", "accepted", "doing", "review"];

/** Each project at a glance, from what this browser decrypted: its board, its sessions and the company's cards. */
function glances(client: MemberClient): ProjectGlance[] {
  const week = Date.now() - WEEK;
  const cards = Object.values(client.org.cards);
  return [...client.projects.values()].map((p) => {
    const tasks = [...p.tasks.values()].filter((x) => !x.deleted);
    const mine = cards.filter((c) => c.project === p.key);
    const last = [...p.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return {
      key: p.key,
      name: p.name,
      teams: client.structure.teams.filter((t) => t.projects.includes(p.key)).map((t) => t.id),
      open: tasks.filter((x) => x.status !== "done").length + mine.filter((c) => OPEN.includes(c.status)).length,
      overdue: mine.filter((c) => c.due && c.due < Date.now() && OPEN.includes(c.status)).length,
      doneWeek:
        tasks.filter((x) => x.status === "done" && x.updatedAt > week).length +
        mine.filter((c) => c.status === "done" && c.updatedAt > week).length,
      doing: tasks.filter((x) => x.status === "doing").length + mine.filter((c) => c.status === "doing").length,
      ...(last ? { lastWorkAt: last.updatedAt, lastWorkBy: last.author } : {}),
      sessionsWeek: [...p.sessions.values()].filter((s) => s.updatedAt > week).length,
    };
  });
}

/** The projects' part of the timeline from what this browser decrypted: sessions, decisions, chat. */
function history(client: MemberClient): TimelineItem[] {
  return [...client.projects.values()].flatMap((p) => [
    ...[...p.sessions.values()].map((s) => ({
      id: `session:${s.id}`,
      at: s.updatedAt,
      kind: "session" as const,
      who: s.authorId,
      text: s.summary?.title || s.title || s.firstPrompt?.slice(0, 120) || "",
      project: p.key,
    })),
    ...[...p.memory.values()]
      .filter((m) => m.status !== "rejected" && (m.section === "decision" || m.section === "convention"))
      .map((m) => ({
        id: `decision:${m.id}`,
        at: m.updatedAt,
        kind: "decision" as const,
        who: m.author,
        text: m.text,
        project: p.key,
      })),
    ...[...p.comments.values()]
      .filter((c) => c.targetKind === "channel" && !c.bot && !c.deleted)
      .map((c) => ({
        id: `message:${c.id}`,
        at: c.at,
        kind: "message" as const,
        who: c.authorId,
        text: c.text,
        project: p.key,
        link: `channel:${c.targetId}`,
      })),
  ]);
}

/** The company's view, as Igrek's server would give it, made in the browser. */
function orgView(client: MemberClient): OrgView | undefined {
  const me = client.me();
  if (!me) return undefined;
  const people: TeamMember[] = [...client.members.values()];
  return {
    me: { ...me, ...(client.members.get(me.id)?.generalManager ? { generalManager: true } : {}) },
    people,
    online: [...client.online],
    structure: client.structure,
    state: client.org,
    waiting: client.waiting(),
    projects: glances(client),
    live: client.working().map((w) => ({ userId: w.userId, project: w.project, title: w.title ?? "", tool: w.tool })),
    history: history(client),
  };
}

/** The company in the browser (plan.md 20.1): the general manager does not need Igrek installed. */
export function MemberOrg({
  client,
  tab,
  meeting,
  go,
}: {
  client: MemberClient;
  tab?: string;
  meeting?: string;
  go: (to: string) => void;
}) {
  const api: OrgApi = {
    view: orgView(client),
    act: (kind, value) => client.orgAct(kind, value),
    post: (input) => client.orgPost(input),
    teams: (method, path, body) => client.teams(method, path, body),
    openProject: (key) => go(`project/${key}`),
    call: { send: (msg) => client.callSend(msg), subscribe: (fn) => client.onCall(fn) },
    guestLink: (room) => client.guestLink(room),
    hubUrl: location.origin,
  };
  return <OrgPage api={api} tab={tab} meeting={meeting} onTab={(next: OrgTab) => go(`org/${next}`)} />;
}
