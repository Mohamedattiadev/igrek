import type { SystemStatus } from "@igrek/core";
import { AlertTriangle, AppWindow, Check, CheckCircle2, Circle, Compass, Palette, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { AutostartPanel, DesktopUpdatePanel } from "../components/DesktopPanels";
import { EnhanceSettings } from "../components/EnhanceSettings";
import { ExtensionPanel } from "../components/ExtensionPanel";
import { FixButton } from "../components/FixButton";
import { LanguagePackPanel } from "../components/LanguagePack";
import { LanguagePicker } from "../components/LanguagePicker";
import {
  BackupPanel,
  BridgesPanel,
  DiskPanel,
  LocalModelPanel,
  McpServersPanel,
  MovePanel,
  NetworkPanel,
  UpdatePanel,
} from "../components/MaintenancePanels";
import { NavColors } from "../components/NavColors";
import { PrivatePanel } from "../components/PrivatePanel";
import { Badge, Button, Card, PageHeader, Section, Segmented, useModelTip } from "../components/ui";
import { api } from "../lib/api";
import { inDesktopApp } from "../lib/desktop";
import { useInstallApp } from "../lib/install";
import { askNotificationPermission } from "../lib/notify";
import { useSettings } from "../lib/settings";
import { startTour } from "../lib/tour";

/** One AI or system tool: found, missing or broken, and for Claude Code and Codex a one-click install. */
function ToolRow({ tool }: { tool: SystemStatus["tools"][number] }) {
  const { t } = useTranslation();
  return (
    <li data-nav-item tabIndex={-1} className="flex h-row items-center gap-3 px-3 text-[13px]">
      {tool.broken ? (
        <AlertTriangle size={15} className="text-warning" />
      ) : tool.found ? (
        <CheckCircle2 size={15} className="text-success" />
      ) : tool.required ? (
        <XCircle size={15} className="text-danger" />
      ) : (
        <Circle size={15} className="text-fg-subtle" />
      )}
      <span className="w-16 font-medium">{tool.id}</span>
      <span className="flex-1 truncate font-mono text-xs text-fg-subtle">{tool.version}</span>
      {(tool.id === "claude" || tool.id === "codex") && (tool.broken || !tool.found) && (
        <FixButton
          fix={tool.id === "claude" ? "install-claude" : "install-codex"}
          label={tool.broken ? t("fix.reinstall") : t("fix.install")}
        />
      )}
      {tool.broken ? (
        <Badge tone="warning">{t("settings.broken")}</Badge>
      ) : tool.found ? (
        <Badge tone="success">{t("settings.found")}</Badge>
      ) : (
        <Badge tone={tool.required ? "danger" : "neutral"}>
          {t("settings.missing")}
          {!tool.required && ` · ${t("settings.optional")}`}
        </Badge>
      )}
    </li>
  );
}

function SystemCheck() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SystemStatus>();

  useEffect(() => {
    api
      .system()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  if (!status) return <div className="h-40 animate-pulse rounded-ui bg-bg-subtle" />;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {status.tools.map((tool) => (
          <ToolRow key={tool.id} tool={tool} />
        ))}
      </ul>
      <p className="border-t border-border px-3 py-2 text-xs text-fg-subtle">
        {t("settings.dataDir")} <code className="font-mono text-fg-muted">{status.dataDir}</code>
      </p>
    </Card>
  );
}

function McpSetup() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ installed: boolean; command: string; inContainer: boolean }>();
  const [error, setError] = useState<string>();
  const load = () => {
    api
      .mcpStatus()
      .then(setStatus)
      .catch(() => undefined);
  };
  useEffect(load, []);
  const toggle = async () => {
    setError(undefined);
    try {
      await (status?.installed ? api.removeMcp() : api.installMcp());
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  if (!status) return <div className="h-9 animate-pulse rounded-ui bg-bg-subtle" />;
  return (
    <div className="space-y-2">
      {status.inContainer ? (
        <>
          <p className="text-xs text-fg-muted">{t("mcp.manual")}</p>
          <code className="block break-all rounded-ui border border-border bg-bg-subtle p-2 font-mono text-[11px]">
            {status.command}
          </code>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Badge tone={status.installed ? "success" : "neutral"}>
            {status.installed ? t("mcp.installed") : t("setup.off")}
          </Badge>
          <Button variant={status.installed ? "secondary" : "primary"} onClick={toggle}>
            {status.installed ? t("mcp.remove") : t("mcp.install")}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Igrek in a window of its own, from the browser's install offer; otherwise how to find it. */
function InstallApp() {
  const { t } = useTranslation();
  const app = useInstallApp();
  if (app.installed) return <p className="text-[12.5px] text-success">{t("install.done")}</p>;
  if (!app.available) return <p className="text-[12.5px] text-fg-muted">{t("install.manual")}</p>;
  return (
    <Button icon={AppWindow} onClick={() => void app.install()}>
      {t("install.button")}
    </Button>
  );
}

/** In the desktop app: whether it starts with the computer. In a browser: how to get a window of its own. */
function AppSection() {
  const { t } = useTranslation();
  return inDesktopApp ? (
    <Section title={t("desktop.autostart")} hint={t("desktop.autostartHint")}>
      <AutostartPanel />
    </Section>
  ) : (
    <Section title={t("install.title")} hint={t("install.hint")}>
      <InstallApp />
    </Section>
  );
}

/** The desktop app updates itself for everyone; a copy from source shows its git update in Pro mode. */
function UpdateSection({ pro }: { pro: boolean }) {
  const { t } = useTranslation();
  // The top bar's "new version" chip links here (#update).
  const here = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.location.hash === "#update") here.current?.scrollIntoView({ block: "center" });
  }, []);
  if (inDesktopApp)
    return (
      <div id="update" ref={here}>
        <Section title={t("update.title")} hint={t("desktop.updateHint")}>
          <DesktopUpdatePanel />
        </Section>
      </div>
    );
  if (!pro) return null;
  return (
    <Section title={t("update.title")} hint={t("update.hint")}>
      <UpdatePanel />
    </Section>
  );
}

/** What the AI may and may not do here, in plain sentences (a first-time user could not find it). */
function AiMay({ gateway }: { gateway: boolean }) {
  const { t } = useTranslation();
  const lines = ["files", "ship", gateway ? "private" : "privateOff", "keys", "nothing"] as const;
  return (
    <ul className="space-y-1.5 text-[13px]">
      {lines.map((key) => (
        <li key={key} className="flex gap-2">
          <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          <span>{t(`settings.aiMay_${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The page's four parts, so a long page can be jumped through (a screen reader user could not find privacy). */
const GROUPS = ["look", "ai", "privacy", "data", "system"] as const;

function GroupIndex({ tab, onPick }: { tab: (typeof GROUPS)[number]; onPick: (tab: (typeof GROUPS)[number]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-border bg-bg px-6 py-2">
      <Segmented
        label={t("settings.groupsLabel")}
        value={tab}
        onChange={onPick}
        options={GROUPS.map((id) => ({ value: id, label: t(`settings.group_${id}`) }))}
      />
    </div>
  );
}

function PartLook() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const pro = settings.mode === "pro";
  return (
    <>
      <Section title={t("settings.language")} hint={t("settings.languageHint")}>
        <LanguagePicker value={settings.language} onChange={(language) => void update({ language })} />
        <LanguagePackPanel code={settings.language} />
      </Section>
      <AppSection />
      <Section title={t("settings.theme")}>
        <Segmented
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "light", label: t("settings.themeLight") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "darcula", label: "Darcula", tip: t("settings.themeDarculaTip") },
            { value: "notion", label: t("settings.themeNotion"), tip: t("settings.themeNotionTip") },
          ]}
        />
      </Section>
      <Section title={t("navColors.title")} hint={t("navColors.hint")}>
        <NavColors />
      </Section>
      {pro && (
        <Section title={t("nav.design")} hint={t("settings.designHint")}>
          <Link
            to="/design"
            className="inline-flex items-center gap-2 rounded-ui border border-border px-3 py-1.5 text-[13px] font-medium hover:border-accent"
          >
            <Palette size={14} className="text-accent" aria-hidden="true" />
            {t("settings.openDesign")}
          </Link>
        </Section>
      )}
      <Section title={t("tour.title")} hint={t("tour.hint")}>
        <Button icon={Compass} onClick={startTour}>
          {t("tour.start")}
        </Button>
      </Section>
      <Section title={t("settings.textSize")} hint={t("settings.textSizeHint")}>
        <Segmented
          value={settings.textSize ?? "normal"}
          onChange={(textSize) => update({ textSize })}
          options={[
            { value: "normal", label: t("settings.textNormal") },
            { value: "large", label: t("settings.textLarge") },
            { value: "larger", label: t("settings.textLarger") },
          ]}
        />
      </Section>
      {pro && (
        <Section title={t("settings.density")}>
          <Segmented
            value={settings.density}
            onChange={(density) => update({ density })}
            options={[
              { value: "comfortable", label: t("settings.densityComfortable") },
              { value: "compact", label: t("settings.densityCompact") },
            ]}
          />
        </Section>
      )}
      <Section
        title={t("settings.mode")}
        hint={settings.mode === "simple" ? t("settings.modeSimpleHint") : t("settings.modeProHint")}
      >
        <Segmented
          value={settings.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: "simple", label: t("settings.modeSimple") },
            { value: "pro", label: t("settings.modePro") },
          ]}
        />
      </Section>
      {pro && (
        <Section title={t("settings.keymap")} hint={t("settings.keymapVimHint")}>
          <Segmented
            value={settings.keymap}
            onChange={(keymap) => update({ keymap })}
            options={[
              { value: "default", label: t("settings.keymapDefault") },
              { value: "vim", label: t("settings.keymapVim") },
            ]}
          />
        </Section>
      )}
      <Section title={t("notify.setting")} hint={t("notify.settingHint")}>
        <Segmented
          value={settings.notifications ? "on" : "off"}
          onChange={async (value) => {
            if (value === "on" && !(await askNotificationPermission())) return;
            await update({ notifications: value === "on" });
          }}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
    </>
  );
}

function PartAi() {
  const { t } = useTranslation();
  const modelTip = useModelTip();
  const { settings, update } = useSettings();
  const pro = settings.mode === "pro";
  return (
    <>
      <Section title={t("settings.autoSummarize")} hint={t("settings.autoSummarizeHint")}>
        <Segmented
          value={settings.autoSummarize ? "on" : "off"}
          onChange={(value) => update({ autoSummarize: value === "on" })}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      <Section title={t("settings.richAnswers")} hint={t("settings.richAnswersHint")}>
        <Segmented
          value={settings.richAnswers ? "on" : "off"}
          onChange={(value) => update({ richAnswers: value === "on" })}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      <Section title={t("settings.autoProjects")} hint={t("settings.autoProjectsHint")}>
        <Segmented
          value={settings.autoProjects ? "on" : "off"}
          onChange={(value) => update({ autoProjects: value === "on" })}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      <Section title={t("settings.consultExperts")} hint={t("settings.consultExpertsHint")}>
        <Segmented
          value={settings.consultExperts ? "on" : "off"}
          onChange={(value) => update({ consultExperts: value === "on" })}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      <Section title={t("settings.autoReview")} hint={modelTip(t("settings.autoReviewHint"))}>
        <Segmented
          value={settings.autoReview ? "on" : "off"}
          onChange={(value) => update({ autoReview: value === "on" })}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      </Section>
      {pro && (
        <Section title={t("settings.turnGate")} hint={t("settings.turnGateHint")}>
          <Segmented
            value={settings.turnGate}
            onChange={(turnGate) => update({ turnGate })}
            options={[
              { value: "off", label: t("settings.off") },
              { value: "check", label: t("settings.turnGateCheck") },
              { value: "sendBack", label: t("settings.turnGateSendBack") },
            ]}
          />
        </Section>
      )}
      {pro && (
        <Section title={t("settings.tone")} hint={t("settings.toneHint")}>
          <Segmented
            value={settings.summaryTone}
            onChange={(summaryTone) => update({ summaryTone })}
            options={[
              { value: "plain", label: t("settings.tonePlain") },
              { value: "technical", label: t("settings.toneTechnical") },
            ]}
          />
        </Section>
      )}
      <Section title={t("settings.enhance")} hint={t("settings.enhanceHint")}>
        <div className="space-y-3">
          <Segmented
            value={settings.enhanceMode}
            onChange={(enhanceMode) => update({ enhanceMode })}
            options={(["off", "suggest", "auto"] as const).map((m) => ({
              value: m,
              label: t(`settings.enhance_${m}`),
              tip: t(`settings.enhanceTip_${m}`),
            }))}
          />
          <div className="flex items-center gap-3 text-xs text-fg-muted">
            <span>{t("settings.enhanceLanguage")}</span>
            <Segmented
              value={settings.enhanceLanguage}
              onChange={(enhanceLanguage) => update({ enhanceLanguage })}
              options={[
                { value: "en", label: "English", tip: t("settings.enhanceLangTip_en") },
                { value: "user", label: t("settings.enhanceLang_user"), tip: t("settings.enhanceLangTip_user") },
              ]}
            />
          </div>
          <EnhanceSettings />
        </div>
      </Section>
      {pro && (
        <Section title={t("mcp.title")} hint={t("mcp.hint")}>
          <McpSetup />
        </Section>
      )}
      {pro && (
        <Section title={t("bridges.title")} hint={t("bridges.hint")}>
          <BridgesPanel />
        </Section>
      )}
      {pro && (
        <Section title={t("mcpServers.title")} hint={t("mcpServers.hint")}>
          <McpServersPanel />
        </Section>
      )}
      {pro && (
        <Section title={t("localModel.title")} hint={t("localModel.hint")}>
          <LocalModelPanel />
        </Section>
      )}
    </>
  );
}

function PartPrivacy() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  return (
    <>
      <Section title={t("settings.aiMay")}>
        <AiMay gateway={settings.privacyGateway} />
      </Section>
      <Section title={t("private.title")} hint={t("private.hint")}>
        <PrivatePanel />
      </Section>
      <Section title={t("extension.title")} hint={t("extension.hint")}>
        <ExtensionPanel />
      </Section>
      <Section title={t("network.title")} hint={t("network.hint")}>
        <NetworkPanel />
      </Section>
    </>
  );
}

function PartData() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const pro = settings.mode === "pro";
  return (
    <>
      <Section title={t("backup.title")} hint={t("backup.hint")}>
        <BackupPanel />
      </Section>
      {pro && (
        <Section title={t("move.title")} hint={t("move.hint")}>
          <MovePanel />
        </Section>
      )}
      {pro && (
        <Section title={t("disk.title")} hint={t("disk.hint")}>
          <DiskPanel />
        </Section>
      )}
    </>
  );
}

function PartSystem() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const pro = settings.mode === "pro";
  return (
    <>
      <UpdateSection pro={pro} />
      <Section title={t("settings.system")} hint={t("settings.systemHint")}>
        <SystemCheck />
      </Section>
    </>
  );
}

/** Settings in parts; in simple mode (the default) each leaves out what only developers set. */
export function SettingsPage() {
  const { t } = useTranslation();
  // One part at a time (plan.md 19.8): the whole page was a long scroll. The update chip opens System.
  const [params, setParams] = useSearchParams();
  const tab = GROUPS.find((g) => g === params.get("tab")) ?? (window.location.hash === "#update" ? "system" : "look");
  const setTab = (next: (typeof GROUPS)[number]) => setParams(next === "look" ? {} : { tab: next }, { replace: true });

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="mx-auto w-full max-w-4xl px-6">
        <GroupIndex tab={tab} onPick={setTab} />
        {tab === "look" && <PartLook />}
        {tab === "ai" && <PartAi />}
        {tab === "privacy" && <PartPrivacy />}
        {tab === "data" && <PartData />}
        {tab === "system" && <PartSystem />}
      </div>
    </>
  );
}
