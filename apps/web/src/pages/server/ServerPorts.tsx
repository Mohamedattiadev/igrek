import type { ServerInfo } from "@igrek/core";
import { DoorClosed, DoorOpen, Network } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card } from "../../components/ui";
import { api, type ServerPort } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { ConfirmRun } from "./ConfirmRun";

type Change = { action: "open" | "close" | "forget"; port: number; proto: string };

/**
 * A server's open doors (plan.md 18.8): every port something listens on, who listens, whether the
 * world can reach it, and one click to open or close it in the firewall. Every change shows its
 * exact ufw command and asks first; the SSH port cannot be closed from here.
 */
export function ServerPorts({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ ports: ServerPort[]; firewall: string; at: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [change, setChange] = useState<Change>();
  const load = () => {
    setBusy(true);
    setError(undefined);
    void api
      .serverPorts(server.id)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  const ssh = server.port ?? 22;
  const command = change ? { open: "ufw allow", close: "ufw deny", forget: "ufw delete allow" }[change.action] : "";
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-pad">
        <div className="max-w-2xl">
          <p className="text-[13.5px] font-medium">{t("serverPorts.title")}</p>
          <p className="text-[12.5px] text-fg-muted">{t("serverPorts.hint")}</p>
          {data && (
            <p className="mt-1 text-[11.5px] text-fg-subtle">
              {t(`serverPorts.firewall_${data.firewall}`)} · {t("serverAudit.scanned", { when: relativeTime(data.at) })}
            </p>
          )}
        </div>
        <Button variant="primary" icon={Network} disabled={busy} onClick={load}>
          {busy ? t("serverAudit.scanning") : data ? t("serverAudit.again") : t("serverPorts.read")}
        </Button>
      </Card>
      {error && <p className="text-xs text-danger">{error}</p>}
      {data?.firewall === "inactive" && (
        <p className="rounded-ui border border-warning bg-warning-soft px-3 py-2 text-[12.5px]">
          {t("serverPorts.noFirewall")}
        </p>
      )}
      {data && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-subtle">
                <th className="px-pad py-2 text-start font-semibold">{t("serverPorts.port")}</th>
                <th className="py-2 text-start font-semibold">{t("serverPorts.program")}</th>
                <th className="py-2 text-start font-semibold">{t("serverPorts.reach")}</th>
                <th className="px-pad py-2 text-end font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.ports.map((p) => {
                const reachable = p.public && p.firewall !== "closed";
                return (
                  <tr key={`${p.proto}-${p.port}-${p.address}`}>
                    <td className="px-pad py-2 font-mono">
                      {p.port}/{p.proto}
                    </td>
                    <td className="py-2">
                      {p.program || "—"}
                      {p.container && (
                        <span className="text-fg-subtle"> · {t("serverPorts.container", { name: p.container })}</span>
                      )}
                    </td>
                    <td className="py-2">
                      {!p.public ? (
                        <Badge>{t("serverPorts.onlyHere")}</Badge>
                      ) : reachable ? (
                        <Badge tone={[22, 80, 443, ssh].includes(p.port) ? "accent" : "warning"}>
                          {t("serverPorts.world")}
                        </Badge>
                      ) : (
                        <Badge tone="success">{t("serverPorts.blocked")}</Badge>
                      )}
                    </td>
                    <td className="px-pad py-2 text-end">
                      {p.public && data.firewall === "active" && p.port !== ssh && !p.container && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={reachable ? DoorClosed : DoorOpen}
                          onClick={() =>
                            setChange({ action: reachable ? "close" : "open", port: p.port, proto: p.proto })
                          }
                        >
                          {reachable ? t("serverPorts.close") : t("serverPorts.open")}
                        </Button>
                      )}
                      {p.container && p.public && (
                        <span className="text-[11.5px] text-fg-subtle">{t("serverPorts.dockerNote")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <ConfirmRun
        open={!!change}
        title={change ? t(`serverPorts.confirm_${change.action}`, { port: change.port }) : ""}
        command={change ? `${command} ${change.port}/${change.proto}` : ""}
        production={server.tag === "prod"}
        onClose={() => {
          setChange(undefined);
          if (data) load();
        }}
        run={(confirmations) => api.changeFirewall(server.id, change as Change, confirmations)}
      />
    </div>
  );
}
