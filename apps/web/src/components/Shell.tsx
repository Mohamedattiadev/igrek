import type { ServerMessage } from "@igrek/core";
import { APP_VERSION } from "@igrek/core";
import {
  ChevronDown,
  Download,
  Menu,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Search,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useDesktopTray, useDesktopUpdateCheck } from "../lib/desktop";
import {
  dispatchServerMessage,
  useApprovals,
  useChats,
  useCoalesced,
  useIndexStatus,
  useLiveData,
  useServerEvent,
  useTerminals,
} from "../lib/live";
import { NAV_COLORS, useNavColors } from "../lib/nav-colors";
import { useDesktopNotifications } from "../lib/notify";
import { runPageShortcut } from "../lib/page-actions";
import { useSettings } from "../lib/settings";
import { isSnoozed } from "../lib/snooze";
import { type SocketStatus, useServerSocket } from "../lib/socket";
import { useVimNavigation } from "../lib/vim";
import { readZen, saveZen } from "../lib/zen";
import { AccountChip } from "./AccountChip";
import { CodingQuestion } from "./CodingQuestion";
import { ExtensionPairPrompt } from "./ExtensionPairPrompt";
import { Helper } from "./Helper";
import { IdeaCapture } from "./IdeaCapture";
import { LanguagePackBanner, useLanguagePackSync } from "./LanguagePack";
import { Logo } from "./Logo";
import { NavColorMenu } from "./NavColors";
import { NAV_ITEMS, type NavItem } from "./nav";
import { QuickAskGate } from "./QuickAskGate";
import { ScreenNote } from "./ScreenNote";
import { StopButton } from "./StopButton";
import { SyncChip } from "./SyncChip";
import { TooltipLayer } from "./Tooltip";
import { UndoToast } from "./UndoToast";
import { Count, Kbd, StatusDot } from "./ui";
import { WhatIs } from "./WhatIs";
import { WorkspacePicker } from "./WorkspacePicker";

// Loaded when first needed, so the first screen does not carry them (scripts/bundle-budget.json).
const CommandPalette = lazy(() => import("./CommandPalette").then((m) => ({ default: m.CommandPalette })));
const Tour = lazy(() => import("./Tour").then((m) => ({ default: m.Tour })));

const WIDE = "igrek.nav.wide";
const MORE = "igrek.nav.more";
const PINNED = "igrek.nav.pinned";

/**
 * Pages under "More" the user pinned (plan.md, 26 Oct 2026): they stay on the strip while "More" is
 * folded. Kept in this browser only, like the strip's width.
 */
function usePinned(): [Set<string>, (to: string) => void] {
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(PINNED) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (to: string) =>
    setPinned((now) => {
      const next = new Set(now);
      if (!next.delete(to)) next.add(to);
      try {
        localStorage.setItem(PINNED, JSON.stringify([...next]));
      } catch {
        // Only a convenience.
      }
      return next;
    });
  return [pinned, toggle];
}

function readMore(): boolean {
  try {
    return localStorage.getItem(MORE) === "1";
  } catch {
    return false;
  }
}

function readWide(): boolean {
  try {
    return localStorage.getItem(WIDE) !== "0";
  } catch {
    return true;
  }
}

