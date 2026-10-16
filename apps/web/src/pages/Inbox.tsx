import { Brain, Inbox, SquareTerminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ApprovalCard } from "../components/ApprovalCard";
import { Badge, Card, EmptyState, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useApprovals, useLiveData, useTerminals } from "../lib/live";
import { TerminalStatus } from "./Terminals";

/** Everything waiting for you, in one place (plan.md 2.6b). */
export function InboxPage() {
  const { t } = useTranslation();
  const waiting = useTerminals().filter((term) => term.status === "attention" || term.status === "idle");
  const { data } = useLiveData(() => api.inbox(), []);
  const conflicts = data?.conflicts ?? [];
  const approvals = useApprovals();
  const empty = waiting.length === 0 && conflicts.length === 0 && approvals.length === 0;

  return (
    <>
      <PageHeader title={t("inbox.title")} />
      {empty ? (
        <EmptyState icon={Inbox} title={t("inbox.emptyTitle")} body={t("inbox.emptyBody")} />
      ) : (
        <div className="mx-auto w-full max-w-4xl space-y-5 p-6">
          {approvals.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("approvals.title")}</h2>
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={approval} />
              ))}
            </section>
          )}
          {waiting.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t("inbox.needsYou")}
              </h2>
              <Card>
                <div className="divide-y divide-border">
                  {waiting
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
                      </Link>
                    ))}
                </div>
              </Card>
            </section>
          )}
          {conflicts.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t("inbox.conflicts")}
              </h2>
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
