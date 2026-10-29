import { changeCard, isManager, isOpen, isOverdue, loadOf, type OrgTeam } from "@igrek/core";
import { Crown, Plus, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { Badge, Button, Card, field } from "../ui";
import { nameOf, type OrgApi, type OrgView } from "./api";

const box = cn(field, "w-full");

/** A team's people with how much each holds now and finished this week: what its lead looks at. */
function Workload({ view, team }: { view: OrgView; team: OrgTeam }) {
  const { t } = useTranslation();
  const week = Date.now() - 7 * 86_400_000;
  const cards = Object.values(view.state.cards);
  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-start text-[11px] text-fg-subtle">
          <th className="py-1 text-start font-medium">{t("org.person")}</th>
          <th className="py-1 text-end font-medium">{t("org.holdsNow")}</th>
          <th className="py-1 text-end font-medium">{t("org.late")}</th>
          <th className="py-1 text-end font-medium">{t("org.doneWeek")}</th>
        </tr>
      </thead>
      <tbody>
        {team.members.map((m) => (
          <tr key={m} className="border-t border-border">
            <td className="py-1">
              {nameOf(view, m)}{" "}
              {team.leadId === m && <Crown size={12} className="inline text-warning" aria-label={t("org.lead")} />}
            </td>
            <td className="py-1 text-end tabular-nums">{loadOf(view.state, m)}</td>
            <td className="py-1 text-end tabular-nums">
              {cards.filter((c) => c.assignee === m && isOverdue(c)).length}
            </td>
            <td className="py-1 text-end tabular-nums">
              {cards.filter((c) => c.assignee === m && c.status === "done" && c.updatedAt > week).length}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamCard({ api, view, team, runs }: { api: OrgApi; view: OrgView; team: OrgTeam; runs: boolean }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const leads = team.leadId === view.me.id;
  const call = (method: string, path: string, body?: unknown) =>
    void api.teams(method, path, body).catch((err: Error) => setError(err.message));
  const queue = Object.values(view.state.cards).filter((c) => c.team === team.id && !c.assignee && isOpen(c)).length;
  // Whoever leaves the team hands its open cards back to its queue (plan.md 20.5), for the lead to give on.
  const leave = (m: string) => {
    call("DELETE", `teams/${team.id}/members/${m}`);
    for (const c of Object.values(view.state.cards))
      if (c.team === team.id && c.assignee === m && isOpen(c))
        void api.act(
          "org-card",
          changeCard(c, { assignee: undefined, status: "open" }, view.me.id, "handed back") as unknown as Record<
            string,
            unknown
          >,
        );
  };
  const others = view.people.filter((p) => !team.members.includes(p.id));
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{team.name}</h3>
          <p className="text-[12.5px] text-fg-muted">{team.description || t("org.noDescription")}</p>
        </div>
        {queue > 0 && <Badge tone="warning">{t("org.inQueue", { count: queue })}</Badge>}
        {runs && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            aria-label={t("org.removeTeam")}
            onClick={() => confirm(t("org.removeTeamConfirm")) && call("DELETE", `teams/${team.id}`)}
          />
        )}
      </div>
      <Workload view={view} team={team} />
      {(runs || leads) && (
        <div className="flex flex-wrap gap-2">
          {runs && (
            <select
              className={box}
              style={{ width: 200 }}
              value={team.leadId ?? ""}
              onChange={(e) => call("PATCH", `teams/${team.id}`, { leadId: e.target.value })}
              aria-label={t("org.lead")}
            >
              <option value="">{t("org.noLead")}</option>
              {team.members.map((m) => (
                <option key={m} value={m}>
                  {t("org.leadIs", { who: nameOf(view, m) })}
                </option>
              ))}
            </select>
          )}
          <select
            className={box}
            style={{ width: 200 }}
            value=""
            onChange={(e) => e.target.value && call("PUT", `teams/${team.id}/members/${e.target.value}`)}
            aria-label={t("org.addPerson")}
          >
            <option value="">{t("org.addPerson")}</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.username}
              </option>
            ))}
          </select>
        </div>
      )}
      {(runs || leads) && team.members.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {team.members.map((m) => (
            <button
              key={m}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[12px] hover:border-danger"
              onClick={() => confirm(t("org.removePersonConfirm", { who: nameOf(view, m) })) && leave(m)}
              aria-label={t("org.removePerson", { who: nameOf(view, m) })}
            >
              {nameOf(view, m)} <UserMinus size={12} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{t("org.projects")}</p>
        <div className="flex flex-wrap gap-2 text-[12.5px]">
          {view.projects.map((p) => (
            <label key={p.key} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                disabled={!runs}
                checked={team.projects.includes(p.key)}
                onChange={(e) => call(e.target.checked ? "PUT" : "DELETE", `teams/${team.id}/projects/${p.key}`)}
              />
              {p.name}
            </label>
          ))}
          {view.projects.length === 0 && <span className="text-fg-subtle">{t("org.noProjects")}</span>}
        </div>
        {runs && <p className="text-[11.5px] text-fg-subtle">{t("org.projectsHint")}</p>}
      </div>
      {leads && <WeekToManager api={api} view={view} team={team} />}
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}

/** The lead's week, sent to the general manager's conversation in one message (plan.md 20.5). */
function WeekToManager({ api, view, team }: { api: OrgApi; view: OrgView; team: OrgTeam }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const week = Date.now() - 7 * 86_400_000;
  const cards = Object.values(view.state.cards).filter(
    (c) => c.team === team.id || (!!c.assignee && team.members.includes(c.assignee)),
  );
  const list = (xs: typeof cards) => xs.map((c) => c.title).join("; ") || "-";
  const text = t("org.weekText", {
    team: team.name,
    done: list(cards.filter((c) => c.status === "done" && c.updatedAt > week)),
    doing: list(cards.filter((c) => c.status === "doing")),
    late: list(cards.filter((c) => isOverdue(c))),
  });
  if (!view.structure.generalManagers.length) return null;
  return (
    <Button
      size="sm"
      disabled={sent}
      onClick={() =>
        void Promise.all(view.structure.generalManagers.map((gm) => api.post({ channel: `bot:${gm}`, text }))).then(
          () => setSent(true),
        )
      }
    >
      {sent ? t("org.weekSent") : t("org.sendWeek")}
    </Button>
  );
}

function NewTeam({ api }: { api: OrgApi }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  return (
    <form
      className="grid gap-2 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        api
          .teams("POST", "teams", { name, description })
          .then(() => {
            setName("");
            setDescription("");
            setError(undefined);
          })
          .catch((err: Error) => setError(err.message));
      }}
    >
      <input
        className={box}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("org.teamName")}
        aria-label={t("org.teamName")}
      />
      <input
        className={box}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("org.teamDescription")}
        aria-label={t("org.teamDescription")}
      />
      <Button type="submit" variant="primary" icon={Plus} disabled={!name.trim()}>
        {t("org.newTeam")}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

/** The company's teams (plan.md 20.2): who leads which, who is in which, what each owns. */
export function OrgTeams({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const runs = isManager(view.structure, view.me) || view.me.role === "admin";
  const me = view.me.id;
  const teams = [...view.structure.teams].sort(
    (a, b) => Number(b.members.includes(me)) - Number(a.members.includes(me)),
  );
  return (
    <div className="space-y-4">
      {runs && (
        <Card className="space-y-2 p-4">
          <p className="text-[13px] text-fg-muted">{t("org.teamsIntro")}</p>
          <NewTeam api={api} />
        </Card>
      )}
      {teams.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("org.noTeams")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((team) => (
          <TeamCard key={team.id} api={api} view={view} team={team} runs={runs} />
        ))}
      </div>
    </div>
  );
}
