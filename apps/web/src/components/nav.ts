import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  FolderKanban,
  FolderOpen,
  Gauge,
  Inbox,
  Lightbulb,
  Palette,
  Server,
  Settings,
  SquareTerminal,
  Users,
  UsersRound,
} from "lucide-react";

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
  { to: "/files", label: "nav.files", icon: FolderOpen },
  { to: "/servers", label: "nav.servers", icon: Server },
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  { to: "/ideas", label: "nav.ideas", icon: Lightbulb },
  { to: "/prompts", label: "nav.prompts", icon: BookMarked },
  { to: "/limits", label: "nav.limits", icon: Gauge },
  { to: "/personas", label: "nav.personas", icon: UsersRound },
  { to: "/team", label: "nav.team", icon: Users },
  { to: "/design", label: "nav.design", icon: Palette, bottom: true, proOnly: true },
  { to: "/settings", label: "nav.settings", icon: Settings, bottom: true },
];
