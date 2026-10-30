import { healthOf, isOpen, isOverdue, newCard, type OrgCard, type ProjectGlance, phaseOf } from "@igrek/core";
import { ExternalLink, FileText, MousePointerClick, Radio, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { Badge, Button, Card, Dialog, field, Panel } from "../ui";
import { nameOf, type OrgApi, type OrgView, teamName } from "./api";
import { CardDetail, NewCard } from "./OrgCards";

const box = cn(field, "w-full");
const RISK = { low: "success", medium: "warning", high: "danger" } as const;

/** A note on a project's preview (plan.md 20.3): it becomes a card in the queue of the team that owns it. */
function PreviewNote({
  api,
  view,
  project,
  onDone,
}: {
  api: OrgApi;
  view: OrgView;
  project: ProjectGlance;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const team = project.teams[0];
  return (
    <form
      className="space-y-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        const card = newCard(
          {
            title: text.trim().slice(0, 120),
            detail: text.trim(),
            ...(team ? { team } : {}),
            project: project.key,
            projectName: project.name,
            origin: "preview",
            ...(url ? { note: { url } } : {}),
          },
          view.me.id,
        );
        void api.act("org-card", card as unknown as Record<string, unknown>).then(onDone);
      }}
    >
      <div className="flex gap-2">
        <input
          className={box}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("org.previewUrl")}
          aria-label={t("org.previewUrl")}
        />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-accent hover:underline"
          >
            <ExternalLink size={13} aria-hidden="true" /> {t("org.openPreview")}
          </a>
        )}
      </div>
      <textarea
        style={{ minHeight: 56 }}
        className={cn(field, "h-auto w-full py-1.5")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("org.notePlaceholder")}
        aria-label={t("org.notePlaceholder")}
      />
      <p className="text-[11.5px] text-fg-subtle">
        {team ? t("org.noteGoesTo", { team: teamName(view, team) }) : t("org.noteNoTeam")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="submit" variant="primary" disabled={!text.trim()}>
          {t("org.leaveNote")}
        </Button>
        {api.testers && (
          <Button
            size="sm"
            disabled={!url}
            onClick={() => void api.testers?.(project.key, url, text.trim() || t("org.testerTask"))}
          >
            {t("org.testWithTesters")}
          </Button>
        )}
      </div>
    </form>
  );
}

