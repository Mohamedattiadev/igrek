import type { Seat } from "@igrek/core";
import { Building2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { useTeamPeople } from "../components/TeamAvatar";
import { Card, Dialog, EmptyState, PageHeader, Section, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { useServerEvent } from "../lib/live";
import { useSettings } from "../lib/settings";
import { useBudgets } from "./company/CompanyBudgets";
import { CompanyRules } from "./company/CompanyRules";
import { SeatsOverview } from "./company/CompanySeats";
import { CompanyWork } from "./company/CompanyWork";
import { AdminPanel, RecoveryBody, Sharing } from "./Team";

/** The overview tab: everyone's accounts, limits and week. */
function CompanyOverview() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [seats, setSeats] = useState<Seat[]>();
  const load = useCallback(
    () =>
      void api
        .company()
        .then(setSeats)
        .catch(() => setSeats([])),
    [],
  );
  useEffect(load, [load]);
  useServerEvent("team-changed", load);
  const { budgets, save } = useBudgets();
  const admin = useTeamPeople().status?.user?.role === "admin";
  return (
    <div className="space-y-5">
      {seats && seats.length === 0 ? (
        <EmptyState icon={Building2} title={t("company.emptyTitle")} body={t("company.emptyBody")} />
      ) : (
        <>
          <p className="max-w-3xl text-[13px] text-fg-muted">{t("company.intro")}</p>
          <SeatsOverview seats={seats ?? []} budgets={budgets} admin={admin} onBudget={save} />
          <Card className="flex flex-wrap items-center justify-between gap-3 p-pad">
            <div className="max-w-2xl">
              <p className="text-[13.5px] font-medium">{t("company.shareTitle")}</p>
              <p className="text-[12.5px] text-fg-muted">{t("company.shareHint")}</p>
            </div>
            <Segmented
              label={t("company.shareTitle")}
              value={settings.shareUsage ? "on" : "off"}
              onChange={(v) => void update({ shareUsage: v === "on" })}
              options={[
                { value: "on", label: t("settings.on") },
                { value: "off", label: t("settings.off") },
              ]}
            />
          </Card>
          <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
            <Users size={13} aria-hidden="true" />
            <Link to="/team" className="text-accent hover:underline">
              {t("company.manage")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

const TABS = ["overview", "work", "people", "rules", "sharing", "audit", "hub"] as const;
const MEMBER_TABS: (typeof TABS)[number][] = ["overview", "work", "sharing"];

/**
 * The company (plan.md, 26-27 Oct 2026): an overview for everyone; for admins also its people,
 * its rules, what is shared, the record of what happened and the hub. One's own account is on
 * the profile page, the day's work on the Team page.
 */
export function CompanyPage() {
  const { t } = useTranslation();
  const people = useTeamPeople();
  const [params, setParams] = useSearchParams();
  const [recovery, setRecovery] = useState<string>();
  const me = people.status?.user;
  const admin = me?.role === "admin";
  const tabs = admin ? TABS : MEMBER_TABS;
  const tab = tabs.find((v) => v === params.get("tab")) ?? "overview";
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("company.title")} />
      {people.status?.configured && (
        <div className="border-b border-border px-6 py-2">
          <Segmented
            label={t("company.title")}
            value={tab}
            onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })}
            options={tabs.map((v) => ({ value: v, label: t(`company.tab_${v}`) }))}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-4 sm:p-6">
          {tab === "overview" && <CompanyOverview />}
          {tab === "work" && <CompanyWork />}
          {tab === "rules" && <CompanyRules />}
          {tab === "sharing" && (
            <Section title={t("team.sharing")} hint={t("team.sharingHint")}>
              <Sharing />
            </Section>
          )}
          {me && (tab === "people" || tab === "audit" || tab === "hub") && (
            <AdminPanel me={me.id} part={tab} onRecovery={setRecovery} />
          )}
        </div>
      </div>
      <Dialog open={!!recovery} onClose={() => setRecovery(undefined)} label={t("team.recoveryTitle")}>
        {recovery && <RecoveryBody value={recovery} onClose={() => setRecovery(undefined)} />}
      </Dialog>
    </div>
  );
}
