import type { SystemStatus } from "@godeye/core";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../components/LanguagePicker";
import { Badge, Card, PageHeader, Section, Segmented } from "../components/ui";
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
        <Section title={t("settings.system")} hint={t("settings.systemHint")}>
          <SystemCheck />
        </Section>
      </div>
    </>
  );
}
