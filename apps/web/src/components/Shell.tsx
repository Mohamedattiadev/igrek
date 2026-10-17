import type { ServerMessage } from "@godeye/core";
import { APP_VERSION } from "@godeye/core";
import { Minimize2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { dispatchServerMessage, useApprovals, useIndexStatus, useTerminals } from "../lib/live";
import { useSettings } from "../lib/settings";
import { type SocketStatus, useServerSocket } from "../lib/socket";
import { useVimNavigation } from "../lib/vim";
import { readZen, saveZen } from "../lib/zen";
import { AccountChip } from "./AccountChip";
import { CommandPalette } from "./CommandPalette";
import { IdeaCapture } from "./IdeaCapture";
import { useLanguagePackSync } from "./LanguagePack";
import { NAV_ITEMS, type NavItem } from "./nav";
import { QuickAsk } from "./QuickAsk";
import { StopButton } from "./StopButton";
import { SyncChip } from "./SyncChip";
import { TooltipLayer } from "./Tooltip";
import { Tour } from "./Tour";
import { UndoToast } from "./UndoToast";
import { Kbd, StatusDot } from "./ui";
import { WorkspacePicker } from "./WorkspacePicker";

function ToolStripLink({ item, badge }: { item: NavItem; badge?: number }) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      data-tip={t(item.label)}
      data-tip-side="right"
      aria-label={t(item.label)}
      className={({ isActive }) =>
        cn(
          "relative flex size-9 items-center justify-center rounded-ui transition-colors",
          isActive ? "bg-bg-active text-accent" : "text-fg-subtle hover:bg-bg-hover hover:text-fg",
        )
      }
    >
      <item.icon size={18} strokeWidth={1.75} />
      {!!badge && (
        <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold text-on-strong">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function ToolStrip() {
  const { settings } = useSettings();
  const visible = NAV_ITEMS.filter((item) => !item.proOnly || settings.mode === "pro");
  const waiting = useTerminals().filter((term) => term.status === "attention").length;
  const approvals = useApprovals().length;
  const badges: Record<string, number> = { "/terminals": waiting, "/inbox": waiting + approvals };
  return (
    <nav
      data-tour="nav"
      className="flex w-12 shrink-0 flex-col items-center gap-1 border-e border-border bg-bg-subtle py-2"
    >
      <div className="mb-2 flex size-9 items-center justify-center" aria-hidden>
        <svg viewBox="0 0 32 32" className="size-6">
          <title>God Eye</title>
          <circle cx="16" cy="16" r="14" fill="var(--accent)" />
          <circle cx="16" cy="16" r="6" fill="white" />
          <circle cx="16" cy="16" r="2.5" fill="var(--fg)" />
        </svg>
      </div>
      {visible
        .filter((item) => !item.bottom)
        .map((item) => (
          <ToolStripLink key={item.to} item={item} badge={badges[item.to]} />
        ))}
      <div className="flex-1" />
      {visible
        .filter((item) => item.bottom)
        .map((item) => (
          <ToolStripLink key={item.to} item={item} />
        ))}
    </nav>
  );
}

function TopBar({ onSearch, onToast }: { onSearch: () => void; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-bg px-3">
      <WorkspacePicker />
      <div className="flex-1" />
      <button
        type="button"
        onClick={onSearch}
        data-tour="search"
        className="flex h-7 w-[min(340px,40vw)] items-center gap-2 rounded-ui border border-border bg-bg-subtle px-2.5 text-[13px] text-fg-subtle hover:border-border-strong"
      >
        <Search size={14} />
        <span className="flex-1 truncate text-start">{t("palette.placeholder")}</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="flex-1" />
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
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-bg-subtle px-3 text-[11px] text-fg-subtle">
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
      <span>God Eye {APP_VERSION}</span>
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
      }
    };
    window.addEventListener("godeye:zen", flip);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("godeye:zen", flip);
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
      {!zen && <ToolStrip />}
      <div className="flex min-w-0 flex-1 flex-col">
        {!zen && <TopBar onSearch={openPalette} onToast={setToast} />}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div key={location.pathname} className="ge-page flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        </main>
        {!zen && <StatusBar status={status} />}
      </div>
      {zen && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("godeye:zen"))}
          aria-label={t("zen.exit")}
          data-tip={t("zen.exitTip")}
          className="fixed bottom-3 end-3 z-40 flex size-7 items-center justify-center rounded-ui border border-border bg-bg text-fg-subtle opacity-60 shadow-ui hover:text-fg hover:opacity-100"
        >
          <Minimize2 size={14} aria-hidden="true" />
        </button>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <QuickAsk />
      <TooltipLayer />
      <UndoToast />
      <Tour />
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
