import type { PluginInfo } from "@igrek/core";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
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
import { PageHeader } from "../../components/ui";
import { cn } from "../../lib/cn";
import { pluginApi } from "../../lib/ops-api";
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
import { DomainsTab, UptimeTab } from "./Uptime";
import { VaultTab } from "./Vault";

const TOOL_TABS: { key: string; icon: LucideIcon }[] = [
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
  const asked = params.get("tab") ?? "uptime";
  const tab = TOOL_TABS.some((x) => x.key === asked) || pluginTabs.some((x) => x.key === asked) ? asked : "uptime";
  const pluginTab = pluginTabs.find((x) => x.key === tab);
  const button = (key: string, Icon: LucideIcon, label: string) => (
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
      {label}
    </button>
  );
  return (
    <>
      <PageHeader title={t("suite.title")} />
      {/* Wrapped, not scrolled: with fourteen tabs the last ones were cut off and nothing said there was more. */}
      <nav className="flex shrink-0 flex-wrap gap-x-1 border-b border-border px-6" aria-label={t("suite.title")}>
        {TOOL_TABS.map(({ key, icon }) => button(key, icon, t(`suite.${key}`)))}
        {pluginTabs.map((x) => button(x.key, Puzzle, x.title))}
      </nav>
      <div className="mx-auto w-full max-w-6xl p-6">
        {pluginTab ? (
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
