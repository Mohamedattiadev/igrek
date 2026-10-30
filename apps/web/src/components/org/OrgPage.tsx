import { isManager } from "@igrek/core";
import { Building2, CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Meetings } from "../meet/Meetings";
import { EmptyState, PageHeader, Segmented, TabBar } from "../ui";
import type { OrgApi } from "./api";
import { OrgCards } from "./OrgCards";
import { OrgHistory } from "./OrgHistory";
import { OrgHome } from "./OrgHome";
import { OrgChannels } from "./OrgPosts";
import { OrgSettings } from "./OrgSettings";
import { OrgTeams } from "./OrgTeams";

const TABS = ["home", "cards", "channels", "meetings", "history", "teams", "settings"] as const;
export type OrgTab = (typeof TABS)[number];

/**
 * The company (plan.md 20.2-20.7), the same in Igrek and in the hub's web page: the general
 * manager's overview, the cards, the channels and announcements, the teams, the bot.
 */
export function OrgPage({
  api,
  tab,
  onTab,
  meeting,
  join,
  only,
}: {
  api: OrgApi;
  tab?: string;
  onTab: (tab: OrgTab) => void;
  meeting?: string;
  /** Straight into that meeting's call (opened in a new tab). */
  join?: boolean;
  /** One part as a page of its own (Meetings in the strip): its name as the title, no tabs. */
  only?: OrgTab;
}) {
  const { t } = useTranslation();
  const view = api.view;
  if (!view)
    return (
      <>
        <PageHeader title={t("org.title")} />
        <EmptyState icon={Building2} title={t("org.title")} body={t("org.notInTeam")} />
      </>
    );
  const manages =
    isManager(view.structure, view.me) ||
    view.me.role === "admin" ||
    view.structure.teams.some((x) => x.leadId === view.me.id);
  const current = only ?? TABS.find((x) => x === tab) ?? (manages ? "home" : "cards");
  return (
    <>
      <PageHeader
        title={only ? t(`org.tab_${only}`) : t("org.title")}
        actions={
          view.waiting > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-warning">
              <CloudOff size={13} aria-hidden="true" /> {t("org.waitingSync", { count: view.waiting })}
            </span>
          )
        }
      />
      {!only && (
        <TabBar>
          <Segmented
            label={t("org.title")}
            value={current}
            onChange={onTab}
            // Meetings have their own place (Team > Meetings); a tab here jumped to that other page.
            options={TABS.filter((x) => x !== "meetings" && (x !== "home" || manages)).map((x) => ({
              value: x,
              label: t(`org.tab_${x}`),
            }))}
          />
        </TabBar>
      )}
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
        {current === "home" && <OrgHome api={api} view={view} />}
        {current === "cards" && <OrgCards api={api} view={view} />}
        {current === "channels" && <OrgChannels api={api} view={view} />}
        {current === "meetings" && (
          <Meetings
            api={api}
            view={view}
            open={meeting}
            join={join}
            dark={document.documentElement.dataset.theme === "dark"}
          />
        )}
        {current === "history" && <OrgHistory api={api} view={view} />}
        {current === "teams" && <OrgTeams api={api} view={view} />}
        {current === "settings" && <OrgSettings api={api} view={view} />}
      </div>
    </>
  );
}
