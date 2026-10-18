import type { TeamStatus } from "@igrek/core";
import { CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

/** Team sync state in the top bar (plan.md 4.1): up to date, syncing, or offline with what's waiting. */
export function SyncChip() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TeamStatus>();
  const load = () => {
    api
      .team()
      .then(setStatus)
      .catch(() => undefined);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: poll once per mount
  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, []);
  useServerEvent("team-changed", load);
  if (!status?.configured) return null;
  const offline = !status.connected;
  const Icon = offline ? CloudOff : status.pending || status.integrity?.missing ? RefreshCw : CloudCheck;
  const missing = status.integrity?.missing ?? 0;
  const label = offline
    ? t("sync.offline", { count: status.pending })
    : status.pending
      ? t("sync.syncing", { count: status.pending })
      : missing
        ? t("sync.repairing", { count: missing })
        : t("sync.upToDate");
  const tip = [
    status.lastSyncAt ? t("sync.lastTip", { when: relativeTime(status.lastSyncAt) }) : label,
    missing ? t("sync.repairTip", { count: missing }) : "",
    status.integrity?.broken ? t("sync.brokenTip", { count: status.integrity.broken }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      to="/team"
      data-tip={tip}
      className={
        offline
          ? "flex items-center gap-1 text-[12px] text-warning"
          : "flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg"
      }
    >
      <Icon
        size={14}
        className={!offline && (status.pending || missing) ? "animate-spin" : undefined}
        aria-hidden="true"
      />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