function ProjectTile({ api, view, p }: { api: OrgApi; view: OrgView; p: ProjectGlance }) {
  const { t } = useTranslation();
  const [noting, setNoting] = useState(false);
  const health = healthOf(p);
  const working = view.live.filter((l) => l.project === p.key);
  return (
    <Card className="min-w-0 space-y-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold">{p.name}</h3>
          <p className="text-[11.5px] text-fg-subtle">
            {p.teams.map((id) => teamName(view, id)).join(", ") || t("org.noTeam")}
          </p>
        </div>
        <Badge>{t(`org.phase_${phaseOf(p)}`)}</Badge>
        <Badge tone={RISK[health.risk]}>{t("org.health", { score: health.score })}</Badge>
      </div>
      <p className="flex flex-wrap gap-x-3 text-[12.5px] text-fg-muted">
        <span>{t("org.openCount", { count: p.open })}</span>
        {p.overdue > 0 && <span className="text-danger">{t("org.lateCount", { count: p.overdue })}</span>}
        <span>{t("org.doneWeekCount", { count: p.doneWeek })}</span>
      </p>
      <p className="text-[12px] text-fg-subtle">
        {working.length
          ? t("org.workingNow", { who: working.map((w) => nameOf(view, w.userId)).join(", ") })
          : p.lastWorkAt
            ? t("org.lastWork", { who: p.lastWorkBy || "-", when: relativeTime(p.lastWorkAt) })
            : t("org.noWork")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {api.openProject && (
          <Button size="sm" onClick={() => api.openProject?.(p.key)}>
            {t("org.openProject")}
          </Button>
        )}
        {view.me.role !== "viewer" && (
          <Button size="sm" variant="ghost" icon={MousePointerClick} onClick={() => setNoting((v) => !v)}>
            {t("org.tryAndNote")}
          </Button>
        )}
      </div>
      {noting && <PreviewNote api={api} view={view} project={p} onDone={() => setNoting(false)} />}
    </Card>
  );
}

/** The facts a summary is made of: projects, cards that moved, announcements, in the chosen time. */
function factsOf(view: OrgView, since: number, scope: string): string {
  const inScope = (c: OrgCard) =>
    !scope ||
    c.team === scope ||
    c.project === scope ||
    (!!c.assignee && view.structure.teams.find((x) => x.id === scope)?.members.includes(c.assignee));
  const cards = Object.values(view.state.cards).filter((c) => c.updatedAt >= since && inScope(c));
  const lines = [
    ...view.projects
      .filter((p) => !scope || p.key === scope || p.teams.includes(scope))
      .map(
        (p) =>
          `Project ${p.name}: ${p.open} open, ${p.overdue} late, ${p.doneWeek} done this week, phase ${phaseOf(p)}, health ${healthOf(p).score}`,
      ),
    ...cards.map(
      (c) =>
        `Card "${c.title}" (${c.status}) held by ${nameOf(view, c.assignee) || teamName(view, c.team) || "nobody"}${c.due ? `, due ${new Date(c.due).toDateString()}` : ""}${isOverdue(c) ? ", LATE" : ""}: ${c.history
          .filter((h) => h.at >= since)
          .map((h) => `${nameOf(view, h.by)} ${h.what}`)
          .join(", ")}`,
    ),
    ...Object.values(view.state.posts)
      .filter((p) => p.announce && p.at >= since)
      .map((p) => `Announcement by ${nameOf(view, p.by)}: ${p.text}`),
  ];
  return lines.join("\n");
}

/** "Sum it up": the company, a team or a project, for yesterday or this week; by this person's own Claude in Igrek. */
function Summary({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [scope, setScope] = useState("");
  const [answer, setAnswer] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ask = async (days: number, label: string) => {
    const facts = factsOf(view, Date.now() - days * 86_400_000, scope);
    if (!api.summarize) return setAnswer(facts || t("org.nothingMoved"));
    setBusy(true);
    try {
      setAnswer(facts ? await api.summarize(facts, label) : t("org.nothingMoved"));
    } catch (err) {
      setAnswer((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel icon={Sparkles} title={t("org.summary")}>
      <div className="flex flex-wrap gap-2">
        <select
          className={box}
          style={{ width: 200 }}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label={t("org.summaryOf")}
        >
          <option value="">{t("org.wholeCompany")}</option>
          {view.structure.teams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          {view.projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={busy}
          usesModel={!!api.summarize}
          onClick={() => void ask(1, "What happened yesterday")}
        >
          {t("org.yesterday")}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          usesModel={!!api.summarize}
          onClick={() => void ask(7, "What was finished this week and what is left")}
        >
          {t("org.thisWeek")}
        </Button>
      </div>
      {busy && <p className="text-[12.5px] text-fg-subtle">{t("org.summarizing")}</p>}
      {answer && <p className="whitespace-pre-wrap text-[13px]">{answer}</p>}
      {!api.summarize && <p className="text-[11.5px] text-fg-subtle">{t("org.summaryInIgrek")}</p>}
    </Panel>
  );
}

/** Waiting for someone's yes (plan.md 20.3): reviews, other teams' requests, changes to settle. */
function Approvals({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string>();
  const me = view.me.id;
  const myTeams = view.structure.teams.filter((x) => x.leadId === me || x.members.includes(me)).map((x) => x.id);
  const everything = !!view.me.generalManager || view.me.role === "admin";
  const list = Object.values(view.state.cards).filter(
    (c) =>
      c.conflict ||
      (c.status === "review" && (everything || c.requestedBy === me || (!!c.team && myTeams.includes(c.team)))) ||
      (c.status === "open" && !!c.fromTeam && (everything || (!!c.team && myTeams.includes(c.team)))),
  );
  const card = open ? view.state.cards[open] : undefined;
  const extra = everything ? (view.approvals ?? []) : [];
  // Shown only when something waits: an empty "nothing to approve" box was one more thing to read.
  if (!list.length && !extra.length) return null;
  return (
    <Panel icon={ShieldAlert} title={t("org.approvals")}>
      {extra.map((x) => (
        <a
          key={x.id}
          href={x.link}
          className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
        >
          <span className="min-w-0 flex-1 truncate">{x.title}</span>
          <Badge tone={x.kind === "budget" ? "danger" : "accent"}>{t(`org.approval_${x.kind}`)}</Badge>
        </a>
      ))}
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-ui px-2 py-1 text-start text-[13px] hover:bg-bg-hover"
          onClick={() => setOpen(c.id)}
        >
          <span className="min-w-0 flex-1 truncate">{c.title}</span>
          <Badge tone="warning">
            {c.conflict
              ? t("org.conflictShort")
              : c.fromTeam && c.status === "open"
                ? t("org.request")
                : t("org.status_review")}
          </Badge>
        </button>
      ))}
      {card && <CardDetail api={api} view={view} card={card} onClose={() => setOpen(undefined)} />}
    </Panel>
  );
}

/** The general manager's page (plan.md 20.3): every project at a glance, by team, and what needs them. */
export function OrgHome({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const cards = Object.values(view.state.cards);
  const [giving, setGiving] = useState(false);
  const byTeam = [
    ...view.structure.teams.map((team) => ({
      id: team.id,
      name: team.name,
      projects: view.projects.filter((p) => p.teams.includes(team.id)),
    })),
    { id: "", name: t("org.noTeam"), projects: view.projects.filter((p) => !p.teams.length) },
  ].filter((g) => g.projects.length);
  const late = cards.filter((c) => isOverdue(c)).length;
  const waiting = cards.filter((c) => !!c.waitingOn && isOpen(c)).length;
  return (
    <div className="space-y-4">
      {/* The numbers in one line, the two things a manager does here as buttons, then only the boxes
          that have something in them (a user found eight boxes, mostly empty, too much). */}
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-pad py-2.5 text-[13px]">
        <span>
          <b className="text-[16px]">{view.projects.length}</b> {t("org.projects")}
        </span>
        <span>
          <b className="text-[16px]">{cards.filter(isOpen).length}</b> {t("org.openCards")}
        </span>
        <span className={late ? "text-danger" : undefined}>
          <b className="text-[16px]">{late}</b> {t("org.late")}
        </span>
        <span className={waiting ? "text-warning" : undefined}>
          <b className="text-[16px]">{waiting}</b> {t("org.waitingCards")}
        </span>
        <span className="flex-1" />
        {view.me.role !== "viewer" && (
          <Button variant="primary" icon={FileText} onClick={() => setGiving(true)}>
            {t("org.giveWork")}
          </Button>
        )}
      </Card>
      <Dialog open={giving} onClose={() => setGiving(false)} label={t("org.giveWork")}>
        <div className="space-y-3 p-5">
          <h2 className="text-[15px] font-semibold">{t("org.giveWork")}</h2>
          <p className="text-[12.5px] text-fg-subtle">{t("org.giveWorkHint", { handle: view.state.bot.handle })}</p>
          <NewCard api={api} view={view} />
        </div>
      </Dialog>
      <div className="grid gap-4 lg:grid-cols-2">
        <Summary api={api} view={view} />
        <Approvals api={api} view={view} />
        {view.live.length > 0 && (
          <Panel icon={Radio} title={t("org.liveNow")}>
            {view.live.map((l) => (
              <p key={`${l.userId}${l.project}`} className="text-[13px]">
                <span className="font-medium">{nameOf(view, l.userId)}</span>{" "}
                <span className="text-fg-muted">{l.title || l.tool}</span>{" "}
                <span className="text-[11.5px] text-fg-subtle">
                  {view.projects.find((p) => p.key === l.project)?.name}
                </span>
              </p>
            ))}
          </Panel>
        )}
      </div>
      {byTeam.map((g) => (
        <section key={g.id || "none"} className="space-y-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g.name}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.projects.map((p) => (
              <ProjectTile key={p.key} api={api} view={view} p={p} />
            ))}
          </div>
        </section>
      ))}
      {view.projects.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("org.noProjects")}</p>}
    </div>
  );
}
