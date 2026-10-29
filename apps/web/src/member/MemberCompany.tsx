import type { Seat } from "@igrek/core";
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Card, EmptyState, PageHeader, StatusDot } from "../components/ui";
import { relativeTime } from "../lib/format";
import { SeatsOverview } from "../pages/company/CompanySeats";
import type { MemberClient } from "./client";
import { PersonAvatar } from "./MemberMessage";

/** Each teammate with their Igrek's last report; someone without one shows with an empty week. */
export function seatsOf(client: MemberClient): Seat[] {
  return [...client.members.values()].map((m) => {
    const r = client.seats.get(m.id);
    return {
      memberId: m.id,
      name: client.nameOf(m.id),
      role: m.role,
      online: client.online.has(m.id),
      lastSeen: m.lastSeen,
      at: r?.at ?? 0,
      version: r?.version,
      os: r?.os,
      accounts: r?.accounts ?? [],
      week: r?.week ?? { sessions: 0, input: 0, output: 0, models: {} },
    };
  });
}

/**
 * The Company page in the browser (plan.md 20.1), for the admin: the people, their AI limits and
 * week, and the budgets the admin set in Igrek (shared with the team, end-to-end encrypted).
 */
export function MemberCompany({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const seats = seatsOf(client);
  return (
    <>
      <PageHeader title={t("company.title")} />
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        {seats.length === 0 ? (
          <EmptyState icon={Building2} title={t("company.emptyTitle")} body={t("company.emptyBody")} />
        ) : (
          <>
            <p className="max-w-3xl text-[13px] text-fg-muted">{t("company.intro")}</p>
            <Card>
              <h2 className="border-b border-border px-pad py-2 text-[13px] font-semibold">{t("company.people")}</h2>
              <ul className="divide-y divide-border">
                {[...client.members.values()].map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-pad py-2 text-[13px]">
                    <PersonAvatar client={client} id={m.id} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{client.nameOf(m.id)}</span>{" "}
                      <span className="text-fg-subtle">@{m.username}</span>
                    </span>
                    <Badge>{t(`member.role_${m.role}`)}</Badge>
                    <span className="flex w-36 items-center justify-end gap-1.5 text-[12px] text-fg-subtle">
                      <StatusDot tone={client.online.has(m.id) ? "success" : "neutral"} />
                      {client.online.has(m.id)
                        ? t("company.online")
                        : m.lastSeen
                          ? t("company.seen", { when: relativeTime(m.lastSeen) })
                          : t("company.neverSeen")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <SeatsOverview seats={seats} budgets={client.budgets} admin={false} onBudget={async () => undefined} />
            <p className="text-[12px] text-fg-subtle">{t("member.budgetsInIgrek")}</p>
          </>
        )}
      </div>
    </>
  );
}
