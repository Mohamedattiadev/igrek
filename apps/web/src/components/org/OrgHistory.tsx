import { aboutFuture, factsFor, isManager, orgItems, search, type TimelineItem, upcoming } from "@igrek/core";
import { History, MessageCircleQuestion } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateTime } from "../../lib/format";
import { Badge, Button, Card } from "../ui";
import { nameOf, type OrgApi, type OrgView, teamName } from "./api";

const field = "h-9 w-full rounded-ui border border-border bg-bg px-3 text-[13px] outline-none focus:border-accent";

function Item({ view, item, showChanges }: { view: OrgView; item: TimelineItem; showChanges: boolean }) {
  const { t } = useTranslation();
  const project = view.projects.find((p) => p.key === item.project)?.name;
  return (
    <li className="space-y-0.5 px-2 py-1.5 text-[13px]">
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="text-[11.5px] text-fg-subtle">{dateTime(item.at)}</span>
        <Badge>{t(`history.kind_${item.kind}`)}</Badge>
        <span className="font-medium">{nameOf(view, item.who) || item.who}</span>
        {project && <span className="text-[11.5px] text-fg-subtle">{project}</span>}
        {item.team && <span className="text-[11.5px] text-fg-subtle">{teamName(view, item.team)}</span>}
      </p>
      <p className="whitespace-pre-wrap break-words text-fg-muted">{item.text || t("teamChat.deleted")}</p>
      {showChanges &&
        item.previous?.map((p) => (
          <p key={p.at} className="text-[12px] text-fg-subtle line-through">
            {dateTime(p.at)} {p.text}
          </p>
        ))}
    </li>
  );
}

/** "When did the payment module finish?", "what is coming next week?": answered with sources and dates. */
function Ask({ api, view, items }: { api: OrgApi; view: OrgView; items: TimelineItem[] }) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text?: string; sources: TimelineItem[] }>();
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    const sources = aboutFuture(q) ? upcoming(view.state, q) : search(items, q).map((f) => f.item);
    setAnswer({ sources });
    if (!api.summarize || !sources.length) return;
    setBusy(true);
    try {
      const text = await api.summarize(
        factsFor(sources, (id) => nameOf(view, id)),
        `Answer this question in one or two sentences, only from these facts, citing them as [1], [2] and giving dates: ${q}`,
      );
      setAnswer({ text, sources });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-2 p-4">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <MessageCircleQuestion size={15} className="text-accent" aria-hidden="true" /> {t("history.ask")}
      </h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          className={field}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("history.askHint")}
          aria-label={t("history.ask")}
        />
        <Button type="submit" variant="primary" disabled={!question.trim() || busy} usesModel={!!api.summarize}>
          {t("history.askButton")}
        </Button>
      </form>
      {busy && <p className="text-[12.5px] text-fg-subtle">{t("org.summarizing")}</p>}
      {answer?.text && <p className="whitespace-pre-wrap text-[13.5px]">{answer.text}</p>}
      {answer && !answer.sources.length && <p className="text-[12.5px] text-fg-subtle">{t("history.nothing")}</p>}
      {answer && answer.sources.length > 0 && (
        <ol className="divide-y divide-border rounded-ui border border-border">
          {answer.sources.map((s, i) => (
            <li key={s.id} className="flex gap-2 px-2 py-1.5 text-[12.5px]">
              <span className="text-fg-subtle">[{i + 1}]</span>
              <span className="w-32 shrink-0 text-fg-subtle">{dateTime(s.at)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{nameOf(view, s.who) || s.who}</span> {s.text}
              </span>
            </li>
          ))}
        </ol>
      )}
      {!api.summarize && <p className="text-[11.5px] text-fg-subtle">{t("history.answerInIgrek")}</p>}
    </Card>
  );
}

/** Everything that happened (plan.md 20.9), on one timeline: by person, team, project and date; and questions to it. */
export function OrgHistory({ api, view }: { api: OrgApi; view: OrgView }) {
  const { t } = useTranslation();
  const [who, setWho] = useState("");
  const [team, setTeam] = useState("");
  const [project, setProject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const items = useMemo(
    () => [...view.history, ...orgItems(view.state)].sort((a, b) => b.at - a.at),
    [view.history, view.state],
  );
  const members = team ? (view.structure.teams.find((x) => x.id === team)?.members ?? []) : [];
  const shown = items.filter(
    (i) =>
      (!who || i.who === who) &&
      (!team || i.team === team || members.includes(i.who)) &&
      (!project || i.project === project) &&
      (!from || i.at >= new Date(`${from}T00:00`).getTime()) &&
      (!to || i.at <= new Date(`${to}T23:59`).getTime()),
  );
  // What was changed or deleted shows to whoever runs the company (plan.md 20.9).
  const showChanges = isManager(view.structure, view.me) || view.me.role === "admin";
  return (
    <div className="space-y-4">
      <Ask api={api} view={view} items={items} />
      <Card className="space-y-2 p-4">
        <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
          <History size={15} className="text-accent" aria-hidden="true" /> {t("history.timeline")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <select className={field} value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("org.person")}>
            <option value="">{t("history.everyone")}</option>
            {view.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName || p.username}
              </option>
            ))}
          </select>
          <select className={field} value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t("org.teams")}>
            <option value="">{t("history.allTeams")}</option>
            {view.structure.teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={project}
            onChange={(e) => setProject(e.target.value)}
            aria-label={t("org.project")}
          >
            <option value="">{t("history.allProjects")}</option>
            {view.projects.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={field}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label={t("org.from")}
          />
          <input
            type="date"
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label={t("org.to")}
          />
        </div>
        <ul className="divide-y divide-border">
          {shown.slice(0, 300).map((i) => (
            <Item key={i.id} view={view} item={i} showChanges={showChanges} />
          ))}
        </ul>
        {!shown.length && <p className="text-[12.5px] text-fg-subtle">{t("history.empty")}</p>}
      </Card>
    </div>
  );
}
