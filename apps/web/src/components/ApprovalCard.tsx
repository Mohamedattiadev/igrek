import type { Approval } from "@igrek/core";
import { Server } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { RiskBadge } from "./RiskBadge";
import { Badge, Button, Card } from "./ui";

/** An AI agent's request to run a command on a server; dangerous ones need an extra tick. */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const { t } = useTranslation();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await api.decide(approval.id, approve);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      className={approval.risk === "danger" ? "space-y-2.5 border-danger p-pad" : "space-y-2.5 border-warning p-pad"}
    >
      <div className="flex items-center gap-2 text-[13px]">
        <Server size={14} className="text-fg-subtle" />
        <span className="font-medium">{approval.serverName}</span>
        {approval.serverTag === "prod" && <Badge tone="danger">{t("servers.tag_prod")}</Badge>}
        <RiskBadge risk={approval.risk} />
        <span className="ms-auto text-[11px] text-fg-subtle">{relativeTime(approval.requestedAt)}</span>
      </div>
      <pre className="overflow-x-auto rounded-md bg-bg-subtle p-2.5 font-mono text-[12px]">{approval.command}</pre>
      {approval.reason && (
        <p className="text-xs text-fg-muted">
          <span className="font-semibold">{t("approvals.why")}: </span>
          {approval.reason}
        </p>
      )}
      {approval.risk === "danger" && (
        <label className="flex items-center gap-2 text-xs text-danger">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          {t("approvals.dangerCheck")}
        </label>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={approval.risk === "danger" ? "danger" : "primary"}
          disabled={busy || (approval.risk === "danger" && !understood)}
          onClick={() => decide(true)}
        >
          {t("approvals.approve")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
          {t("approvals.deny")}
        </Button>
      </div>
    </Card>
  );
}
