import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Bot,
  Building2,
  CalendarClock,
  FolderKanban,
  FolderOpen,
  Gauge,
  GraduationCap,
  Inbox,
  Library,
  Lightbulb,
  MessagesSquare,
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
  /**
   * Where it sits: the first items have no heading; "team" is always shown under its heading;
   * "work" and "know" are folded under "More" so the strip stays short (opens by itself when one is open).
   */
  group?: "team" | "work" | "know";
  proOnly?: boolean;
  offStrip?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "nav.projects", icon: FolderKanban },
  { to: "/chief", label: "nav.chief", icon: Bot },
  { to: "/terminals", label: "nav.terminals", icon: SquareTerminal },
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  { to: "/chat", label: "nav.chat", icon: MessagesSquare, group: "team" },
  { to: "/team", label: "nav.team", icon: Users, group: "team" },
  { to: "/personas", label: "nav.personas", icon: UsersRound, group: "team" },
  { to: "/company", label: "nav.company", icon: Building2, group: "team" },
  { to: "/files", label: "nav.files", icon: FolderOpen, group: "work" },
  { to: "/servers", label: "nav.servers", icon: Server, group: "work" },
  { to: "/schedules", label: "nav.schedules", icon: CalendarClock, group: "work" },
  { to: "/tools", label: "nav.tools", icon: Wrench, group: "work", proOnly: true },
  { to: "/limits", label: "nav.limits", icon: Gauge, group: "work" },
  { to: "/prompts", label: "nav.prompts", icon: BookMarked, group: "know" },
  { to: "/library", label: "nav.library", icon: Library, group: "know" },
  { to: "/learn", label: "nav.learn", icon: GraduationCap, group: "know" },
  { to: "/ideas", label: "nav.ideas", icon: Lightbulb, group: "know" },
  // A page for building Igrek's own look: reached from Settings and the command palette, not the strip.
  { to: "/design", label: "nav.design", icon: Palette, bottom: true, proOnly: true, offStrip: true },
  { to: "/settings", label: "nav.settings", icon: Settings, bottom: true },
];
