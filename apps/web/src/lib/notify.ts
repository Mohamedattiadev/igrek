import type { ChatInfo, FlowRun, TerminalInfo } from "@igrek/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { desktop, inDesktopApp } from "./desktop";
import { useAccounts, useApprovals, useChats, useServerEvent, useTerminals } from "./live";
import { useSettings } from "./settings";

/** Asks the browser for permission (from a click in Settings). The desktop app needs none. */
export async function askNotificationPermission(): Promise<boolean> {
  if (inDesktopApp) return true;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

/**
 * Desktop notifications (plan.md 11): a chat finished or waits for an approval, a terminal waits
 * for an answer, an approval is pending, a team run needs you, a project score dropped, a limit
 * is filling up. Only while the Igrek tab is in the background, and only when turned on. In the
 * desktop app they are the system's own notifications, shown while its window is not in front.
 */
export function useDesktopNotifications(): void {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const chats = useChats();
  const terminals = useTerminals();
  const approvals = useApprovals();
  const accounts = useAccounts();
  const seen = useRef({
    chats: new Map<string, ChatInfo["status"]>(),
    terms: new Map<string, TerminalInfo["status"]>(),
    approvals: -1,
    runs: new Map<string, FlowRun["status"]>(),
    scores: new Map<string, number>(),
    limits: new Set<string>(),
  });
  const enabled =
    settings.notifications && (inDesktopApp || ("Notification" in window && Notification.permission === "granted"));
  const show = (title: string, body: string, link?: string) => {
    if (!enabled) return;
    if (inDesktopApp) {
      if (!document.hasFocus()) void desktop("notify", { title, body }).catch(() => undefined);
      return;
    }
    if (!document.hidden) return;
    const n = new Notification(title, { body, tag: `${title}:${body}`.slice(0, 60) });
    n.onclick = () => {
      window.focus();
      if (link) window.location.assign(link);
      n.close();
    };
  };

  useEffect(() => {
    for (const c of chats) {
      const before = seen.current.chats.get(c.id);
      if (before === "working" && c.status === "idle") show(t("notify.chatDone"), c.title, `/c/${c.id}`);
      if (before && before !== "waiting" && c.status === "waiting")
        show(t("notify.chatWaiting"), c.title, `/c/${c.id}`);
      seen.current.chats.set(c.id, c.status);
    }
  });
  useEffect(() => {
    for (const term of terminals) {
      const before = seen.current.terms.get(term.id);
      if (before && before !== "attention" && term.status === "attention")
        show(t("notify.terminalWaiting"), term.title, `/t/${term.id}`);
      seen.current.terms.set(term.id, term.status);
    }
  });
  useEffect(() => {
    if (seen.current.approvals >= 0 && approvals.length > seen.current.approvals)
      show(t("notify.approval"), approvals[0]?.command ?? "", "/inbox");
    seen.current.approvals = approvals.length;
  });
  useEffect(() => {
    for (const a of accounts) {
      const used = a.rateLimit?.fiveHour ?? 0;
      if (used >= 0.8 && !seen.current.limits.has(a.id)) {
        seen.current.limits.add(a.id);
        show(t("notify.limit"), t("notify.limitBody", { account: a.label, pct: Math.round(used * 100) }), "/limits");
      }
      if (used < 0.5) seen.current.limits.delete(a.id);
    }
  });
  useServerEvent("flows-changed", (m) => {
    if (!m.runId) return;
    void api
      .flowRun(m.runId)
      .then((run) => {
        const before = seen.current.runs.get(run.id);
        if (before && before !== run.status && ["needs_you", "ready", "failed"].includes(run.status))
          show(t(`notify.run_${run.status}`), run.request.split("\n")[0] ?? "", `/runs/${run.id}`);
        seen.current.runs.set(run.id, run.status);
      })
      .catch(() => undefined);
  });
  useServerEvent("alert", (m) => show(t(`notify.alert_${m.kind}`), m.title, m.link));
  useServerEvent("insight-changed", (m) => {
    void api
      .insight(m.projectId)
      .then((scan) => {
        if (!("overall" in scan)) return;
        const before = seen.current.scores.get(m.projectId);
        if (before !== undefined && scan.overall <= before - 5)
          show(
            t("notify.scoreDrop"),
            t("notify.scoreBody", { from: before, to: scan.overall }),
            `/p/${m.projectId}?tab=sections`,
          );
        seen.current.scores.set(m.projectId, scan.overall);
      })
      .catch(() => undefined);
  });
}
