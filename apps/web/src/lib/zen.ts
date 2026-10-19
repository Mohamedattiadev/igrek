import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * Zen mode (plan.md 7.0): hide the side strip, top bar and status bar, keep only the content.
 * Remembered per browser; Ctrl+Alt+Z or the command palette toggles it.
 */
const KEY = "igrek.zen";

export function readZen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleZen(): void {
  window.dispatchEvent(new CustomEvent("igrek:zen"));
}

export function saveZen(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Private window: zen still works, just isn't remembered.
  }
}

/**
 * The browser's full screen for one element (a board), or for the whole page with zen mode on top
 * (a chat), so nothing but the work is left. Escape leaves it, and zen goes with it when this turned
 * it on. Returns whether it is on and a toggle.
 */
export function useFullscreen(target?: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const zenByUs = useRef(false);
  useEffect(() => {
    const changed = () => {
      const full = !!document.fullscreenElement;
      setOn(full);
      if (!full && zenByUs.current) {
        zenByUs.current = false;
        toggleZen();
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    const element = target?.current ?? document.documentElement;
    void element
      .requestFullscreen()
      .then(() => {
        if (!target && !readZen()) {
          zenByUs.current = true;
          toggleZen();
        }
      })
      .catch(() => undefined);
  };
  return [on, toggle];
}
