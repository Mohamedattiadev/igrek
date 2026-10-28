import type { ProjectGlance, TeamMember } from "@igrek/core";
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
  };
}

/** The company in the browser (plan.md 20.1): the general manager does not need Igrek installed. */
export function MemberOrg({ client, tab, go }: { client: MemberClient; tab?: string; go: (to: string) => void }) {
  const api: OrgApi = {
    view: orgView(client),
    act: (kind, value) => client.orgAct(kind, value),
    post: (input) => client.orgPost(input),
    teams: (method, path, body) => client.teams(method, path, body),
    openProject: (key) => go(`project/${key}`),
  };
  return <OrgPage api={api} tab={tab} onTab={(next: OrgTab) => go(`org/${next}`)} />;
}
