import type { PluginInfo } from "@igrek/core";
import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Compass,
  Container,
  Database,
  Globe,
  HardDriveDownload,
  KeyRound,
  Plug,
  Puzzle,
  Radio,
  ScanSearch,
  ScrollText,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { PageHeader, Segmented, TabBar } from "../../components/ui";
import { pluginApi } from "../../lib/ops-api";
import { PromptsPage } from "../Prompts";
import { SchedulesPage } from "../SchedulesPage";
import { BackupsTab } from "./Backups";
import { CalendarTab } from "./Calendar";
import { CostsTab } from "./Costs";
import { DatabasesTab } from "./Databases";
import { DockerTab } from "./Docker";
import { LogsPanel } from "./Logs";
import { PhoneTab } from "./Phone";
import { PluginFrame, PluginsTab } from "./Plugins";
import { ReaTab } from "./Rea";
import { SkillsTab } from "./Skills";
import { TimeTab } from "./Time";
import { ToolsStart } from "./ToolsStart";
import { DomainsTab, UptimeTab } from "./Uptime";
import { VaultTab } from "./Vault";

const TOOL_TABS: { key: string; icon: LucideIcon }[] = [
  // Scheduled work and prompts are tools too (a user looked for them here).
  { key: "schedules", icon: CalendarClock },
  { key: "prompts", icon: BookMarked },
  { key: "uptime", icon: Radio },
  { key: "domains", icon: Globe },
  { key: "docker", icon: Container },
  { key: "logs", icon: ScrollText },
  { key: "databases", icon: Database },
  { key: "phone", icon: Smartphone },
  { key: "skills", icon: Sparkles },
  { key: "rea", icon: ScanSearch },
  { key: "backups", icon: HardDriveDownload },
  { key: "calendar", icon: CalendarDays },
  { key: "vault", icon: KeyRound },
  { key: "costs", icon: CircleDollarSign },
  { key: "time", icon: Clock },
  { key: "plugins", icon: Plug },
];

const TABS: Record<string, () => React.ReactNode> = {
  schedules: () => <SchedulesPage embedded />,
  prompts: () => <PromptsPage embedded />,
  uptime: () => <UptimeTab />,
  domains: () => <DomainsTab />,
  docker: () => <DockerTab />,
  logs: () => <LogsPanel />,
  databases: () => <DatabasesTab />,
  phone: () => <PhoneTab />,
  skills: () => <SkillsTab />,
  rea: () => <ReaTab />,
  backups: () => <BackupsTab />,
  calendar: () => <CalendarTab />,
  vault: () => <VaultTab />,
  costs: () => <CostsTab />,
  time: () => <TimeTab />,
};

/** The suite's tools in one place (plan.md 12): nothing else to open for running your projects. */
export function ToolsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const loadPlugins = useCallback(
    () =>
      void pluginApi
        .list()
        .then((l) => setPlugins(l.filter((p) => p.enabled)))
        .catch(() => undefined),
    [],
  );
  useEffect(loadPlugins, [loadPlugins]);
  // Enabled plugins' Tools pages come after the built-in tabs, as "plugin:<id>:<panel>".
  const pluginTabs = plugins.flatMap((p) =>
    p.panels
      .filter((x) => x.place === "tools")
      .map((x) => ({ key: `plugin:${p.id}:${x.id}`, title: x.title, plugin: p, entry: x.entry })),
  );
  // The page opens on "Start": a box to say what you want and every tool with what it is for.
  const asked = params.get("tab") ?? "start";
  const tab = TOOL_TABS.some((x) => x.key === asked) || pluginTabs.some((x) => x.key === asked) ? asked : "start";
  const pluginTab = pluginTabs.find((x) => x.key === tab);
  return (
    <>
      <PageHeader title={t("suite.title")} />
      {/* Wrapped, not scrolled: with fourteen tabs the last ones were cut off and nothing said there was more. */}
      <TabBar>
        <Segmented
          label={t("suite.title")}
          value={tab}
          wrap
          onChange={(key) => setParams({ tab: key })}
          options={[
            { value: "start", label: t("suite.start"), icon: Compass },
            ...TOOL_TABS.map(({ key, icon }) => ({ value: key as string, label: t(`suite.${key}`), icon })),
            ...pluginTabs.map((x) => ({ value: x.key, label: x.title, icon: Puzzle })),
          ]}
        />
      </TabBar>
      <div className="mx-auto w-full max-w-6xl p-6">
        {tab === "start" ? (
          <ToolsStart tools={TOOL_TABS} onOpen={(key) => setParams({ tab: key })} />
        ) : pluginTab ? (
          <PluginFrame key={pluginTab.key} plugin={pluginTab.plugin} entry={pluginTab.entry} />
        ) : tab === "plugins" ? (
          <PluginsTab onChange={loadPlugins} />
        ) : (
          (TABS[tab] ?? TABS.uptime)?.()
        )}
      </div>
    </>
  );
}
