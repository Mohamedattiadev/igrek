import type { ServerInfo } from "@igrek/core";
import type { TFunction } from "i18next";
import { KeyRound, LogIn, ShieldAlert, ShieldX, TerminalSquare, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, EmptyState } from "../../components/ui";
import { type ServerAccess as Access, api } from "../../lib/api";
import { useBackground } from "../../lib/background";
import { dateTime, relativeTime } from "../../lib/format";
import { duration } from "../tools/Time";

/** When a session ended, as how long it lasted; a command run over SSH is often over in seconds. */
function leftAfter(ms: number, t: TFunction): string {
  return ms < 60_000 ? t("serverAccess.leftSoon") : t("serverAccess.stayed", { time: duration(ms / 60_000, t) });
}

/** The week in four numbers and the things worth a look, in sentences. */
function WeekSummary({ report }: { report: Access }) {
  const { t } = useTranslation();
  const people = new Set(report.logins.map((l) => l.who || l.key || `${l.user}@${l.ip}`));
  const addresses = new Set(report.logins.map((l) => l.ip));
  const unknownKey = report.logins.filter((l) => l.key && l.who === undefined);
  const password = report.logins.filter((l) => l.method === "password");
  const stats = [
    { label: t("serverAccess.logins"), value: report.logins.length },
    { label: t("serverAccess.people"), value: people.size },
    { label: t("serverAccess.addresses"), value: addresses.size },
    { label: t("serverAccess.failed"), value: report.failed.total },
  ];
  return (
    <Card className="space-y-3 p-pad">
      <h3 className="text-[13.5px] font-semibold">{t("serverAccess.weekTitle")}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-ui bg-bg-subtle px-3 py-2">
            <p className="text-[20px] font-semibold">{s.value}</p>
            <p className="text-[11.5px] text-fg-muted">{s.label}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-[12.5px]">
        {unknownKey.length > 0 && (
          <li className="flex items-start gap-2 text-danger">
            <ShieldX size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t("serverAccess.unknownKey", { count: unknownKey.length })}
          </li>
        )}
        {password.length > 0 && (
          <li className="flex items-start gap-2 text-warning">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t("serverAccess.passwordLogins", { count: password.length })}
          </li>
        )}
        {report.failed.top[0] && (
          <li className="flex items-start gap-2 text-fg-muted">
            <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t("serverAccess.topTrier", { ip: report.failed.top[0].ip, count: report.failed.top[0].count })}
          </li>
        )}
        {!unknownKey.length && !password.length && <li className="text-fg-muted">{t("serverAccess.allKnown")}</li>}
      </ul>
    </Card>
  );
}

/**
 * Who uses this server (plan.md 18.8): the last seven days of sign-ins with whose key it was, who
 * is on now, sudo commands and who keeps trying. Read-only; a key nobody recognises stands out.
 */
