import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Igrek's desktop app (apps/desktop) shows this same web app in a window of its own and adds what a
 * browser tab cannot have: system notifications, starting with the computer, a tray menu and signed
 * updates. Outside it none of this exists and the browser's own ways are used.
 */
type Command = "notify" | "autostart" | "set_autostart" | "update_check" | "update_install" | "tray_texts";

interface Tauri {
  core: { invoke<T>(command: Command, args?: Record<string, unknown>): Promise<T> };
}

const tauri = (window as unknown as { __TAURI__?: Tauri }).__TAURI__;

export const inDesktopApp = !!tauri;

/** Calls one of the desktop app's commands (src-tauri/src/main.rs). */
export function desktop<T = void>(command: Command, args?: Record<string, unknown>): Promise<T> {
  if (!tauri) return Promise.reject(new Error("Not in Igrek's desktop app"));
  // The app answers a failure with a plain string; callers get an Error like everywhere else.
  return tauri.core.invoke<T>(command, args).catch((reason: unknown) => {
    throw new Error(reason instanceof Error ? reason.message : String(reason));
  });
}

/**
 * True once when the desktop app was started for a quick question (`--quick-ask`, the user's own
 * shortcut where the system has no global ones). It cannot send its usual event to a page that is
 * not there yet, so it opens the first page as `/?quick-ask`; the mark is taken off so a reload does
 * not open it again. (Kept small: this runs on the first screen, which has a size budget.)
 */
export function takeQuickAskFromStart(): boolean {
  if (!inDesktopApp || location.search !== "?quick-ask") return false;
  history.replaceState(history.state, "", location.pathname);
  return true;
}

/** The tray menu speaks the language the user chose here. */
export function useDesktopTray(): void {
  const { t } = useTranslation();
  useEffect(() => {
    if (!inDesktopApp) return;
    void desktop("tray_texts", {
      open: t("desktop.trayOpen"),
      hide: t("desktop.trayHide"),
      quit: t("desktop.trayQuit"),
    }).catch(() => undefined);
  }, [t]);
}
