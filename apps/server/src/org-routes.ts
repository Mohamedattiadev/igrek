import type { Database } from "bun:sqlite";
import { aboutFuture, orgItems, type Presence, type ProjectGlance, type TeamMember, upcoming } from "@igrek/core";
import type { Hono } from "hono";
import { projectHistory } from "./history";
import type { HistorySearch } from "./history-search";
import type { Org } from "./org";

type TaskRow = { project_id: string; status: string; updated_at: number };
type LastRow = { project_id: string; updated_at: number; author_id: string | null; week: number };

const OPEN = ["open", "accepted", "doing", "review"];

/** What the company pages read about each team project on this computer, in two queries for all. */
function glances(
  db: Database,
  projects: { id: string; key: string }[],
  org: Org,
  nameOf: (id: string) => string,
): ProjectGlance[] {
  const week = Date.now() - 7 * 86_400_000;
  const ids = JSON.stringify(projects.map((p) => p.id));
  const tasks = db
    .query(
      "SELECT project_id, status, updated_at FROM board_tasks WHERE deleted = 0 AND project_id IN (SELECT value FROM json_each(?))",
    )
    .all(ids) as TaskRow[];
  // SQLite gives the other columns of the row that has the MAX: the newest session of each project.
  const last = new Map(
    (
      db
        .query(
          `SELECT project_id, MAX(updated_at) AS updated_at, author_id, SUM(updated_at > ?) AS week FROM sessions
           WHERE project_id IN (SELECT value FROM json_each(?)) GROUP BY project_id`,
        )
        .all(week, ids) as LastRow[]
    ).map((r) => [r.project_id, r]),
  );
  const names = new Map(
    (
      db.query("SELECT id, name FROM projects WHERE id IN (SELECT value FROM json_each(?))").all(ids) as {
        id: string;
        name: string;
      }[]
    ).map((r) => [r.id, r.name]),
  );
  return projects.flatMap(({ id, key }) => {
    const name = names.get(id);
    if (!name) return [];
    const mine = tasks.filter((t) => t.project_id === id);
    const cards = Object.values(org.state.cards).filter((c) => c.project === key);
    const l = last.get(id);
    return [
      {
        key,
        name,
        teams: org.structure.teams.filter((t) => t.projects.includes(key)).map((t) => t.id),
        open: mine.filter((t) => t.status !== "done").length + cards.filter((c) => OPEN.includes(c.status)).length,
        overdue: cards.filter((c) => c.due && c.due < Date.now() && OPEN.includes(c.status)).length,
        doneWeek:
          mine.filter((t) => t.status === "done" && t.updated_at > week).length +
          cards.filter((c) => c.status === "done" && c.updatedAt > week).length,
        doing: mine.filter((t) => t.status === "doing").length + cards.filter((c) => c.status === "doing").length,
        ...(l ? { lastWorkAt: l.updated_at, lastWorkBy: l.author_id ? nameOf(l.author_id) : "" } : {}),
        sessionsWeek: l?.week ?? 0,
      },
    ];
  });
}

/**
 * The company's pages in Igrek (plan.md 20.2-20.7): one read of everything, one way to write, and
 * the teams on the hub (made and changed through it, as this person). The hub's web page reads
 * and writes the same company stream itself.
 */
