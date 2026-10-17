import type { LucideIcon } from "lucide-react";
import { CalendarDays, Container, Database, Globe, HardDriveDownload, KeyRound, Radio, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PageHeader } from "../../components/ui";
import { cn } from "../../lib/cn";
import { BackupsTab } from "./Backups";
import { CalendarTab } from "./Calendar";
import { DatabasesTab } from "./Databases";
import { DockerTab } from "./Docker";
import { LogsPanel } from "./Logs";
import { DomainsTab, UptimeTab } from "./Uptime";
import { VaultTab } from "./Vault";

export const TOOL_TABS: { key: string; icon: LucideIcon }[] = [
  { key: "uptime", icon: Radio },
  { key: "domains", icon: Globe },
  { key: "docker", icon: Container },
  { key: "logs", icon: ScrollText },
  { key: "databases", icon: Database },
  { key: "backups", icon: HardDriveDownload },
  { key: "calendar", icon: CalendarDays },
  { key: "vault", icon: KeyRound },
];

/** The suite's tools in one place (plan.md 12): nothing else to open for running your projects. */
export function ToolsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = TOOL_TABS.find((x) => x.key === params.get("tab"))?.key ?? "uptime";
  return (
    <>
      <PageHeader title={t("suite.title")} />
      <nav className="flex gap-1 overflow-x-auto border-b border-border px-6" aria-label={t("suite.title")}>
        {TOOL_TABS.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setParams({ tab: key })}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === key ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {t(`suite.${key}`)}
          </button>
        ))}
      </nav>
      <div className="mx-auto w-full max-w-6xl p-6">
        {tab === "uptime" ? (
          <UptimeTab />
        ) : tab === "domains" ? (
          <DomainsTab />
        ) : tab === "docker" ? (
          <DockerTab />
        ) : tab === "databases" ? (
          <DatabasesTab />
        ) : tab === "backups" ? (
          <BackupsTab />
        ) : tab === "calendar" ? (
          <CalendarTab />
        ) : tab === "vault" ? (
          <VaultTab />
        ) : (
          <LogsPanel />
        )}
      </div>
    </>
  );
}
