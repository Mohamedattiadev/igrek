import type { ServerInfo } from "@igrek/core";
import { ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { api, type ServerFinding } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { ConfirmRun } from "./ConfirmRun";

const TONE = { high: "danger", medium: "warning", low: "neutral", info: "accent" } as const;
const ICON = { high: "text-danger", medium: "text-warning", low: "text-fg-subtle", info: "text-accent" } as const;

/**
 * Security and health of one server in plain findings: what is wrong, why it matters, and the
 * exact fix where there is a safe one. Reading is free; every fix asks first and is logged.
 */
export function ServerSecurity({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const [scan, setScan] = useState<{ findings: ServerFinding[]; unread: string[]; at: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fixing, setFixing] = useState<ServerFinding>();
  const run = () => {
    setBusy(true);
    setError(undefined);
    void api
      .serverSecurity(server.id)
      .then(setScan)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-pad">
        <div className="max-w-2xl">
          <p className="text-[13.5px] font-medium">{t("serverAudit.title")}</p>
          <p className="text-[12.5px] text-fg-muted">{t("serverAudit.hint")}</p>
          {scan && (
            <p className="mt-1 text-[11.5px] text-fg-subtle">
              {t("serverAudit.scanned", { when: relativeTime(scan.at) })}
            </p>
          )}
        </div>
        <Button variant="primary" icon={ShieldCheck} disabled={busy} onClick={run}>
          {busy ? t("serverAudit.scanning") : scan ? t("serverAudit.again") : t("serverAudit.scan")}
        </Button>
      </Card>
      {error && <p className="text-xs text-danger">{error}</p>}
      {scan && scan.findings.length === 0 && (
        <EmptyState icon={ShieldCheck} title={t("serverAudit.cleanTitle")} body={t("serverAudit.cleanBody")} />
      )}
      {scan && scan.unread.length > 0 && (
        <p className="text-[12px] text-fg-subtle">{t("serverAudit.unread", { what: scan.unread.join(", ") })}</p>
      )}
      <ul className="space-y-2">
        {scan?.findings.map((f) => (
          <li key={f.id}>
            <Card className="flex items-start gap-3 p-pad">
              <ShieldAlert size={17} className={`mt-0.5 shrink-0 ${ICON[f.severity]}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                  {t(`serverAudit.${f.id}_title`, f.detail)}
                  <Badge tone={TONE[f.severity]}>{t(`serverAudit.sev_${f.severity}`)}</Badge>
                </p>
                <p className="text-[12.5px] leading-relaxed text-fg-muted">{t(`serverAudit.${f.id}_why`, f.detail)}</p>
              </div>
              {f.fix && (
                <Button size="sm" icon={Wrench} onClick={() => setFixing(f)}>
                  {t("serverAudit.fix")}
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmRun
        open={!!fixing}
        title={fixing ? t(`serverAudit.${fixing.id}_title`, fixing.detail) : ""}
        command={fixing?.fix ?? ""}
        production={server.tag === "prod"}
        onClose={() => {
          setFixing(undefined);
          if (scan) run();
        }}
        run={(confirmations) => api.fixOnServer(server.id, fixing?.id ?? "", confirmations)}
      />
    </div>
  );
}
