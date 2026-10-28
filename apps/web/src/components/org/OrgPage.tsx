import { isManager } from "@igrek/core";
import { Building2, CloudOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Meetings } from "../meet/Meetings";
import { EmptyState, Segmented } from "../ui";
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
}: {
  api: OrgApi;
  tab?: string;
  onTab: (tab: OrgTab) => void;
  meeting?: string;
}) {
  const { t } = useTranslation();
  const view = api.view;
  if (!view) return <EmptyState icon={Building2} title={t("org.title")} body={t("org.notInTeam")} />;
  const manages =
    isManager(view.structure, view.me) ||
    view.me.role === "admin" ||
    view.structure.teams.some((x) => x.leadId === view.me.id);
  const current = TABS.find((x) => x === tab) ?? (manages ? "home" : "cards");
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-tight">{t("org.title")}</h1>
        {view.waiting > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-warning">
            <CloudOff size={13} aria-hidden="true" /> {t("org.waitingSync", { count: view.waiting })}
          </span>
        )}
        <Segmented
          label={t("org.title")}
          value={current}
          onChange={onTab}
          options={TABS.filter((x) => x !== "home" || manages).map((x) => ({ value: x, label: t(`org.tab_${x}`) }))}
        />
      </header>
      {current === "home" && <OrgHome api={api} view={view} />}
      {current === "cards" && <OrgCards api={api} view={view} />}
      {current === "channels" && <OrgChannels api={api} view={view} />}
      {current === "meetings" && (
        <Meetings api={api} view={view} open={meeting} dark={document.documentElement.dataset.theme === "dark"} />
      )}
      {current === "history" && <OrgHistory api={api} view={view} />}
      {current === "teams" && <OrgTeams api={api} view={view} />}
      {current === "settings" && <OrgSettings api={api} view={view} />}
    </div>
  );
}
