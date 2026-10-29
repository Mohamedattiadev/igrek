import type { RemoteRun, ServerInfo } from "@igrek/core";
import { Activity, Container, HardDrive, type LucideIcon, Network, ScrollText, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "../../components/ui";
import { api } from "../../lib/api";
import { runInBackground, useBackgroundTasks } from "../../lib/background";

/** Read-only commands people reach for first, grouped; each says in words what it shows. */
const GROUPS: { id: string; icon: LucideIcon; commands: { id: string; command: string }[] }[] = [
  {
    id: "system",
    icon: HardDrive,
    commands: [
      { id: "disk", command: "df -h -x tmpfs -x overlay -x squashfs" },
      { id: "memory", command: "free -h" },
      { id: "bigdirs", command: "du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15" },
      { id: "uptime", command: "uptime" },
    ],
  },
  {
    id: "processes",
    icon: Activity,
    commands: [
      { id: "cpu", command: "ps aux --sort=-%cpu | head -15" },
      { id: "ram", command: "ps aux --sort=-%mem | head -15" },
      { id: "failed", command: "systemctl list-units --state=failed --no-pager" },
      { id: "errors", command: "journalctl -p err -n 60 --no-pager" },
    ],
  },
  {
    id: "docker",
    icon: Container,
    commands: [
      { id: "containers", command: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'" },
      { id: "usage", command: "docker stats --no-stream" },
      { id: "space", command: "docker system df" },
    ],
  },
  {
    id: "network",
    icon: Network,
    commands: [
      { id: "ports", command: "ss -tlnp" },
      { id: "logins", command: "last -n 20" },
      {
        id: "failedLogins",
        command: "journalctl -u ssh -u sshd --since '24 hours ago' --no-pager | grep -i 'failed' | tail -30",
      },
    ],
  },
  {
    id: "updates",
    icon: ShieldCheck,
    commands: [
      { id: "upgradable", command: "apt list --upgradable 2>/dev/null | head -40" },
      { id: "firewall", command: "ufw status verbose" },
    ],
  },
];

/**
 * One click for what a careful admin looks at first. They only read (the server side classifies
 * them as such and would refuse anything else without a confirmation), and land in the history.
 */
export function QuickCommands({ server, onRan }: { server: ServerInfo; onRan: (run: RemoteRun) => void }) {
  const { t } = useTranslation();
  // In the background store: the click's command keeps running, and shows as such, if the page is left.
  const task = useBackgroundTasks().find((x) => x.key === `cmd:${server.id}`);
  const busy = task?.status === "running" ? task.label : undefined;
  const error = task?.status === "failed" ? task.error : undefined;
  const run = (id: string, command: string) =>
    void runInBackground(`cmd:${server.id}`, t(`quickCmd.${id}`), () => api.runOnServer(server.id, command, 0))
      .then(onRan)
      .catch(() => undefined);
  return (
    <Card className="space-y-3 p-pad">
      <div>
        <p className="text-[13.5px] font-medium">{t("quickCmd.title")}</p>
        <p className="text-[12.5px] text-fg-muted">{t("quickCmd.hint")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <section key={g.id} className="space-y-1">
            <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
              <g.icon size={12} aria-hidden="true" />
              {t(`quickCmd.group_${g.id}`)}
            </h3>
            {g.commands.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!!busy}
                onClick={() => run(c.id, c.command)}
                className="block w-full rounded-ui border border-border px-2.5 py-1.5 text-start hover:border-accent disabled:opacity-60"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
                  {busy === t(`quickCmd.${c.id}`) && (
                    <ScrollText size={12} className="animate-pulse text-accent" aria-hidden="true" />
                  )}
                  {t(`quickCmd.${c.id}`)}
                </span>
                <span className="block text-[11.5px] text-fg-subtle">{t(`quickCmd.${c.id}_hint`)}</span>
                <code className="mt-0.5 block truncate font-mono text-[10.5px] text-fg-subtle">{c.command}</code>
              </button>
            ))}
          </section>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </Card>
  );
}
