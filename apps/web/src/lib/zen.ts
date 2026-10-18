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
