import type { ServerMessage } from "@igrek/core";
import { APP_VERSION } from "@igrek/core";
import { ChevronDown, Menu, Minimize2, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { useDesktopTray, useDesktopUpdateCheck } from "../lib/desktop";
import { dispatchServerMessage, useApprovals, useIndexStatus, useTerminals } from "../lib/live";
import { useDesktopNotifications } from "../lib/notify";
import { runPageShortcut } from "../lib/page-actions";
import { useSettings } from "../lib/settings";
import { type SocketStatus, useServerSocket } from "../lib/socket";
import { useVimNavigation } from "../lib/vim";
import { readZen, saveZen } from "../lib/zen";
import { AccountChip } from "./AccountChip";
import { CommandPalette } from "./CommandPalette";
import { Helper } from "./Helper";
import { IdeaCapture } from "./IdeaCapture";
import { LanguagePackBanner, useLanguagePackSync } from "./LanguagePack";
import { Logo } from "./Logo";
import { NAV_ITEMS, type NavItem } from "./nav";
import { QuickAsk } from "./QuickAsk";
import { StopButton } from "./StopButton";
import { SyncChip } from "./SyncChip";
import { TooltipLayer } from "./Tooltip";
import { Tour } from "./Tour";
import { UndoToast } from "./UndoToast";
import { Kbd, StatusDot } from "./ui";
import { WhatIs } from "./WhatIs";
import { WorkspacePicker } from "./WorkspacePicker";

const WIDE = "igrek.nav.wide";
const MORE = "igrek.nav.more";

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

function ToolStripLink({
  item,
  badge,
  wide,
  onPick,
}: {
  item: NavItem;
  badge?: number;
  wide: boolean;
  onPick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onPick}
      data-tip={wide ? undefined : t(item.label)}
      data-tip-side="right"
      aria-label={t(item.label)}
      className={({ isActive }) =>
        cn(
          "relative flex h-9 shrink-0 items-center rounded-ui transition-colors",
          wide ? "w-full gap-2.5 px-2.5 text-[13px]" : "w-9 justify-center",
          isActive ? "bg-bg-active font-medium text-accent-hover" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
        )
      }
    >
      <item.icon size={18} strokeWidth={1.75} className="shrink-0" />
      {wide && <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>}
      {!!badge && (
        <span
          className={cn(
            "flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold text-on-strong",
            !wide && "absolute -end-0.5 -top-0.5",
          )}
        >
          {badge}
        </span>
      )}
    </NavLink>
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
      data-tip={wide ? undefined : t("nav.wide")}
      data-tip-side="right"
      className={cn(
        "flex h-9 shrink-0 items-center rounded-ui text-fg-subtle transition-colors hover:bg-bg-hover hover:text-fg",
        stripRow(wide),
      )}
    >
      {wide ? <PanelLeftClose size={18} strokeWidth={1.75} /> : <PanelLeftOpen size={18} strokeWidth={1.75} />}
      {wide && <span>{t("nav.narrow")}</span>}
    </button>
  );
}

function ToolStrip({ drawer, onClose }: { drawer?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [wideSetting, setWide] = useState(readWide);
  const wide = drawer || wideSetting;
  const visible = NAV_ITEMS.filter((item) => !item.proOnly || settings.mode === "pro");
  const waiting = useTerminals().filter((term) => term.status === "attention").length;
  const approvals = useApprovals().length;
  const badges: Record<string, number> = { "/terminals": waiting, "/inbox": waiting + approvals };
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
  const inMore = visible.some((item) => item.more && item.to !== "/" && pathname.startsWith(item.to));
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
    <ToolStripLink key={item.to} item={item} badge={badges[item.to]} wide={wide} onPick={onClose} />
  );
  return (
    <nav
      data-tour="nav"
      aria-label={t("nav.menu")}
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
        {visible.filter((item) => !item.bottom && !item.more).map(link)}
        <MoreToggle open={showMore} wide={wide} onClick={flipMore} />
        {showMore && visible.filter((item) => !item.bottom && item.more).map(link)}
      </div>
      <div className={cn("flex shrink-0 flex-col gap-0.5 border-t border-border pt-2", !wide && "items-center")}>
        {visible.filter((item) => item.bottom).map(link)}
        {!drawer && <WidthToggle wide={wide} onClick={flip} />}
      </div>
    </nav>
  );
}

function TopBar({
  onSearch,
  onToast,
  onMenu,
}: {
  onSearch: () => void;
  onToast: (message: string) => void;
  onMenu?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-bg px-3 sm:gap-3 print:hidden">
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
      <div className="flex-1" />
      <button
        type="button"
        onClick={onSearch}
        data-tour="search"
        aria-label={t("palette.placeholder")}
        className="flex h-7 shrink-0 items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2 text-[13px] text-fg-subtle hover:border-border-strong sm:w-[min(340px,40vw)] sm:px-2.5"
      >
        <Search size={14} />
        <span className="hidden flex-1 truncate text-start sm:block">{t("palette.placeholder")}</span>
        <span className="hidden sm:inline-flex">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>
      <div className="flex-1" />
      {/* No "?" here: the helper in the corner answers the same questions and opens the guide and the tour. */}
      <SyncChip />
      <span data-tour="account" className="flex">
        <AccountChip />
      </span>
      <span data-tour="stop" className="flex">
        <StopButton onStopped={onToast} />
      </span>
    </header>
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
      {settings.keymap === "vim" && <span className="font-mono font-semibold text-accent">VIM</span>}
      <span>Igrek {APP_VERSION}</span>
    </footer>
  );
}

export function Shell() {
  const { settings, receive } = useSettings();
  const { t } = useTranslation();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string>();
  const [zen, setZen] = useState(readZen);
  const narrow = useNarrow();
  const [drawer, setDrawer] = useState(false);
  useDesktopNotifications();
  useDesktopTray();
  useDesktopUpdateCheck();
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
          <TopBar onSearch={openPalette} onToast={setToast} onMenu={narrow ? () => setDrawer(true) : undefined} />
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
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <QuickAsk />
      <WhatIs />
      <TooltipLayer />
      <UndoToast />
      <Tour />
      {/* A chat is already a conversation, and the button would sit on its send box. */}
      {!zen && !location.pathname.startsWith("/c/") && <Helper />}
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
