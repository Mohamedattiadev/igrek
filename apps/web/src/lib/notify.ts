import type { ChatInfo, FlowRun, TerminalInfo } from "@igrek/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { desktop, inDesktopApp } from "./desktop";
import { useAccounts, useApprovals, useChats, useCoalesced, useServerEvent, useTerminals } from "./live";
import { useSettings } from "./settings";

/** Asks the browser for permission (from a click in Settings). The desktop app needs none. */
export async function askNotificationPermission(): Promise<boolean> {
  if (inDesktopApp) return true;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

/** A soft two-note chime for a new team message, made here: no sound file, nothing fetched. */
function chime(): void {
  try {
    const ctx = new AudioContext();
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.12;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // No audio here (a test browser, a locked-down system): the badge still shows.
  }
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
    channels: new Map<string, number>(),
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
  // A teammate wrote in a channel that is not muted: a chime, and a notice while Igrek is away.
  // The counts at start are what was already there, not news.
  const counted = useRef(false);
  const countChannels = (announce: boolean) =>
    void Promise.all([api.chatChannels(), api.directChats().catch(() => [])])
      .then(([channels, directs]) => {
        counted.current = true;
        // A direct conversation is never muted: it counts like a channel of its own.
        const list = [
          ...channels,
          ...directs.map((d) => ({
            id: `dm:${d.peer}`,
            name: d.name,
            project: "",
            muted: false,
            unread: d.unread,
            unreadFrom: [d.name],
          })),
        ];
        for (const c of list) {
          const before = seen.current.channels.get(c.id) ?? 0;
          seen.current.channels.set(c.id, c.unread);
          if (!announce || c.muted || c.unread <= before) continue;
          chime();
          show(
            t("notify.teamMessage", { name: c.unreadFrom.at(-1) ?? "" }),
            c.project ? `# ${c.name} · ${c.project}` : t("teamChat.direct"),
            `/chat?c=${encodeURIComponent(c.id)}`,
          );
        }
      })
      .catch(() => undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: counted once, at start
  useEffect(() => countChannels(false), []);
  const countSoon = useCoalesced(() => countChannels(counted.current));
  useServerEvent("chat-changed", (m) => {
    if (m.writing === undefined && !m.typing) countSoon();
  });
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
