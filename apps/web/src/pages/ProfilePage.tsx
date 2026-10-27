import { Settings as SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LanguagePicker } from "../components/LanguagePicker";
import { useTeamPeople } from "../components/TeamAvatar";
import { PageHeader, Section, Segmented } from "../components/ui";
import { useAccounts } from "../lib/live";
import { askNotificationPermission } from "../lib/notify";
import { useSettings } from "../lib/settings";
import { AccountsSection } from "./Limits";
import { MyAccountSection } from "./TeamSecurity";

/**
 * "My profile" (plan.md, 27 Oct 2026): everything about one person in one place: who they are in
 * the team (name, colour, password, two-step sign-in), the AI accounts they use, and their own
 * choices (language, notifications, sharing their usage). The company's settings are on its page.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const people = useTeamPeople();
  const accounts = useAccounts();
  const onOff = [
    { value: "on", label: t("settings.on") },
    { value: "off", label: t("settings.off") },
  ];
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("profile.title")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 pb-10">
          {people.status?.configured ? (
            <MyAccountSection />
          ) : (
            <Section title={t("profile.noTeam")} hint={t("profile.noTeamHint")}>
              <Link to="/team" className="text-[13px] text-accent hover:underline">
                {t("profile.connect")}
              </Link>
            </Section>
          )}
          <AccountsSection accounts={accounts} reload={() => undefined} />
          <Section title={t("profile.language")} hint={t("profile.languageHint")}>
            <LanguagePicker value={settings.language} onChange={(language) => void update({ language })} />
          </Section>
          <Section title={t("notify.setting")} hint={t("notify.settingHint")}>
            <Segmented
              label={t("notify.setting")}
              value={settings.notifications ? "on" : "off"}
              onChange={async (v) => {
                // The system asks first, as in Settings; a "no" there leaves it off.
                if (v === "on" && !(await askNotificationPermission())) return;
                await update({ notifications: v === "on" });
              }}
              options={onOff}
            />
          </Section>
          {people.status?.configured && (
            <Section title={t("company.shareTitle")} hint={t("company.shareHint")}>
              <Segmented
                label={t("company.shareTitle")}
                value={settings.shareUsage ? "on" : "off"}
                onChange={(v) => void update({ shareUsage: v === "on" })}
                options={onOff}
              />
            </Section>
          )}
          <p className="mt-6 flex items-center gap-1.5 text-[12.5px] text-fg-subtle">
            <SettingsIcon size={13} aria-hidden="true" />
            <Link to="/settings" className="text-accent hover:underline">
              {t("profile.moreSettings")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
