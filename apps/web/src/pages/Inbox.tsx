import {
  AlarmClock,
  Brain,
  CircleX,
  Gauge,
  Inbox,
  KeyRound,
  MessageSquare,
  SquareTerminal,
  TrendingDown,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ApprovalCard } from "../components/ApprovalCard";
import { Badge, Card, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useApprovals, useChats, useLiveData, useTerminals } from "../lib/live";
import { isSnoozed, snooze } from "../lib/snooze";
import { TerminalStatus } from "./Terminals";

function Heading({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
      <span className={`size-2 rounded-full ${dot}`} />
      {children}
    </h2>
  );
}

function SnoozeButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      title={t("inbox.snooze")}
      aria-label={t("inbox.snooze")}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="text-fg-subtle hover:text-fg"
    >
      <AlarmClock size={13} />
    </button>
  );
}

/**
 * Everything waiting for you, most urgent first (plan.md 2.6b):
 * approvals · sessions waiting for an answer · things to decide when you have time.
 */
export function InboxPage() {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const later = (id: string) => {
    snooze(id);
    refresh((n) => n + 1);
  };
  const approvals = useApprovals();
  const terminals = useTerminals().filter(
    (term) =>
      (term.status === "attention" || term.status === "idle") && !isSnoozed(`term-${term.id}-${term.lastOutputAt}`),
  );
  const chats = useChats().filter((chat) => chat.status === "waiting" && !isSnoozed(`chat-${chat.id}`));
  const { data } = useLiveData(() => api.inbox(), []);
  const conflicts = (data?.conflicts ?? []).filter((c) => !isSnoozed(`conflict-${c.projectId}-${c.count}`));
  const { data: alerts } = useLiveData(() => api.limitAlerts(), []);
  const limitAlerts = (alerts ?? []).filter((a) => !isSnoozed(`limit-${a.accountId}-${a.window}-${a.resetsAt}`));
  const { data: noticeData } = useLiveData(() => api.inboxNotices(), []);
  const notices = (noticeData ?? []).filter((n) => !isSnoozed(n.id));
  const empty =
    approvals.length + terminals.length + chats.length + conflicts.length + limitAlerts.length + notices.length === 0;

  return (
    <>
      <PageHeader title={t("inbox.title")} />
      {empty ? (
        <EmptyState icon={Inbox} title={t("inbox.emptyTitle")} body={t("inbox.emptyBody")} />
      ) : (
        <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
          {approvals.length > 0 && (
            <section className="space-y-2">
              <Heading dot="bg-danger">
                {t("inbox.urgent")} · {t("approvals.title")}
              </Heading>
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </section>
          )}

          {limitAlerts.length > 0 && (
            <section>
              <Heading dot="bg-danger">
                {t("inbox.urgent")} · {t("inbox.limits")}
              </Heading>
              <Card>
                <div className="divide-y divide-border">
                  {limitAlerts.map((a) => (
                    <Link
                      key={`${a.accountId}-${a.window}`}
                      to="/limits"
                      data-nav-item
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                    >
                      <Gauge size={15} className="text-warning" />
                      <span className="flex-1 text-[13px] font-medium">
                        {a.label} · {a.window === "fiveHour" ? t("limits.fiveHour") : t("limits.week")}
                      </span>
                      <Badge tone={a.value >= 0.95 ? "danger" : "warning"}>{Math.round(a.value * 100)}%</Badge>
                      {a.resetsAt && <span className="text-[11px] text-fg-subtle">{relativeTime(a.resetsAt)}</span>}
                      <SnoozeButton onClick={() => later(`limit-${a.accountId}-${a.window}-${a.resetsAt}`)} />
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          )}
          {terminals.length + chats.length > 0 && (
            <section>
              <Heading dot="bg-warning">
                {t("inbox.today")} · {t("inbox.needsYou")}
              </Heading>
              <Card>
                <div className="divide-y divide-border">
                  {chats.map((chat) => (
                    <Link
                      key={chat.id}
                      to={`/c/${chat.id}`}
                      data-nav-item
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                    >
                      <MessageSquare size={15} className="text-accent" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{chat.title}</span>
                      <Badge tone="warning">{t("chat.waiting")}</Badge>
                      <SnoozeButton onClick={() => later(`chat-${chat.id}`)} />
                    </Link>
                  ))}
                  {[...terminals]
                    .sort((a, b) => (a.status === "attention" ? -1 : 0) - (b.status === "attention" ? -1 : 0))
                    .map((term) => (
                      <Link
                        key={term.id}
                        to={`/t/${term.id}`}
                        data-nav-item
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                      >
                        <SquareTerminal size={15} className="text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{term.title}</span>
                        <TerminalStatus term={term} />
                        <span className="w-24 text-end text-[11px] text-fg-subtle">
                          {relativeTime(term.lastOutputAt)}
                        </span>
                        <SnoozeButton onClick={() => later(`term-${term.id}-${term.lastOutputAt}`)} />
                      </Link>
                    ))}
                </div>
              </Card>
            </section>
          )}

          {notices.length > 0 && (
            <section>
              <Heading dot="bg-fg-subtle">
                {t("inbox.info")} · {t("inbox.notices")}
              </Heading>
              <Card>
                <div className="divide-y divide-border">
                  {notices.map((n) => {
                    const Icon = n.kind === "tool" ? CircleX : n.kind === "score" ? TrendingDown : KeyRound;
                    return (
                      <Link
                        key={n.id}
                        to={n.link}
                        data-nav-item
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                      >
                        <Icon
                          size={15}
                          className={n.kind === "env" ? "text-fg-subtle" : "text-warning"}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          <span className="font-medium">{n.projectName}</span> · {t(`inbox.notice_${n.kind}`)}
                          <span className="ms-2 font-mono text-[11px] text-fg-subtle">
                            {n.kind === "tool" ? t(`tools.kind_${n.detail}`) : n.detail}
                          </span>
                        </span>
                        <span className="text-[11px] text-fg-subtle">{relativeTime(n.at)}</span>
                        <SnoozeButton onClick={() => later(n.id)} />
                      </Link>
                    );
                  })}
                </div>
              </Card>
            </section>
          )}

          {conflicts.length > 0 && (
            <section>
              <Heading dot="bg-fg-subtle">
                {t("inbox.info")} · {t("inbox.conflicts")}
              </Heading>
              <Card>
                <div className="divide-y divide-border">
                  {conflicts.map((c) => (
                    <Link
                      key={c.projectId}
                      to={`/p/${c.projectId}?tab=memory`}
                      data-nav-item
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover"
                    >
                      <Brain size={15} className="text-warning" />
                      <span className="flex-1 text-[13px] font-medium">{c.projectName}</span>
                      <Badge tone="warning">{c.count}</Badge>
                      <SnoozeButton onClick={() => later(`conflict-${c.projectId}-${c.count}`)} />
                    </Link>
                  ))}
                </div>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  );
}
