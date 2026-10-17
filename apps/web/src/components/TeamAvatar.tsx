import type { Presence, TeamMember, TeamStatus } from "@godeye/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

export type PersonState = "working" | "idle" | "offline";

/** Team members, what they're doing, and their state: working (green), idle (yellow), offline (grey). */
export function useTeamPeople(): {
  status?: TeamStatus;
  presence: Presence[];
  stateOf: (m: TeamMember) => PersonState;
} {
  const [status, setStatus] = useState<TeamStatus>();
  const [presence, setPresence] = useState<Presence[]>([]);
  const load = () => {
    api
      .team()
      .then(setStatus)
      .catch(() => undefined);
    api
      .teamPresence()
      .then(setPresence)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("team-changed", load);
  useServerEvent("presence", load);
  return {
    status,
    presence,
    stateOf: (m) => (presence.some((p) => p.userId === m.id) ? "working" : m.online ? "idle" : "offline"),
  };
}

function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const DOT: Record<PersonState, string> = { working: "bg-success", idle: "bg-warning", offline: "bg-fg-subtle" };

export function TeamAvatar({
  member,
  state,
  size = 24,
  doing,
}: {
  member: TeamMember;
  state?: PersonState;
  size?: number;
  doing?: string;
}) {
  const { t } = useTranslation();
  const initials = member.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const image = member.avatar?.startsWith("data:image/") ? member.avatar : undefined;
  const color = member.avatar?.startsWith("#") ? member.avatar : `hsl(${hue(member.username)} 55% 45%)`;
  const tip =
    state === "working"
      ? t("people.working", { name: member.displayName, doing: doing ?? "" })
      : state === "idle"
        ? t("people.idle", { name: member.displayName })
        : member.lastSeen
          ? t("people.offlineSince", { name: member.displayName, when: relativeTime(member.lastSeen) })
          : t("people.offline", { name: member.displayName });
  return (
    <span className="relative inline-flex shrink-0" data-tip={tip} role="img" aria-label={tip}>
      {image ? (
        <img src={image} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
      ) : (
        <span
          className="inline-flex items-center justify-center rounded-full font-semibold text-white"
          style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }}
        >
          {initials}
        </span>
      )}
      {state && (
        <span
          className={cn("absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-bg", DOT[state])}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
