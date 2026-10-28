import { CHAT_REACTIONS, type ChatReaction } from "@igrek/core";
import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { REACTION_ICONS } from "../components/chat/reaction-icons";
import { cn } from "../lib/cn";
import type { MemberClient } from "./client";
import type { MemberProject } from "./model";

/**
 * Reactions in the browser, like in Igrek (plan.md 19.9): the pill on the message with who gave
 * which, a tap takes mine back, and the six to pick from. Viewers only look.
 */
export function MemberReactions({
  client,
  project,
  messageId,
  canReact,
}: {
  client: MemberClient;
  project: MemberProject;
  messageId: string;
  canReact: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const given = project.reactions.get(messageId) ?? new Map<string, Set<string>>();
  const me = client.state.phase === "ready" ? client.state.user.id : "";
  const groups = CHAT_REACTIONS.map((r) => {
    const who = [...given].filter(([, set]) => set.has(r)).map(([id]) => id);
    return { reaction: r, who, mine: who.includes(me) };
  }).filter((g) => g.who.length);
  const react = (r: ChatReaction) => {
    setOpen(false);
    if (canReact) void client.react(project.key, messageId, r).catch(() => undefined);
  };
  const name = (id: string) => client.nameOf(id);
  return (
    <div className="mt-0.5 flex items-center gap-1">
      {groups.length > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full border border-border bg-bg p-0.5 shadow-ui">
          {groups.map((g) => {
            const { icon: Icon, tone } = REACTION_ICONS[g.reaction];
            const label = `${t(`teamChat.reaction_${g.reaction}`)}: ${g.who.map(name).join(", ")}`;
            return (
              <button
                key={g.reaction}
                type="button"
                disabled={!canReact}
                onClick={() => react(g.reaction)}
                aria-pressed={g.mine}
                aria-label={label}
                title={label}
                className={cn(
                  "inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11.5px] tabular-nums hover:bg-bg-hover",
                  g.mine && "bg-accent-soft",
                )}
              >
                <Icon size={13} className={tone} aria-hidden="true" />
                {g.who.length > 1 && g.who.length}
              </button>
            );
          })}
        </span>
      )}
      {canReact && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t("teamChat.react")}
            title={t("teamChat.react")}
            className="rounded p-1 text-fg-subtle hover:bg-bg-active"
          >
            <SmilePlus size={14} aria-hidden="true" />
          </button>
          {open && (
            <span
              role="menu"
              className="absolute bottom-full start-0 z-20 mb-1 flex gap-0.5 rounded-full border border-border bg-bg p-1 shadow-ui"
            >
              {CHAT_REACTIONS.map((r) => {
                const { icon: Icon, tone } = REACTION_ICONS[r];
                return (
                  <button
                    key={r}
                    type="button"
                    role="menuitem"
                    onClick={() => react(r)}
                    aria-label={t(`teamChat.reaction_${r}`)}
                    title={t(`teamChat.reaction_${r}`)}
                    className="rounded-full p-1.5 hover:bg-bg-hover"
                  >
                    <Icon size={16} className={tone} aria-hidden="true" />
                  </button>
                );
              })}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
