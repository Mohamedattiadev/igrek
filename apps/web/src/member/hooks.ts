import { useEffect, useState, useSyncExternalStore } from "react";
import type { MemberClient } from "./client";

/** Re-renders whenever the client has something new; the version counter is all React needs to compare. */
export function useClient(client: MemberClient): number {
  const [version] = useState(() => ({ n: 0 }));
  return useSyncExternalStore(
    (notify) =>
      client.subscribe(() => {
        version.n++;
        notify();
      }),
    () => version.n,
  );
}

/** Phones and narrow windows: the menu becomes a drawer, as in Igrek. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const m = matchMedia("(max-width: 767px)");
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

const readRoute = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")) || "home";

/**
 * Where the page is, in the address after "#" ("#/chat/...", "#/project/..."), so the browser's
 * back button and a link from a notification work.
 */
export function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [route, (to) => (location.hash = `/${encodeURI(to)}`)];
}

export type ThemeChoice = "system" | "light" | "dark";
const THEME = "igrek.member.theme";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Light, dark or the system's, like Igrek's setting; kept in this browser only. */
export function applyTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME, choice);
  } catch {
    // Private windows may refuse storage: the choice then lasts this visit.
  }
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