/** Phones and narrow windows: the menu becomes a drawer opened from the top bar. */
function useNarrow(): boolean {
  const query = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** A page under "More" with a pin beside it on the wide strip: pinned, it stays when "More" is folded. */
function PinnableLink({
  item,
  badge,
  wide,
  onPick,
  pinned,
  onPin,
}: {
  item: NavItem;
  badge?: number;
  wide: boolean;
  onPick?: () => void;
  pinned: boolean;
  onPin: () => void;
}) {
  const { t } = useTranslation();
  const label = pinned ? t("nav.unpin", { page: t(item.label) }) : t("nav.pin", { page: t(item.label) });
  return (
    <div className={cn("group/pin relative", wide && "w-full")}>
      <ToolStripLink item={item} badge={badge} wide={wide} onPick={onPick} />
      {wide && (
        <button
          type="button"
          onClick={onPin}
          aria-label={label}
          aria-pressed={pinned}
          data-tip={label}
          className={cn(
            "absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:bg-bg-active hover:text-fg",
            pinned ? "text-accent" : "opacity-0 focus:opacity-100 group-hover/pin:opacity-100",
          )}
        >
          {pinned ? <PinOff size={13} aria-hidden="true" /> : <Pin size={13} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

function ToolStripLink({
  item,
  badge,
  badgeTip,
  badgeTone = "warning",
  wide,
  onPick,
}: {
  item: NavItem;
  badge?: number;
  /** What the count is made of, e.g. "Kerim, Ati". */
  badgeTip?: string;
  /** The count's colour by what is waiting: red needs an answer, blue is from people, amber the rest. */
  badgeTone?: "danger" | "accent" | "warning";
  wide: boolean;
  onPick?: () => void;
}) {
  const { t } = useTranslation();
  const [colors] = useNavColors();
  const color = colors[item.to];
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onPick}
      data-tip={wide ? undefined : t(item.label)}
      data-tip-side="right"
      data-nav-color={item.to}
      aria-label={t(item.label)}
      className={({ isActive }) =>
        cn(
          // 32 px rows: the whole strip, "More" open, fits a laptop screen without scrolling.
          "relative flex h-8 shrink-0 items-center rounded-ui transition-colors",
          // Under "More" too: one a row, the same size as the rest (two a row looked cramped).
          wide ? "w-full gap-2.5 px-2.5 text-[13px]" : "w-9 justify-center",
          isActive ? "bg-bg-active font-medium text-accent-hover" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
        )
      }
    >
      <item.icon
        size={18}
        strokeWidth={1.75}
        className="shrink-0"
        style={{ color: color ? NAV_COLORS[color] : undefined }}
      />
      {wide && (
        <span className="min-w-0 flex-1 truncate" style={{ color: color ? NAV_COLORS[color] : undefined }}>
          {t(item.label)}
        </span>
      )}
      {!!badge && (
        <Count
          n={badge}
          tip={badgeTip}
          tone={badgeTone === "danger" ? "danger" : badgeTone === "accent" ? "accent" : "warning"}
          className={cn(!wide && "absolute -end-0.5 -top-0.5")}
        />
      )}
    </NavLink>
  );
}

/**
 * Unread team chat and direct messages and who wrote them, for the strip's badge; they clear when
 * their channel or conversation is opened.
 */
function useChatUnread(): { count: number; from: string[] } {
  const [unread, setUnread] = useState<{ count: number; from: string[] }>({ count: 0, from: [] });
  const load = useCallback(
    () =>
      void Promise.all([api.chatChannels(), api.directChats().catch(() => [])])
        .then(([list, directs]) => {
          const fresh = directs.filter((d) => d.unread > 0);
          setUnread({
            count: list.reduce((n, c) => n + c.unread, 0) + fresh.reduce((n, d) => n + d.unread, 0),
            from: [...new Set([...list.flatMap((c) => c.unreadFrom), ...fresh.map((d) => d.name).filter(Boolean)])],
          });
        })
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  const soon = useCoalesced(load);
  useServerEvent("chat-changed", (m) => m.writing === undefined && !m.typing && soon());
  return unread;
}

/** Messages from teammates and @mentions of me waiting in the inbox, for its badge. */
function useInboxPeople(): { messages: number; mentions: number } {
  const { data: messages, reload: reloadMessages } = useLiveData(() => api.teamMessages(), []);
  const { data: notices, reload: reloadNotices } = useLiveData(() => api.inboxNotices(), []);
  const noticesSoon = useCoalesced(reloadNotices);
  useServerEvent("chat-changed", (m) => m.writing === undefined && !m.typing && noticesSoon());
  useServerEvent("team-changed", () => {
    reloadMessages();
    reloadNotices();
  });
  return {
    messages: messages?.length ?? 0,
    mentions: (notices ?? []).filter((n) => n.kind === "mention" && !isSnoozed(n.id)).length,
  };
}

/** Cards given to me or taken by me and not done, on every project, for the strip's badge. */
function useMyCards(): number {
  const [count, setCount] = useState(0);
  const load = useCallback(
    () =>
      void api
        .myCards()
        .then((list) => setCount(list.length))
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  useServerEvent("board-changed", load);
  return count;
}

/** A heading over a few items when the strip is wide; a thin line between them when it is narrow. */
function NavGroup({
  id,
  label,
  wide,
  children,
}: {
  /** Its key in the colour store ("group:team"); right-click on the heading to colour it. */
  id: string;
  label: string;
  wide: boolean;
  children: ReactNode;
}) {
  const [colors] = useNavColors();
  const color = colors[`group:${id}`];
  return (
    <div className={cn("mt-2 flex flex-col gap-0.5", !wide && "items-center")}>
      {wide ? (
        <span
          data-nav-color={`group:${id}`}
          className="px-2.5 pb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-subtle"
          style={{ color: color ? NAV_COLORS[color] : undefined }}
        >
          {label}
        </span>
      ) : (
        <span className="mb-1 h-px w-6 bg-border" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

const stripRow = (wide: boolean) => (wide ? "w-full gap-2.5 px-2.5 text-[13px]" : "w-9 justify-center");

function MoreToggle({ open, wide, onClick }: { open: boolean; wide: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const label = open ? t("nav.less") : t("nav.more");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      data-tip={wide ? undefined : label}
      data-tip-side="right"
      className={cn(
        "mt-1 flex h-8 shrink-0 items-center rounded-ui text-fg-subtle transition-colors hover:bg-bg-hover hover:text-fg",
        stripRow(wide),
      )}
    >
      <ChevronDown
        size={16}
        strokeWidth={1.75}
        className={cn("shrink-0 transition-transform", open && "rotate-180")}
        aria-hidden="true"
      />
      {wide && <span className="min-w-0 flex-1 truncate text-start">{label}</span>}
    </button>
  );
}

function WidthToggle({ wide, onClick }: { wide: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={wide ? t("nav.narrow") : t("nav.wide")}
      data-tip={wide ? t("nav.narrow") : t("nav.wide")}
      data-tip-side="right"
      className="flex size-8 shrink-0 items-center justify-center rounded-ui text-fg-subtle transition-colors hover:bg-bg-hover hover:text-fg"
    >
      {wide ? <PanelLeftClose size={17} strokeWidth={1.75} /> : <PanelLeftOpen size={18} strokeWidth={1.75} />}
    </button>
  );
}

function ToolStrip({ drawer, onClose }: { drawer?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [wideSetting, setWide] = useState(readWide);
  const wide = drawer || wideSetting;
  const visible = NAV_ITEMS.filter((item) => !item.offStrip && (!item.proOnly || settings.mode === "pro"));
  const waiting = useTerminals().filter((term) => term.status === "attention").length;
  const approvals = useApprovals().length;
  const unread = useChatUnread();
  const mine = useMyCards();
  const people = useInboxPeople();
  const badges: Record<string, number> = {
    "/terminals": waiting,
    "/inbox": waiting + approvals + people.messages + people.mentions,
    "/chat": unread.count,
    "/mine": mine,
  };
  const inboxParts = [
    approvals && t("nav.inboxApprovals", { count: approvals }),
    waiting && t("nav.inboxWaiting", { count: waiting }),
    people.mentions && t("nav.inboxMentions", { count: people.mentions }),
    people.messages && t("nav.inboxMessages", { count: people.messages }),
  ].filter(Boolean);
  const badgeTips: Record<string, string> = {
    "/chat": t("nav.unreadFrom", { names: unread.from.join(", ") }),
    "/inbox": inboxParts.join(", "),
  };
  const badgeTones: Record<string, "danger" | "accent" | "warning"> = {
    "/inbox": approvals ? "danger" : people.messages + people.mentions ? "accent" : "warning",
    "/chat": "accent",
    "/mine": "accent",
  };
  const flip = () =>
    setWide((on) => {
      try {
        localStorage.setItem(WIDE, on ? "0" : "1");
      } catch {
        // Only a convenience.
      }
      return !on;
    });
  const { pathname } = useLocation();
  const [moreSetting, setMore] = useState(readMore);
  const [pinned, togglePin] = usePinned();
  const folded = (item: NavItem) => item.group === "work" || item.group === "know";
  const inMore = visible.some((item) => folded(item) && !pinned.has(item.to) && pathname.startsWith(item.to));
  const showMore = moreSetting || inMore;
  const flipMore = () =>
    setMore((on) => {
      try {
        localStorage.setItem(MORE, on ? "0" : "1");
      } catch {
        // Only a convenience.
      }
      return !on;
    });
  const link = (item: NavItem) => (
    <ToolStripLink
      key={item.to}
      item={item}
      badge={badges[item.to]}
      badgeTip={badgeTips[item.to]}
      badgeTone={badgeTones[item.to]}
      wide={wide}
      onPick={onClose}
    />
  );
  const pinnable = (item: NavItem) => (
    <PinnableLink
      key={item.to}
      item={item}
      badge={badges[item.to]}
      wide={wide}
      onPick={onClose}
      pinned={pinned.has(item.to)}
      onPin={() => togglePin(item.to)}
    />
  );
  const pinnedItems = visible.filter((item) => folded(item) && pinned.has(item.to));
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number; key: string }>();
  return (
    <nav
      data-tour="nav"
      aria-label={t("nav.menu")}
      onContextMenu={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-nav-color]");
        if (!el?.dataset.navColor) return;
        e.preventDefault();
        setColorMenu({ x: e.clientX, y: e.clientY, key: el.dataset.navColor });
      }}
      className={cn(
        "flex shrink-0 flex-col overflow-hidden border-e border-border bg-bg-subtle py-2 print:hidden",
        wide ? "w-48 items-stretch px-2" : "w-12 items-center",
        drawer && "fixed inset-y-0 start-0 z-50 w-64 shadow-ui",
      )}
    >
      <div className={cn("mb-2 flex h-9 shrink-0 items-center gap-2", wide ? "px-2" : "justify-center")} aria-hidden>
        <Logo />
        {wide && <span className="text-[14px] font-semibold tracking-tight">Igrek</span>}
      </div>
      {/* Only the middle scrolls, without a visible bar; settings and the width toggle stay put. */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          !wide && "items-center",
        )}
      >
        {visible.filter((item) => !item.bottom && !item.group).map(link)}
        <NavGroup id="team" label={t("nav.groupTeam")} wide={wide}>
          {visible.filter((item) => item.group === "team").map(link)}
        </NavGroup>
        {!showMore && pinnedItems.length > 0 && (
          <NavGroup id="pinned" label={t("nav.groupPinned")} wide={wide}>
            {pinnedItems.map(pinnable)}
          </NavGroup>
        )}
        <MoreToggle open={showMore} wide={wide} onClick={flipMore} />
        {showMore && (
          <>
            <NavGroup id="work" label={t("nav.groupWork")} wide={wide}>
              {visible.filter((item) => item.group === "work").map(pinnable)}
            </NavGroup>
            <NavGroup id="know" label={t("nav.groupKnow")} wide={wide}>
              {visible.filter((item) => item.group === "know").map(pinnable)}
            </NavGroup>
          </>
        )}
      </div>
      {/* Profile, settings and the width toggle share one row when wide (they took three). */}
      <div
        className={cn(
          "flex shrink-0 gap-0.5 border-t border-border pt-2",
          wide ? "items-center" : "flex-col items-center",
        )}
      >
        {visible
          .filter((item) => item.bottom && item.to !== "/settings")
          .map((item) =>
            wide ? (
              // Takes what is left of the row, so settings and the width toggle stay beside it.
              <div key={item.to} className="min-w-0 flex-1">
                {link(item)}
              </div>
            ) : (
              link(item)
            ),
          )}
        {visible
          .filter((item) => item.to === "/settings")
          .map((item) =>
            wide ? (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-label={t(item.label)}
                data-tip={t(item.label)}
                className={({ isActive }) =>
                  cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-ui transition-colors",
                    isActive ? "bg-bg-active text-accent-hover" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
                  )
                }
              >
                <item.icon size={17} strokeWidth={1.75} />
              </NavLink>
            ) : (
              link(item)
            ),
          )}
        {!drawer && <WidthToggle wide={wide} onClick={flip} />}
      </div>
      <NavColorMenu at={colorMenu} onClose={() => setColorMenu(undefined)} />
    </nav>
  );
}

function TopBar({
  onSearch,
  onToast,
  onMenu,
  update,
}: {
  onSearch: () => void;
  onToast: (message: string) => void;
  onMenu?: () => void;
  /** A newer version of the desktop app, when there is one. */
  update?: string;
}) {
  const { t } = useTranslation();
  return (
    // Three columns, the outer two of equal width: the search stays in the middle however wide the
    // things on either side are (with two flexible gaps it slid towards the narrower side).
    <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-bg px-3 sm:gap-3 print:hidden">
      <div className="flex min-w-0 items-center gap-2">
        {onMenu && (
          <button
            type="button"
            onClick={onMenu}
            aria-label={t("nav.menu")}
            data-tour="menu"
            className="flex size-8 shrink-0 items-center justify-center rounded-ui text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )}
        <WorkspacePicker />
      </div>
      <button
        type="button"
        onClick={onSearch}
        data-tour="search"
        aria-label={t("palette.placeholder")}
        className="flex h-7 shrink-0 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2 text-[13px] text-fg-subtle hover:border-border-strong sm:w-[min(320px,24vw)] sm:px-2.5"
      >
        <Search size={14} />
        <span className="hidden flex-1 truncate text-start sm:block">{t("palette.placeholder")}</span>
        <span className="hidden sm:inline-flex">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        <UpdateChip version={update} />
        <SyncChip />
        <span data-tour="account" className="flex">
          <AccountChip />
        </span>
        <span data-tour="stop" className="flex">
          <StopButton onStopped={onToast} />
        </span>
        <Helper />
      </div>
    </header>
  );
}

/**
 * A newer version, said where it is seen (plan.md 18.1): a system notification was easy to miss, so
 * the top bar keeps saying it. Installing is one click in Settings, where it shows its progress; the
 * data folder is never touched by it.
 */
function UpdateChip({ version }: { version?: string }) {
  const { t } = useTranslation();
  if (!version) return null;
  return (
    <Link
      to="/settings#update"
      data-tip={t("update.chipTip")}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 text-[12px] font-medium text-white hover:bg-accent-hover"
    >
      <Download size={13} aria-hidden="true" />
      <span className="hidden sm:inline">{t("update.chip", { version })}</span>
    </Link>
  );
}

/**
 * What is going on, in the status bar's empty middle (plan.md 19.8): chats at work, unread team
 * messages, my cards. Each one is a link; nothing shows when it is zero.
 */
function StatusLinks() {
  const { t } = useTranslation();
  const working = useChats().filter((c) => c.status === "working").length;
  const unread = useChatUnread().count;
  const mine = useMyCards();
  const items = [
    { to: "/terminals", count: working, label: t("status.chatsWorking", { count: working }) },
    { to: "/chat", count: unread, label: t("status.unread", { count: unread }) },
    { to: "/mine", count: mine, label: t("status.myCards", { count: mine }) },
  ].filter((i) => i.count > 0);
  return (
    <span className="hidden items-center gap-3 sm:flex">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className="hover:text-fg hover:underline">
          {i.label}
        </Link>
      ))}
    </span>
  );
}

function StatusBar({ status }: { status: SocketStatus }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const index = useIndexStatus();
  const tone = status === "connected" ? "success" : status === "connecting" ? "warning" : "danger";
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-bg-subtle px-3 text-[11px] text-fg-subtle print:hidden">
      <span className="flex items-center gap-1.5">
        <StatusDot tone={tone} />
        {t(`status.${status}`)}
      </span>
      {status === "connected" && <span className="hidden sm:inline">{t("status.allSaved")}</span>}
      {index?.running && (
        <span className="text-accent">
          {t("projects.indexing", { done: index.filesDone, total: index.filesTotal })}
        </span>
      )}
      {index?.summarizing && <span className="animate-pulse text-accent">{t("session.summarizing")}</span>}
      <div className="flex-1" />
      <StatusLinks />
      {settings.keymap === "vim" && <span className="font-mono font-semibold text-accent">VIM</span>}
      <ScreenNote />
      <span>Igrek {APP_VERSION}</span>
    </footer>
  );
}

export function Shell() {
  const { settings, receive } = useSettings();
  const { t } = useTranslation();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Mounted at its first opening and kept, so it opens instantly after that.
  const [paletteUsed, setPaletteUsed] = useState(false);
  useEffect(() => {
    if (paletteOpen) setPaletteUsed(true);
  }, [paletteOpen]);
  const [toast, setToast] = useState<string>();
  const [zen, setZen] = useState(readZen);
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState(false);
  useDesktopNotifications();
  useDesktopTray();
  const update = useDesktopUpdateCheck();
  useEffect(() => {
    const flip = () =>
      setZen((on) => {
        saveZen(!on);
        return !on;
      });
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        flip();
        return;
      }
      // Esc leaves zen too, when nothing else is there to close first (a dialog, the helper, the tour)
      // and the key is not for a text box.
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]");
      const open = document.querySelector("dialog[open], [role=dialog], [role=listbox]");
      if (event.key === "Escape" && readZen() && !event.defaultPrevented && !typing && !open) {
        flip();
        return;
      }
      // The page in front decides what its own shortcuts do (plan.md 16.4).
      runPageShortcut(event);
    };
    window.addEventListener("igrek:zen", flip);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("igrek:zen", flip);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const onMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === "settings") receive(message.settings);
      dispatchServerMessage(message);
    },
    [receive],
  );
  const status = useServerSocket(onMessage);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useVimNavigation(settings.keymap === "vim", openPalette);
  useLanguagePackSync(settings.language);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="flex h-full">
      {/* The router owns the address, so a "#main" link moved nothing: a button puts focus on the page itself. */}
      <button
        type="button"
        onClick={() => document.getElementById("main")?.focus()}
        className="sr-only z-[70] rounded-ui bg-accent px-3 py-2 text-[13px] text-accent-fg focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t("nav.skip")}
      </button>
      {!zen && !narrow && <ToolStrip />}
      {!zen && narrow && drawer && (
        <>
          <button
            type="button"
            aria-label={t("helper.close")}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setDrawer(false)}
          />
          <ToolStrip drawer onClose={() => setDrawer(false)} />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!zen && (
          <TopBar
            onSearch={openPalette}
            onToast={setToast}
            onMenu={narrow ? () => setDrawer(true) : undefined}
            update={update}
          />
        )}
        <LanguagePackBanner code={settings.language} />
        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none [scrollbar-gutter:stable] print:overflow-visible"
        >
          <div key={location.pathname} className="ge-page flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </main>
        {!zen && <StatusBar status={status} />}
      </div>
      <CodingQuestion />
      {zen && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("igrek:zen"))}
          data-tip={t("zen.exitTip")}
          className="fixed bottom-3 end-3 z-40 flex h-8 items-center gap-1.5 rounded-ui border border-border bg-bg px-2.5 text-[12px] text-fg-muted shadow-ui hover:bg-bg-hover hover:text-fg"
        >
          <Minimize2 size={14} aria-hidden="true" />
          {/* Written out: a lone faint icon was not found by someone who wanted out. */}
          {t("zen.exit")}
        </button>
      )}
      {paletteUsed && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </Suspense>
      )}
      <QuickAskGate />
      <ExtensionPairPrompt />
      <WhatIs />
      <TooltipLayer />
      <UndoToast />
      <Suspense fallback={null}>
        <Tour />
      </Suspense>
      <IdeaCapture onSaved={setToast} />
      {toast && (
        <div
          role="status"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 rounded-ui border border-border bg-bg px-4 py-2 text-[13px] shadow-ui"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
