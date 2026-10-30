import type { TeamTimelineItem } from "@igrek/core";
import { Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";
import { useCoalesced, useServerEvent } from "../lib/live";

/**
 * The team on the Projects page in a few lines (plan.md 18.3, 19.7): the latest messages from
 * teammates (who, what, when), and the three places to go. A teammate went straight to Messages and
 * never found the shared project; a whole card for that took too much room.
 */
export function TeamWelcome({ team }: { team: boolean }) {
  const { t } = useTranslation();
  const [latest, setLatest] = useState<TeamTimelineItem[]>([]);
  const load = useCallback(() => {
    if (!team) return;
    void api
      .teamTimeline(7)
      .then((items) => setLatest(items.filter((i) => i.kind === "message" && !i.mine).slice(0, 3)))
      .catch(() => undefined);
  }, [team]);
  useEffect(load, [load]);
  const soon = useCoalesced(load);
  useServerEvent("chat-changed", (m) => m.writing === undefined && !m.typing && soon());
  if (!team) return null;
  return (
    <section className="rounded-ui border border-border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Users size={14} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="text-[13px] font-medium">{t("teamWelcome.title")}</span>
      </div>
      {latest.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {latest.map((m) => (
            <li key={m.id}>
              <Link
                to={`/chat?c=${encodeURIComponent(m.channelId ?? "")}`}
                className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-bg-hover"
              >
                <span className="shrink-0 font-semibold">{m.who}</span>
                <span className="min-w-0 flex-1 truncate text-fg-muted">{m.title}</span>
                <span className="shrink-0 text-[11.5px] text-fg-subtle">
                  {m.project} · {relativeTime(m.at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
