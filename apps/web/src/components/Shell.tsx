import type { ServerMessage } from "@igrek/core";
import { APP_VERSION } from "@igrek/core";
import { Download, Menu, Minimize2, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
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
import { BackgroundChip } from "./BackgroundChip";
import { CodingQuestion } from "./CodingQuestion";
import { ExtensionPairPrompt } from "./ExtensionPairPrompt";
import { Helper } from "./Helper";
import { IdeaCapture } from "./IdeaCapture";
import { LanguagePackBanner, useLanguagePackSync } from "./LanguagePack";
import { Logo } from "./Logo";
import { NavColorMenu } from "./NavColors";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem, sectionOf } from "./nav";
import { QuickAskGate } from "./QuickAskGate";
import { ScreenNote } from "./ScreenNote";
import { StopButton } from "./StopButton";
import { SyncChip } from "./SyncChip";
import { TooltipLayer } from "./Tooltip";
import { UndoToast } from "./UndoToast";
import { Count, Kbd, Segmented, StatusDot, TabBar } from "./ui";
import { WhatIs } from "./WhatIs";
import { WorkspacePicker } from "./WorkspacePicker";

// Loaded when first needed, so the first screen does not carry them (scripts/bundle-budget.json).
const CommandPalette = lazy(() => import("./CommandPalette").then((m) => ({ default: m.CommandPalette })));
const Tour = lazy(() => import("./Tour").then((m) => ({ default: m.Tour })));

const WIDE = "igrek.nav.wide";

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

function ToolStripLink({
  item,
  badge,
  badgeTip,
  badgeTone = "warning",
  wide,
  onPick,
  active,
}: {
  item: NavItem;
  /** For a place: lit while any of its pages is open, not only its first. */
  active?: boolean;
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
          // (active ?? isActive) below: a place is lit on all its pages.
          // 32 px rows: the whole strip, "More" open, fits a laptop screen without scrolling.
          "relative flex h-8 shrink-0 items-center rounded-ui transition-colors",
          // Under "More" too: one a row, the same size as the rest (two a row looked cramped).
          wide ? "w-full gap-2.5 px-2.5 text-[13px]" : "w-9 justify-center",
          (active ?? isActive)
            ? "bg-bg-active font-medium text-accent-hover"
            : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
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
  const inbox = waiting + approvals + people.messages + people.mentions;
  // A place's count is its pages' together: the inbox and my cards on Home, unread on Messages.
  const badges: Record<string, number> = { home: inbox + mine, projects: waiting, chat: unread.count };
  const inboxParts = [
    approvals && t("nav.inboxApprovals", { count: approvals }),
    waiting && t("nav.inboxWaiting", { count: waiting }),
    people.mentions && t("nav.inboxMentions", { count: people.mentions }),
    people.messages && t("nav.inboxMessages", { count: people.messages }),
    mine && t("nav.mineCards", { count: mine }),
  ].filter(Boolean);
  const badgeTips: Record<string, string> = {
    chat: t("nav.unreadFrom", { names: unread.from.join(", ") }),
    home: inboxParts.join(", "),
  };
  const badgeTones: Record<string, "danger" | "accent" | "warning"> = {
    home: approvals ? "danger" : people.messages + people.mentions + mine ? "accent" : "warning",
    chat: "accent",
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
  const here = sectionOf(pathname)?.id;
  const link = (item: NavItem) => <ToolStripLink key={item.to} item={item} wide={wide} onPick={onClose} />;
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
      {/* Five places; each one's pages are tabs across the top of the page (SectionTabs). */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          !wide && "items-center",
        )}
      >
        {NAV_SECTIONS.map((section) => (
          <ToolStripLink
            key={section.id}
            item={{ to: section.pages[0] ?? "/", label: section.label, icon: section.icon }}
            active={here === section.id}
            badge={badges[section.id]}
            badgeTip={badgeTips[section.id]}
            badgeTone={badgeTones[section.id]}
            wide={wide}
            onPick={onClose}
          />
        ))}
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

/**
 * The pages of the place that is open, as tabs across the top (Home: inbox, my cards, the news;
 * Team: the team, meetings, the company...). Only on those pages: a project or a chat has its own.
 */
function SectionTabs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = sectionOf(pathname);
  if (!section || section.pages.length < 2 || !section.pages.includes(pathname)) return null;
  const page = (to: string) => NAV_ITEMS.find((item) => item.to === to);
  return (
    <TabBar>
      <Segmented
        label={t(section.label)}
        value={pathname}
        onChange={(to) => void navigate(to)}
        options={section.pages.map((to) => ({ value: to, label: t(page(to)?.label ?? ""), icon: page(to)?.icon }))}
      />
    </TabBar>
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
        <BackgroundChip />
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
        {!zen && <SectionTabs />}
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
