import {
  changeCard,
  isOpen,
  isOverdue,
  newCard,
  type OrgCard,
  type OrgCardStatus,
  type OrgPriority,
} from "@igrek/core";
import { AlertTriangle, CalendarClock, Hand, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { dateTime, relativeTime } from "../../lib/format";
import { Badge, Button, Card, field, Segmented } from "../ui";
import { nameOf, type OrgApi, type OrgView, teamName } from "./api";
import { BotText, PostList, Writer } from "./OrgPosts";

const box = cn(field, "w-full");
const PRIORITIES: OrgPriority[] = ["low", "normal", "high", "urgent"];
const TONE = { urgent: "danger", high: "warning", normal: "neutral", low: "neutral" } as const;

/** "Today 18:00", "in 2 days": when it is due, red once late. */
function Due({ card }: { card: OrgCard }) {
  if (!card.due) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11.5px] ${isOverdue(card) ? "text-danger" : "text-fg-subtle"}`}
    >
      <CalendarClock size={12} aria-hidden="true" />
      {dateTime(card.due)}
    </span>
  );
}

/** Who may move a card on: whoever holds it, its team's lead, whoever asked for it, and the manager. */
function mayChange(view: OrgView, c: OrgCard): boolean {
  const me = view.me.id;
  if (view.me.role === "viewer") return false;
  const lead = view.structure.teams.some((t) => (t.id === c.team || t.id === c.fromTeam) && t.leadId === me);
  return (
    c.assignee === me ||
    c.requestedBy === me ||
    lead ||
    !!view.me.generalManager ||
    view.me.role === "admin" ||
    (!c.assignee && view.structure.teams.some((t) => t.id === c.team && t.members.includes(me)))
  );
}

/** The buttons a card offers now: take it, start, ask for review, finish, accept or decline a request, close. */
function Actions({ api, view, card }: { api: OrgApi; view: OrgView; card: OrgCard }) {
  const { t } = useTranslation();
  const me = view.me.id;
  const move = (patch: Partial<OrgCard>, what: string) =>
    void api.act("org-card", changeCard(card, patch, me, what) as unknown as Record<string, unknown>);
  const steps: { label: string; patch: Partial<OrgCard>; what: string; primary?: boolean }[] = [];
  const s: OrgCardStatus = card.status;
  if (s === "open" && card.fromTeam) {
    steps.push({ label: t("org.accept"), patch: { status: "accepted" }, what: "accepted", primary: true });
    steps.push({ label: t("org.decline"), patch: { status: "declined" }, what: "declined" });
  }
  if (s === "open" && !card.assignee)
    steps.push({
      label: t("org.take"),
      patch: { assignee: me, status: "accepted" },
      what: "taken",
      primary: !card.fromTeam,
    });
  if (s === "accepted")
    steps.push({ label: t("org.start"), patch: { status: "doing" }, what: "started", primary: true });
  if (s === "doing") {
    steps.push({ label: t("org.toReview"), patch: { status: "review" }, what: "review" });
    steps.push({
      label: t("org.finish"),
      patch: { status: "done", waitingOn: undefined },
      what: "done",
      primary: true,
    });
  }
  if (s === "review")
    steps.push({ label: t("org.approve"), patch: { status: "done" }, what: "approved", primary: true });
  if (s === "done" && card.requestedBy === me)
    steps.push({ label: t("org.close"), patch: { status: "closed" }, what: "closed" });
  if ((s === "done" || s === "declined" || s === "closed") && card.requestedBy === me)
    steps.push({ label: t("org.reopen"), patch: { status: card.assignee ? "accepted" : "open" }, what: "reopened" });
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((x) => (
        <Button
          key={x.label}
          size="sm"
          variant={x.primary ? "primary" : "secondary"}
          onClick={() => move(x.patch, x.what)}
        >
          {x.label}
        </Button>
      ))}
    </div>
  );
}

/** Give it to someone else: a person, a team's queue, or a bot. */
function Assign({ api, view, card }: { api: OrgApi; view: OrgView; card: OrgCard }) {
  const { t } = useTranslation();
  const value = card.assignee ?? (card.team ? `team:${card.team}` : "");
  return (
    <select
      aria-label={t("org.giveTo")}
      className={box}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        const patch: Partial<OrgCard> = v.startsWith("team:")
          ? { team: v.slice(5), assignee: undefined, status: "open" }
          : { assignee: v, status: card.status === "open" ? "accepted" : card.status };
        void api.act("org-card", changeCard(card, patch, view.me.id, `to ${v}`) as unknown as Record<string, unknown>);
      }}
    >
      <option value="">{t("org.nobody")}</option>
      <AssignOptions view={view} />
    </select>
  );
}

function AssignOptions({ view }: { view: OrgView }) {
  const { t } = useTranslation();
  return (
    <>
      <optgroup label={t("org.teams")}>
        {view.structure.teams.map((x) => (
          <option key={x.id} value={`team:${x.id}`}>
            {x.name}
          </option>
        ))}
      </optgroup>
      {Object.values(view.state.bots).flat().length > 0 && (
        <optgroup label={t("org.bots")}>
          {Object.values(view.state.bots)
            .flat()
            .map((b) => (
              <option key={b.handle} value={`bot:${b.handle}`}>
                @{b.handle} ({b.name})
              </option>
            ))}
        </optgroup>
      )}
      <optgroup label={t("org.people")}>
        {view.people
          .filter((p) => p.role !== "viewer")
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName || p.username}
            </option>
          ))}
      </optgroup>
    </>
  );
}

/** "Waiting for approval from Ali": the coordinator asks them when it has waited long enough. */
function Waiting({ api, view, card }: { api: OrgApi; view: OrgView; card: OrgCard }) {
  const { t } = useTranslation();
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  if (card.waitingOn)
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-warning">
        {t("org.waitingOn", { who: nameOf(view, card.waitingOn.who), what: card.waitingOn.what })}
        <button
          type="button"
          className="text-[12px] text-accent hover:underline"
          onClick={() =>
            void api.act(
              "org-card",
              changeCard(card, { waitingOn: undefined }, view.me.id, "unblocked") as unknown as Record<string, unknown>,
            )
          }
        >
          {t("org.unblock")}
        </button>
      </p>
    );
  if (card.assignee !== view.me.id || !isOpen(card)) return null;
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (who && what.trim())
          void api.act(
            "org-card",
            changeCard(
              card,
              { waitingOn: { who, what: what.trim(), since: Date.now() } },
              view.me.id,
              "waiting",
            ) as unknown as Record<string, unknown>,
          );
      }}
    >
      <select
        aria-label={t("org.waitFor")}
        className={box}
        style={{ width: 160 }}
        value={who}
        onChange={(e) => setWho(e.target.value)}
      >
        <option value="">{t("org.waitFor")}</option>
        {view.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName || p.username}
          </option>
        ))}
      </select>
      <input
        className={box}
        style={{ flex: 1, minWidth: 140 }}
        value={what}
        onChange={(e) => setWhat(e.target.value)}
        placeholder={t("org.waitWhat")}
        aria-label={t("org.waitWhat")}
      />
      <Button size="sm" type="submit" disabled={!who || !what.trim()}>
        {t("org.markWaiting")}
      </Button>
    </form>
  );
}

/** Changed on two computers while apart: the other side's values, to take or to drop. */
function Conflict({ api, view, card }: { api: OrgApi; view: OrgView; card: OrgCard }) {
  const { t } = useTranslation();
  if (!card.conflict) return null;
  const settle = (take: boolean) =>
    void api.act(
      "org-card",
      changeCard(
        card,
        { ...(take ? card.conflict?.fields : {}), conflict: undefined },
        view.me.id,
        take ? "took other" : "kept mine",
      ) as unknown as Record<string, unknown>,
    );
  return (
    <div className="space-y-1.5 rounded-ui border border-warning bg-warning-soft p-2.5 text-[12.5px]">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle size={13} className="text-warning" aria-hidden="true" />
        {t("org.conflict", { who: nameOf(view, card.conflict.by) })}
      </p>
      <p className="text-fg-muted">
        {Object.entries(card.conflict.fields)
          .map(([k, v]) => `${k}: ${String(v ?? "")}`)
          .join(" · ")}
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => settle(true)}>
          {t("org.takeTheirs")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => settle(false)}>
          {t("org.keepMine")}
        </Button>
      </div>
    </div>
  );
}

/** One card, opened: everything about it, what can be done now, and its comments. */
export function CardDetail({
  api,
  view,
  card,
  onClose,
}: {
  api: OrgApi;
  view: OrgView;
  card: OrgCard;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const can = mayChange(view, card);
  const reason = card.reason
    ? (JSON.parse(card.reason) as { key: string; vars?: Record<string, string | number> })
    : undefined;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{card.title}</h3>
          <p className="text-[12px] text-fg-subtle">
            {t(`org.status_${card.status}`)} · {t("org.askedBy", { who: nameOf(view, card.requestedBy) })}
            {card.fromTeam && ` · ${t("org.fromTeam", { team: teamName(view, card.fromTeam) })}`}
            {card.projectName && ` · ${card.projectName}`}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose} aria-label={t("org.closeCard")} />
      </div>
      {card.detail && <p className="whitespace-pre-wrap text-[13px]">{card.detail}</p>}
      {card.note && (
        <p className="text-[12px] text-fg-muted">
          {t("org.noteOn", { url: card.note.url })} {card.note.text && `"${card.note.text}"`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Badge tone={TONE[card.priority]}>{t(`org.priority_${card.priority}`)}</Badge>
        <Due card={card} />
        {card.team && <Badge>{teamName(view, card.team)}</Badge>}
        {card.assignee && <span>{t("org.holds", { who: nameOf(view, card.assignee) })}</span>}
      </div>
      {reason && (
        <p className="text-[12px] text-fg-muted italic">
          <BotText say={reason} view={view} />
        </p>
      )}
      <Conflict api={api} view={view} card={card} />
      {can && (
        <>
          <Actions api={api} view={view} card={card} />
          <Assign api={api} view={view} card={card} />
          <Waiting api={api} view={view} card={card} />
        </>
      )}
      <ul className="space-y-0.5 text-[11.5px] text-fg-subtle">
        {card.history.slice(-6).map((h) => (
          <li key={`${h.at}${h.by}${h.what}`}>
            {relativeTime(h.at)} · {nameOf(view, h.by)} · {h.what}
          </li>
        ))}
      </ul>
      <PostList view={view} channel={`card:${card.id}`} />
      <Writer api={api} view={view} channel={`card:${card.id}`} placeholder={t("org.comment")} />
    </Card>
  );
}

/** A new card: what, for whom (a person, a team's queue, a bot), how urgent, by when, which project. */
export function NewCard({
  api,
  view,
  onDone,
  fromTeam,
}: {
  api: OrgApi;
  view: OrgView;
  onDone?: () => void;
  fromTeam?: string;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [to, setTo] = useState("");
  const [priority, setPriority] = useState<OrgPriority>("normal");
  const [due, setDue] = useState("");
  const [project, setProject] = useState("");
  const submit = async () => {
    const p = view.projects.find((x) => x.key === project);
    const card = newCard(
      {
        title: title.trim(),
        detail: detail.trim(),
        ...(to.startsWith("team:") ? { team: to.slice(5) } : to ? { assignee: to } : {}),
        ...(fromTeam ? { fromTeam } : {}),
        priority,
        ...(due ? { due: new Date(`${due}T18:00`).getTime() } : {}),
        ...(p ? { project: p.key, projectName: p.name } : {}),
      },
      view.me.id,
    );
    await api.act("org-card", card as unknown as Record<string, unknown>);
    setTitle("");
    setDetail("");
    onDone?.();
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) void submit();
      }}
    >
      <input
        className={box}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("org.cardTitle")}
        aria-label={t("org.cardTitle")}
      />
      <textarea
        style={{ minHeight: 64 }}
        className={cn(field, "h-auto w-full py-1.5")}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={t("org.cardDetail")}
        aria-label={t("org.cardDetail")}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={box} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("org.giveTo")}>
          <option value="">{t("org.giveTo")}</option>
          <AssignOptions view={view} />
        </select>
        <select
          className={box}
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label={t("org.project")}
        >
          <option value="">{t("org.noProject")}</option>
          {view.projects.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className={box}
          value={priority}
          onChange={(e) => setPriority(e.target.value as OrgPriority)}
          aria-label={t("org.priority")}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {t(`org.priority_${p}`)}
            </option>
          ))}
        </select>
        <input
          type="date"
          className={box}
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label={t("org.due")}
        />
      </div>
      <Button type="submit" variant="primary" icon={Plus} disabled={!title.trim()}>
        {fromTeam ? t("org.sendRequest") : t("org.addCard")}
      </Button>
    </form>
  );
}

type Filter = "mine" | "teams" | "all";

/** Every card of the company: mine, my teams', or all; open first, late ones marked. */
export function OrgCards({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("mine");
  const [open, setOpen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const me = view.me.id;
  const myTeams = view.structure.teams.filter((x) => x.members.includes(me)).map((x) => x.id);
  const cards = Object.values(view.state.cards)
    .filter((c) =>
      filter === "all"
        ? true
        : filter === "mine"
          ? c.assignee === me || c.requestedBy === me
          : (!!c.team && myTeams.includes(c.team)) || (!!c.fromTeam && myTeams.includes(c.fromTeam)),
    )
    .sort(
      (a, b) =>
        Number(isOpen(b)) - Number(isOpen(a)) || (a.due ?? Infinity) - (b.due ?? Infinity) || b.updatedAt - a.updatedAt,
    );
  const card = open ? view.state.cards[open] : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label={t("org.cards")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "mine", label: t("org.mine") },
              { value: "teams", label: t("org.myTeams") },
              { value: "all", label: t("org.all") },
            ]}
          />
          {view.me.role !== "viewer" && (
            <Button size="sm" icon={Plus} onClick={() => setAdding((v) => !v)}>
              {t("org.addCard")}
            </Button>
          )}
        </div>
        {adding && (
          <Card className="p-4">
            <NewCard api={api} view={view} onDone={() => setAdding(false)} />
          </Card>
        )}
        {cards.length === 0 && <p className="text-[12.5px] text-fg-subtle">{t("org.noCards")}</p>}
        <ul className="space-y-1.5">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpen(c.id)}
                aria-current={open === c.id ? "true" : undefined}
                className="flex w-full items-start gap-2 rounded-ui border border-border bg-bg px-3 py-2 text-start text-[13px] hover:border-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.title}</span>
                  <span className="flex flex-wrap gap-x-2 text-[11.5px] text-fg-subtle">
                    {c.assignee ? nameOf(view, c.assignee) : teamName(view, c.team) || t("org.nobody")}
                    {c.fromTeam && <span>{t("org.fromTeam", { team: teamName(view, c.fromTeam) })}</span>}
                    <Due card={c} />
                    {c.waitingOn && <span className="text-warning">{t("org.waiting")}</span>}
                    {c.conflict && <span className="text-warning">{t("org.conflictShort")}</span>}
                  </span>
                </span>
                {!c.assignee && c.status === "open" && <Hand size={14} className="text-accent" aria-hidden="true" />}
                <Badge tone={c.status === "done" ? "success" : isOverdue(c) ? "danger" : "neutral"}>
                  {t(`org.status_${c.status}`)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>{card && <CardDetail api={api} view={view} card={card} onClose={() => setOpen(undefined)} />}</div>
    </div>
  );
}
