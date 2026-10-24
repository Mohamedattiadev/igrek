import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Bot,
  CalendarClock,
  FolderKanban,
  FolderOpen,
  Gauge,
  GraduationCap,
  Inbox,
  Library,
  Lightbulb,
  Palette,
  Server,
  Settings,
  SquareTerminal,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown at the bottom of the tool strip, like JetBrains' secondary tool windows. */
  bottom?: boolean;
  /** Used less often: folded under "More" so the strip stays short (opens by itself when one is open). */
  more?: boolean;
  proOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "nav.projects", icon: FolderKanban },
  { to: "/chief", label: "nav.chief", icon: Bot },
  { to: "/terminals", label: "nav.terminals", icon: SquareTerminal },
  { to: "/files", label: "nav.files", icon: FolderOpen },
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  { to: "/personas", label: "nav.personas", icon: UsersRound },
  { to: "/servers", label: "nav.servers", icon: Server },
  { to: "/tools", label: "nav.tools", icon: Wrench, more: true, proOnly: true },
  { to: "/schedules", label: "nav.schedules", icon: CalendarClock, more: true },
  { to: "/ideas", label: "nav.ideas", icon: Lightbulb, more: true },
  { to: "/prompts", label: "nav.prompts", icon: BookMarked, more: true },
  { to: "/limits", label: "nav.limits", icon: Gauge, more: true },
  { to: "/library", label: "nav.library", icon: Library, more: true },
  { to: "/learn", label: "nav.learn", icon: GraduationCap, more: true },
  { to: "/team", label: "nav.team", icon: Users, more: true },
  { to: "/design", label: "nav.design", icon: Palette, bottom: true, proOnly: true },
  { to: "/settings", label: "nav.settings", icon: Settings, bottom: true },
];