export function registerOrgRoutes(
  app: Hono,
  deps: {
    db: Database;
    org: Org;
    me: () => (TeamMember & { name?: string }) | undefined;
    people: () => TeamMember[];
    online: () => string[];
    presence: () => Presence[];
    projects: () => Promise<{ projectId: string; key: string }[]>;
    hub: <T>(path: string, init?: RequestInit) => Promise<T>;
    summarize: (question: string) => Promise<string>;
    call: (msg: { op: string; room: string; to?: string; data?: string; name?: string }) => boolean;
    /** History questions by words and meaning (history-search.ts). */
    ask?: HistorySearch;
    /** Runs ready to merge and people past their budget, for the manager's "waiting for a yes". */
    approvals?: () => { id: string; title: string; kind: "merge" | "budget"; link?: string }[];
  },
): void {
  const { org } = deps;
  app.get("/api/org", async (c) => {
    const people = deps.people();
    const nameOf = (id: string) => people.find((p) => p.id === id)?.displayName ?? "";
    const projects = (await deps.projects()).map((p) => ({ id: p.projectId, key: p.key }));
    const keys = new Map(projects.map((p) => [p.id, p.key]));
    return c.json({
      me: deps.me() ?? null,
      people,
      online: deps.online(),
      structure: org.structure,
      state: org.state,
      waiting: org.waiting(),
      projects: glances(deps.db, projects, org, nameOf),
      history: projectHistory(deps.db, projects, deps.me()?.id ?? ""),
      approvals: deps.approvals?.() ?? [],
      live: deps
        .presence()
        .map((p) => ({ userId: p.userId, project: keys.get(p.projectId) ?? "", title: p.title ?? "", tool: p.tool })),
    });
  });
  app.post("/api/org/act", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { kind?: string; value?: Record<string, unknown> };
    if (!body.kind?.startsWith("org-") || !body.value) return c.json({ error: "Unknown change" }, 400);
    try {
      return c.json(await org.act(body.kind, body.value));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.post("/api/org/post", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Parameters<Org["post"]>[0];
    if (!body.channel || !body.text?.trim()) return c.json({ error: "Write something first" }, 400);
    try {
      return c.json(await org.post(body));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  // Teams are the hub's: made, changed and removed there, as this person (it checks who may).
  app.all("/api/org/hub/*", async (c) => {
    const rest = c.req.path.replace(/^\/api\/org\/hub\//, "");
    if (!/^teams(\/[0-9a-f]+(\/(members|projects)\/[0-9a-f]+)?)?$/.test(rest))
      return c.json({ error: "Not found" }, 404);
    try {
      const body = c.req.method === "GET" || c.req.method === "DELETE" ? undefined : await c.req.text();
      const out = await deps.hub(`/api/org/${rest}`, { method: c.req.method, ...(body ? { body } : {}) });
      await org.loadStructure();
      return c.json(out);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  // Meetings (plan.md 20.8): the page's call goes to the hub through this computer's connection.
  app.post("/api/org/call", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      op?: string;
      room?: string;
      to?: string;
      data?: string;
      name?: string;
    };
    if (!["join", "leave", "signal"].includes(String(body.op)) || !/^[0-9a-f]{64}$/.test(String(body.room)))
      return c.json({ error: "Unknown call message" }, 400);
    return deps.call({ op: String(body.op), room: String(body.room), to: body.to, data: body.data, name: body.name })
      ? c.json({ ok: true })
      : c.json({ error: "Not connected to the team hub" }, 503);
  });
  // Big calls (plan.md 20.8): whether the hub has a router, and the right to join a room on it.
  app.get("/api/org/sfu", async (c) => c.json(await deps.hub<{ url?: string }>("/api/sfu").catch(() => ({}))));
  app.post("/api/org/sfu-token", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { room?: string };
    try {
      return c.json(await deps.hub("/api/sfu-token", { method: "POST", body: JSON.stringify({ room: body.room }) }));
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  app.post("/api/org/guest-link", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { room?: string };
    try {
      return c.json(
        await deps.hub<{ token: string }>("/api/guest-links", {
          method: "POST",
          body: JSON.stringify({ room: body.room }),
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
  // Questions to the history, by words and by meaning (history-search.ts), from what this computer may read.
  app.post("/api/org/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { question?: string };
    const question = String(body.question ?? "").trim();
    if (!question || !deps.ask) return c.json({ error: "Ask something" }, 400);
    const projects = (await deps.projects()).map((p) => ({ id: p.projectId, key: p.key }));
    const items = [...projectHistory(deps.db, projects, deps.me()?.id ?? ""), ...orgItems(org.state)];
    return c.json(aboutFuture(question) ? upcoming(org.state, question) : await deps.ask.find(items, question));
  });
  app.post("/api/org/summary", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { facts?: string; ask?: string };
    if (!body.facts) return c.json({ error: "Nothing to sum up" }, 400);
    try {
      const answer = await deps.summarize(
        `${body.ask ?? "Sum this up for the general manager"}: in a few short lines, what was done, what is late or at risk, and what is waiting for a decision. Only from these facts:\n\n${body.facts.slice(0, 20_000)}`,
      );
      return c.json({ answer });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });
}
