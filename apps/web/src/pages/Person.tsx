import type { TeamActivity } from "@igrek/core";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { TeamAvatar, useTeamPeople } from "../components/TeamAvatar";
import { Badge, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";

/** "What did Kerim do this week" (plan.md 4.6), in the reader's language. */
export function PersonPage() {
  const { t } = useTranslation();
  const { userId = "" } = useParams();
  const people = useTeamPeople();
  const member = people.status?.members.find((m) => m.id === userId);
  const [week, setWeek] = useState<TeamActivity>();
  const [summary, setSummary] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .teamActivity(Date.now() - 7 * 86_400_000, userId)
      .then((r) => setWeek(r[0]))
      .catch(() => undefined);
  }, [userId]);
  const doing = people.presence.find((p) => p.userId === userId);
  const byProject = new Map<string, TeamActivity["sessions"]>();
  for (const s of week?.sessions ?? []) byProject.set(s.projectName, [...(byProject.get(s.projectName) ?? []), s]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={member?.displayName ?? t("nav.team")} />
      <div className="mx-auto w-full max-w-4xl space-y-4 overflow-auto p-6">
        <Link to="/team" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={13} className="rtl:rotate-180" /> {t("nav.team")}
        </Link>
        {member && (
          <Card className="flex items-center gap-3 p-pad">
            <TeamAvatar member={member} size={40} state={people.stateOf(member)} doing={doing?.title} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{member.displayName}</p>
              <p className="text-xs text-fg-muted">
                {doing
                  ? t("people.working", { name: member.displayName, doing: doing.title ?? "" })
                  : member.online
                    ? t("team.online")
                    : member.lastSeen
                      ? t("team.offlineSince", { when: relativeTime(member.lastSeen) })
                      : t("team.offline")}
              </p>
            </div>
            <Button
              icon={Sparkles}
              disabled={busy || !week?.sessions.length}
              onClick={() => {
                setBusy(true);
                setError(undefined);
                api
                  .teamActivitySummary(userId)
                  .then((r) => setSummary(r.text))
                  .catch((err: Error) => setError(err.message))
                  .finally(() => setBusy(false));
              }}
              data-tip={t("person.summarizeTip")}
            >
              {busy ? t("person.summarizing") : t("person.summarize")}
            </Button>
          </Card>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        {summary && (
          <Card className="p-pad">
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{summary}</p>
          </Card>
        )}
        {!week?.sessions.length && !week?.decisions.length && (
          <EmptyState icon={Sparkles} title={t("person.quiet")} body={t("person.quietBody")} />
        )}
        {[...byProject.entries()].map(([project, sessions]) => (
          <Card key={project} className="p-pad">
            <h3 className="mb-2 text-[13px] font-semibold">{project || "—"}</h3>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id} className="text-[13px]">
                  <Link to={`/p/${s.projectId}/s/${s.id}`} className="font-medium hover:text-accent">
                    {s.title}
                  </Link>
                  <span className="ms-2 text-[11px] text-fg-subtle">{relativeTime(s.updatedAt)}</span>
                  {s.did.map((d) => (
                    <p key={d} className="text-xs text-fg-muted">
                      · {d}
                    </p>
                  ))}
                  {s.files.length > 0 && <p className="font-mono text-[11px] text-fg-subtle">{s.files.join(", ")}</p>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {(week?.decisions.length ?? 0) > 0 && (
          <Card className="p-pad">
            <h3 className="mb-2 text-[13px] font-semibold">{t("person.decisions")}</h3>
            <ul className="space-y-1.5">
              {week?.decisions.map((d) => (
                <li key={`${d.at}-${d.text}`} className="flex gap-2 text-[13px]">
                  <Badge>{t(`memory.${d.section}`)}</Badge>
                  <span>{d.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Team page: who did what today, newest first. */
export function TodayInTeam() {
  const { t } = useTranslation();
  const [people, setPeople] = useState<TeamActivity[]>([]);
  useEffect(() => {
    api
      .teamActivity(new Date().setHours(0, 0, 0, 0))
      .then(setPeople)
      .catch(() => undefined);
  }, []);
  if (!people.length) return <p className="text-xs text-fg-subtle">{t("person.todayNone")}</p>;
  return (
    <ul className="space-y-2">
      {people.map((p) => (
        <li key={p.userId} className="text-[13px]">
          <Link to={`/team/${p.userId}`} className="font-medium hover:text-accent">
            {p.name}
          </Link>
          <span className="ms-2 text-xs text-fg-muted">
            {p.sessions
              .slice(0, 3)
              .map((s) => `${s.projectName}: ${s.title}`)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
