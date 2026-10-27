import { useEffect, useState } from "react";

const KEY = "igrek.navColors";
const EVENT = "igrek:nav-colors";

/** Colours a page's icon in the sidebar can take; they read in light and dark themes alike. */
export const NAV_COLORS = {
  red: "#e5484d",
  orange: "#f76b15",
  amber: "#d4a72c",
  green: "#30a46c",
  teal: "#12a594",
  blue: "#3e63dd",
  violet: "#8e4ec6",
  pink: "#d6409f",
} as const;
export type NavColor = keyof typeof NAV_COLORS;

function read(): Record<string, NavColor> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
    return Object.fromEntries(Object.entries(all).filter(([, c]) => c in NAV_COLORS)) as Record<string, NavColor>;
  } catch {
    return {};
  }
}

/**
 * A colour per sidebar page (plan.md 18.5), so "Company" stands out at a glance. Kept in this
 * browser: it is how this person likes their sidebar, nothing the team needs.
 */
export function useNavColors(): [Record<string, NavColor>, (page: string, color?: NavColor) => void] {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const changed = () => setColors(read());
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, []);
  const set = (page: string, color?: NavColor) => {
    const all = read();
    if (color) all[page] = color;
    else delete all[page];
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Storage disabled: the colour lasts until the page is reloaded.
    }
    setColors(all);
    window.dispatchEvent(new Event(EVENT));
  };
  return [colors, set];
}
