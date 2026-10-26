import type { CommandRisk, RemoteRun } from "@igrek/core";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RiskBadge } from "../../components/RiskBadge";
import { Badge, Button, Dialog } from "../../components/ui";
import { api } from "../../lib/api";

/**
 * Before a fix or a restart runs on a server: the exact command, how risky Igrek finds it, and on a
 * production server or for a dangerous command a second, explicit "yes". The server side checks the
 * same count of confirmations again (Servers.run).
 */
export function ConfirmRun({
  open,
  title,
  command,
  production,
  onClose,
  run,
}: {
  open: boolean;
  title: string;
  command: string;
  production: boolean;
  onClose: () => void;
  run: (confirmations: number) => Promise<RemoteRun>;
}) {
  const { t } = useTranslation();
  const [risk, setRisk] = useState<CommandRisk>();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemoteRun>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    setSure(false);
    setResult(undefined);
    setError(undefined);
    void api
      .classify(command)
      .then((r) => current && setRisk(r.risk))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [open, command]);
  const needsSure = risk === "danger" || production;
  const go = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await run(risk === "danger" ? 2 : 1));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} label={title} wide>
      <div className="space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          {title} {risk && <RiskBadge risk={risk} />}
          {production && <Badge tone="danger">{t("servers.tag_prod")}</Badge>}
        </h2>
        <p className="text-[12.5px] text-fg-muted">{t("serverFix.willRun")}</p>
        <pre className="max-h-40 overflow-auto rounded-ui bg-bg-subtle p-3 font-mono text-[12px] whitespace-pre-wrap">
          {command}
        </pre>
        {needsSure && !result && (
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5" />
            {production ? t("serverFix.sureProd") : t("serverFix.sure")}
          </label>
        )}
        {result && (
          <div className="space-y-1">
            <Badge tone={result.exitCode === 0 ? "success" : "danger"}>
              {result.exitCode === 0 ? t("serverFix.done") : t("serverFix.failed", { code: result.exitCode })}
            </Badge>
            <pre className="max-h-60 overflow-auto rounded-ui border border-border p-3 font-mono text-[11.5px] whitespace-pre-wrap">
              {result.output || "—"}
            </pre>
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {result ? t("serverFix.close") : t("teamChat.cancel")}
          </Button>
          {!result && (
            <Button
              variant={risk === "danger" ? "danger" : "primary"}
              icon={Play}
              disabled={busy || !risk || (needsSure && !sure)}
              onClick={() => void go()}
            >
              {busy ? t("serverFix.running") : t("serverFix.run")}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
