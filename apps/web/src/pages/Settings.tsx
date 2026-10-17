import type { SystemStatus } from "@godeye/core";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EnhanceSettings } from "../components/EnhanceSettings";
import { LanguagePicker } from "../components/LanguagePicker";
import { Badge, Button, Card, PageHeader, Section, Segmented } from "../components/ui";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings";

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
          <li key={tool.id} data-nav-item tabIndex={-1} className="flex h-row items-center gap-3 px-3 text-[13px]">
            {tool.found ? (
              <CheckCircle2 size={15} className="text-success" />
            ) : tool.required ? (
              <XCircle size={15} className="text-danger" />
            ) : (
              <Circle size={15} className="text-fg-subtle" />
            )}
            <span className="w-16 font-medium">{tool.id}</span>
            <span className="flex-1 truncate font-mono text-xs text-fg-subtle">{tool.version}</span>
            {tool.found ? (
              <Badge tone="success">{t("settings.found")}</Badge>
            ) : (
              <Badge tone={tool.required ? "danger" : "neutral"}>
                {t("settings.missing")}
                {!tool.required && ` · ${t("settings.optional")}`}
              </Badge>
            )}
          </li>
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

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  return (
    <>
      <PageHeader title={t("settings.title")} />
      <div className="mx-auto w-full max-w-4xl px-6">
        <Section title={t("settings.language")} hint={t("settings.languageHint")}>
          <LanguagePicker value={settings.language} onChange={(language) => update({ language })} />
        </Section>
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
        <Section title={t("mcp.title")} hint={t("mcp.hint")}>
          <McpSetup />
        </Section>
        <Section title={t("settings.system")} hint={t("settings.systemHint")}>
          <SystemCheck />
        </Section>
      </div>
    </>
  );
}
