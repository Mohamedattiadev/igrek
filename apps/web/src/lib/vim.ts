import { useEffect } from "react";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("main [data-nav-item]")];
}

function focusItem(list: HTMLElement[], index: number): void {
  const target = list[Math.max(0, Math.min(index, list.length - 1))];
  if (!target) return;
  for (const el of list) el.dataset.navActive = String(el === target);
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "nearest" });
}

/**
 * Vim-style navigation for lists (plan.md 2.3): j/k move, gg/G jump,
 * Enter opens, / opens search. Elements opt in with `data-nav-item`.
 */
export function useVimNavigation(enabled: boolean, onSearch: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const list = items();
      const current = list.findIndex((el) => el.dataset.navActive === "true");

      switch (event.key) {
        case "j":
          focusItem(list, current + 1);
          break;
        case "k":
          focusItem(list, current <= 0 ? 0 : current - 1);
          break;
        case "G":
          focusItem(list, list.length - 1);
          break;
        case "g":
          if (pendingG) {
            focusItem(list, 0);
            pendingG = false;
          } else {
            pendingG = true;
            clearTimeout(gTimer);
            gTimer = setTimeout(() => (pendingG = false), 500);
          }
          break;
        case "/":
          onSearch();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(gTimer);
    };
  }, [enabled, onSearch]);
}
