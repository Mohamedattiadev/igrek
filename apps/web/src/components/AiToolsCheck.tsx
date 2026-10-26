import type { SystemStatus } from "@igrek/core";
import { CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { FixButton } from "./FixButton";
import { Button, CopyButton } from "./ui";

const WINDOWS = navigator.userAgent.includes("Windows");

/** Igrek does not carry the AI tools; these are each maker's own install commands. */
const TOOLS = [
  {
    id: "claude",
    name: "Claude Code",
    command: WINDOWS ? "irm https://claude.ai/install.ps1 | iex" : "curl -fsSL https://claude.ai/install.sh | bash",
    docs: "https://claude.com/claude-code",
  },
  {
    id: "codex",
    name: "Codex",
    command: "npm install -g @openai/codex",
    docs: "https://github.com/openai/codex",
  },
] as const;

/**
 * First run: whether Claude Code and Codex are on this computer (the same check as Settings >
 * System), and for each one that is not, the command that installs it.
 */
export function AiToolsCheck({ onTerminal }: { onTerminal?: (id: string) => void } = {}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SystemStatus>();
  const [checking, setChecking] = useState(false);
  const load = useCallback((fresh: boolean) => {
    setChecking(true);
    api
      .system(fresh)
      .then(setStatus)
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => load(false), [load]);
  if (!status) return null;
  const found = (id: string) => status.tools.some((tool) => tool.id === id && tool.found);
  return (
    <div className="space-y-2 rounded-ui border border-border p-3 text-[13px]">
      <p className="font-medium">{t("onboarding.toolsTitle")}</p>
      <p className="text-[12.5px] leading-relaxed text-fg-muted">{t("onboarding.toolsBody")}</p>
      <ul className="space-y-2">
        {TOOLS.map((tool) =>
          found(tool.id) ? (
            <li key={tool.id} className="flex items-center gap-1.5 text-success">
              <CheckCircle2 size={14} aria-hidden="true" />
              {t("onboarding.toolsFound", { tool: tool.name })}
            </li>
          ) : (
            <li key={tool.id} className="space-y-1">
              <p className="flex items-center gap-1.5">
                <XCircle size={14} className="text-fg-subtle" aria-hidden="true" />
                {t("onboarding.toolsMissing", { tool: tool.name })}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-ui bg-bg-subtle px-2 py-1 font-mono text-[12px]">
                  {tool.command}
                </code>
                <CopyButton text={tool.command} />
              </div>
              <FixButton
                fix={tool.id === "claude" ? "install-claude" : "install-codex"}
                label={t("fix.installTool", { tool: tool.name })}
                onTerminal={onTerminal}
              />
              <a
                href={tool.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent-hover underline"
              >
                <ExternalLink size={12} aria-hidden="true" />
                {t("onboarding.toolsMore", { tool: tool.name })}
              </a>
            </li>
          ),
        )}
      </ul>
      {!(found("claude") && found("codex")) && (
        <Button size="sm" variant="ghost" icon={RefreshCw} disabled={checking} onClick={() => load(true)}>
          {t("onboarding.toolsRecheck")}
        </Button>
      )}
    </div>
  );
}
