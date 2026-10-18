import type { LucideIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

/**
 * What the page in front of the user can do, with an optional shortcut that works only on that
 * page (plan.md 16.4, like VS Code's "when" clauses). The command palette lists them under
 * "On this page"; typing ">" there shows only actions.
 */
export interface PageAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** "Mod+." or "Alt+D": Mod is Ctrl, or Cmd on a Mac. */
  keys?: string;
  run: () => void;
}

let current: PageAction[] = [];
const listeners = new Set<() => void>();

function publish(list: PageAction[]): void {
  current = list;
  for (const listener of listeners) listener();
}

/** A page says what it can do while it is shown. */
export function usePageActions(list: PageAction[]): void {
  useEffect(() => {
    publish(list);
    return () => publish([]);
  });
}

export function usePageActionList(): PageAction[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function matchesKeys(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  keys: string,
  mac = isMac,
): boolean {
  const parts = keys.split("+");
  const key = parts.pop()?.toLowerCase() ?? "";
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const mod = mac ? event.metaKey : event.ctrlKey;
  return (
    event.key.toLowerCase() === key &&
    mod === want.has("mod") &&
    event.altKey === want.has("alt") &&
    event.shiftKey === want.has("shift")
  );
}

/** Runs the current page's action whose shortcut was pressed. */
export function runPageShortcut(event: KeyboardEvent): boolean {
  const action = current.find((a) => a.keys && matchesKeys(event, a.keys));
  if (!action) return false;
  event.preventDefault();
  action.run();
  return true;
}

/** How a shortcut is written for this computer: "Ctrl+." or "⌘." style words, no symbols. */
export function showKeys(keys: string, mac = isMac): string {
  return keys.replace("Mod", mac ? "Cmd" : "Ctrl");
}
