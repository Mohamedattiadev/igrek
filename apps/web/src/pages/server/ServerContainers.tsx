import type { ServerInfo } from "@igrek/core";
import { RotateCcw, ScrollText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, Dialog, StatusDot } from "../../components/ui";
import { api } from "../../lib/api";
import { ConfirmRun } from "./ConfirmRun";

/** The server's containers with their recent log and a restart that asks first. */
export function ServerContainers({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<{ name: string; text?: string; error?: string }>();
  const [restart, setRestart] = useState<string>();
  const containers = server.health?.containers ?? [];
  if (!containers.length) return null;
  const showLogs = (name: string) => {
    setLogs({ name });
    void api
      .containerLogs(server.id, name)
      .then((r) => setLogs({ name, text: r.output }))
      .catch((err: Error) => setLogs({ name, error: err.message }));
  };
  return (
    <Card className="p-pad">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("servers.containers")}</h3>
      <ul className="divide-y divide-border">
        {containers.map((c) => (
          <li key={c.name} className="flex items-center gap-2 py-1.5 text-xs">
            <StatusDot tone={c.status.startsWith("Up") ? "success" : "danger"} />
            <span className="min-w-0 flex-1 truncate font-mono" title={c.name}>
              {c.name}
            </span>
            <span className="hidden shrink-0 text-[11px] text-fg-subtle sm:inline">{c.status}</span>
            <Button
              size="sm"
              variant="ghost"
              icon={ScrollText}
              onClick={() => showLogs(c.name)}
              aria-label={t("serverFix.logs", { name: c.name })}
              data-tip={t("serverFix.logs", { name: c.name })}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              onClick={() => setRestart(c.name)}
              aria-label={t("serverFix.restart", { name: c.name })}
              data-tip={t("serverFix.restart", { name: c.name })}
            />
          </li>
        ))}
      </ul>
      <Dialog
        open={!!logs}
        onClose={() => setLogs(undefined)}
        label={t("serverFix.logs", { name: logs?.name ?? "" })}
        wide
      >
        <div className="space-y-2 p-5">
          <h2 className="font-mono text-[14px] font-semibold">{logs?.name}</h2>
          {logs?.error && <p className="text-xs text-danger">{logs.error}</p>}
          <pre className="max-h-[65vh] overflow-auto rounded-ui bg-bg-subtle p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
            {logs?.text ?? (logs?.error ? "" : t("serverFix.loading"))}
          </pre>
        </div>
      </Dialog>
      <ConfirmRun
        open={!!restart}
        title={t("serverFix.restart", { name: restart ?? "" })}
        command={`docker restart ${restart ?? ""}`}
        production={server.tag === "prod"}
        onClose={() => setRestart(undefined)}
        run={(confirmations) => api.restartContainer(server.id, restart ?? "", confirmations)}
      />
    </Card>
  );
}
