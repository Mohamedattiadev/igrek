import type { LucideIcon } from "lucide-react";
import { FolderKanban, Gauge, Inbox, Palette, Settings, SquareTerminal, Users } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown at the bottom of the tool strip, like JetBrains' secondary tool windows. */
  bottom?: boolean;
  proOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "nav.projects", icon: FolderKanban },
  { to: "/terminals", label: "nav.terminals", icon: SquareTerminal },
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  { to: "/limits", label: "nav.limits", icon: Gauge },
  { to: "/team", label: "nav.team", icon: Users },
  { to: "/design", label: "nav.design", icon: Palette, bottom: true, proOnly: true },
  { to: "/settings", label: "nav.settings", icon: Settings, bottom: true },
];
