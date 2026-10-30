import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  Bot,
  Building2,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  FolderOpen,
  Gauge,
  GraduationCap,
  House,
  Inbox,
  Library,
  Lightbulb,
  MessagesSquare,
  Network,
  Newspaper,
  Palette,
  Server,
  Settings,
  SquareCheckBig,
  SquareTerminal,
  UserRound,
  Users,
  UsersRound,
  Wrench,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown at the bottom of the strip (profile, settings); the rest are pages of the places below. */
  bottom?: boolean;
  proOnly?: boolean;
  offStrip?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "nav.projects", icon: FolderKanban },
  { to: "/chief", label: "nav.chief", icon: Bot },
  { to: "/terminals", label: "nav.terminals", icon: SquareTerminal },
  { to: "/inbox", label: "nav.inbox", icon: Inbox },
  // AI experts are tools like the chief, not people of the company: they sit with them.
  { to: "/personas", label: "nav.personas", icon: UsersRound },
  { to: "/chat", label: "nav.chat", icon: MessagesSquare },
  { to: "/mine", label: "nav.mine", icon: SquareCheckBig },
  { to: "/meetings", label: "nav.meetings", icon: CalendarDays },
  { to: "/team", label: "nav.team", icon: Users },
  { to: "/org", label: "nav.org", icon: Network },
  { to: "/company", label: "nav.company", icon: Building2 },
  { to: "/files", label: "nav.files", icon: FolderOpen },
  { to: "/servers", label: "nav.servers", icon: Server },
  // Scheduled work and prompts are tabs of Tools now (their own pages stay, for links and the palette).
  { to: "/schedules", label: "nav.schedules", icon: CalendarClock, offStrip: true },
  { to: "/tools", label: "nav.tools", icon: Wrench },
  { to: "/limits", label: "nav.limits", icon: Gauge },
  { to: "/prompts", label: "nav.prompts", icon: BookMarked, offStrip: true },
  { to: "/library", label: "nav.library", icon: Library },
  // The experts' reading: a user found it only by chance, under the library.
  { to: "/knowledge", label: "nav.knowledge", icon: Newspaper },
  { to: "/learn", label: "nav.learn", icon: GraduationCap },
  { to: "/ideas", label: "nav.ideas", icon: Lightbulb },
  // A page for building Igrek's own look: reached from Settings and the command palette, not the strip.
  { to: "/design", label: "nav.design", icon: Palette, bottom: true, proOnly: true, offStrip: true },
  { to: "/me", label: "nav.profile", icon: UserRound, bottom: true },
  { to: "/settings", label: "nav.settings", icon: Settings, bottom: true },
];

/**
 * The strip shows five places (a user found eleven pages and seven more under "More" like a cockpit):
 * each holds pages that open as tabs across its top. Every page keeps its own address.
 */
export interface NavSection {
  id: "home" | "projects" | "chat" | "team" | "tools";
  label: string;
  icon: LucideIcon;
  /** Its tabs, in order; the first is where the strip's link goes. */
  pages: string[];
  /** Deeper addresses that belong here too (a project, a chat), without tabs of their own. */
  also?: string[];
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "home", label: "nav.home", icon: House, pages: ["/inbox", "/mine", "/knowledge"] },
  {
    id: "projects",
    label: "nav.projects",
    icon: FolderKanban,
    pages: ["/", "/terminals", "/files"],
    also: ["/p/", "/c/", "/t/", "/s/"],
  },
  { id: "chat", label: "nav.chat", icon: MessagesSquare, pages: ["/chat"] },
  { id: "team", label: "nav.team", icon: Users, pages: ["/team", "/meetings", "/company", "/org"], also: ["/team/"] },
  {
    id: "tools",
    label: "nav.tools",
    icon: Wrench,
    pages: ["/tools", "/personas", "/chief", "/servers", "/limits", "/library", "/learn", "/ideas"],
    also: [
      "/personas/",
      "/servers/",
      "/learn/",
      "/schedules",
      "/prompts",
      "/lessons",
      "/runs/",
      "/test-runs/",
      "/meeting",
    ],
  },
];

/** The place an address belongs to, if any: its own pages first, then the deeper addresses. */
export function sectionOf(path: string): NavSection | undefined {
  return (
    NAV_SECTIONS.find((s) => s.pages.includes(path)) ??
    NAV_SECTIONS.find((s) => s.also?.some((prefix) => path.startsWith(prefix)))
  );
}
