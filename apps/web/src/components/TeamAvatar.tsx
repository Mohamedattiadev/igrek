import type { Presence, TeamMember, TeamStatus } from "@godeye/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { relativeTime } from "../lib/format";
import { useServerEvent } from "../lib/live";

export type PersonState = "working" | "idle" | "offline";

/** Team members, what they're doing, and their state: working (green), idle (yellow), offline (grey). */
/** Black or white initials, whichever reads better on the member's colour (WCAG contrast). */
function readableOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = Number.parseInt(m[1] as string, 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

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
          className="inline-flex items-center justify-center rounded-full font-semibold"
          style={{
            width: size,
            height: size,
            background: color,
            color: readableOn(color),
            fontSize: Math.round(size * 0.4),
          }}
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