export function ServerAccess({ server }: { server: ServerInfo }) {
  const { t } = useTranslation();
  // Kept outside the page (lib/background.ts): leaving and coming back shows it still running, then its result.
  const task = useBackground<Access>(`ServerAccess.serverAccess:${server.id}`);
  const report = task.result;
  const busy = task.running;
  const error = task.error;
  const load = () => void task.run(() => api.serverAccess(server.id));
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-pad">
        <div className="max-w-2xl">
          <p className="text-[13.5px] font-medium">{t("serverAccess.title")}</p>
          <p className="text-[12.5px] text-fg-muted">{t("serverAccess.hint")}</p>
          {report && (
            <p className="mt-1 text-[11.5px] text-fg-subtle">
              {t("serverAudit.scanned", { when: relativeTime(report.at) })}
            </p>
          )}
        </div>
        <Button variant="primary" icon={Users} disabled={busy} onClick={load}>
          {busy ? t("serverAudit.scanning") : report ? t("serverAudit.again") : t("serverAccess.read")}
        </Button>
      </Card>
      {error && <p className="text-xs text-danger">{error}</p>}
      {report && !report.readable && (
        <EmptyState
          icon={ShieldAlert}
          title={t("serverAccess.unreadableTitle")}
          body={t("serverAccess.unreadableBody")}
        />
      )}
      {report?.readable && (
        <>
          <WeekSummary report={report} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="flex items-center gap-2 border-b border-border px-pad py-2 text-[13px] font-semibold">
                <TerminalSquare size={14} className="text-accent" aria-hidden="true" /> {t("serverAccess.nowTitle")}
              </h3>
              <ul className="divide-y divide-border text-[12.5px]">
                {report.now.map((n) => (
                  <li key={`${n.user}-${n.tty}`} className="flex gap-3 px-pad py-2">
                    <span className="font-medium">{n.user}</span>
                    <span className="text-fg-muted">{n.from || n.tty}</span>
                    <span className="ms-auto text-fg-subtle">{n.since}</span>
                  </li>
                ))}
                {!report.now.length && <li className="px-pad py-3 text-fg-subtle">{t("serverAccess.nobodyNow")}</li>}
              </ul>
            </Card>
            <Card>
              <h3 className="flex items-center gap-2 border-b border-border px-pad py-2 text-[13px] font-semibold">
                <KeyRound size={14} className="text-accent" aria-hidden="true" /> {t("serverAccess.keysTitle")}
              </h3>
              <ul className="divide-y divide-border text-[12.5px]">
                {report.keys.map((k) => (
                  <li key={`${k.account}-${k.fingerprint}`} className="flex gap-3 px-pad py-2">
                    <span className="font-medium">{k.label || t("serverAccess.noLabel")}</span>
                    <span className="text-fg-muted">{k.account}</span>
                    <span className="ms-auto truncate font-mono text-[11px] text-fg-subtle">{k.fingerprint}</span>
                  </li>
                ))}
                {!report.keys.length && <li className="px-pad py-3 text-fg-subtle">{t("serverAccess.noKeys")}</li>}
              </ul>
            </Card>
          </div>
          <Card>
            <h3 className="flex items-center gap-2 border-b border-border px-pad py-2 text-[13px] font-semibold">
              <LogIn size={14} className="text-accent" aria-hidden="true" /> {t("serverAccess.loginsTitle")}
            </h3>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-border">
                  {report.logins.map((l) => (
                    <tr key={`${l.at}-${l.ip}-${l.user}`}>
                      <td className="px-pad py-1.5 text-fg-subtle" title={dateTime(l.at)}>
                        {relativeTime(l.at)}
                      </td>
                      <td className="py-1.5 font-medium">{l.user}</td>
                      <td className="py-1.5">
                        {l.who !== undefined ? (
                          l.who || t("serverAccess.noLabel")
                        ) : l.key ? (
                          <Badge tone="danger">{t("serverAccess.unknownKeyBadge")}</Badge>
                        ) : (
                          <Badge tone={l.method === "password" ? "warning" : "neutral"}>{l.method}</Badge>
                        )}
                      </td>
                      <td className="py-1.5 text-fg-muted" title={l.left ? dateTime(l.left) : undefined}>
                        {l.left ? leftAfter(l.left - l.at, t) : t("serverAccess.noSignOut")}
                      </td>
                      <td className="px-pad py-1.5 text-end font-mono text-[11.5px] text-fg-muted">{l.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!report.logins.length && (
                <p className="px-pad py-3 text-[12.5px] text-fg-subtle">{t("serverAccess.noLogins")}</p>
              )}
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">
                {t("serverAccess.triersTitle")}
              </h3>
              <ul className="divide-y divide-border text-[12.5px]">
                {report.failed.top.map((f) => (
                  <li key={f.ip} className="flex gap-3 px-pad py-1.5">
                    <span className="font-mono">{f.ip}</span>
                    <span className="ms-auto text-fg-muted">{t("serverAccess.tries", { count: f.count })}</span>
                  </li>
                ))}
                {!report.failed.top.length && (
                  <li className="px-pad py-3 text-fg-subtle">{t("serverAccess.noTriers")}</li>
                )}
              </ul>
            </Card>
            <Card>
              <h3 className="border-b border-border px-pad py-2 text-[13px] font-semibold">
                {t("serverAccess.sudoTitle")}
              </h3>
              <ul className="max-h-72 divide-y divide-border overflow-auto text-[12.5px]">
                {report.sudo.map((s) => (
                  <li key={`${s.at}-${s.command}`} className="flex gap-3 px-pad py-1.5">
                    <span className="shrink-0 font-medium">{s.user}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={s.command}>
                      {s.command}
                    </span>
                    <span className="shrink-0 text-fg-subtle">{relativeTime(s.at)}</span>
                  </li>
                ))}
                {!report.sudo.length && <li className="px-pad py-3 text-fg-subtle">{t("serverAccess.noSudo")}</li>}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
