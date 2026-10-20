import { useEffect, useState } from "react";

/** Chrome and Edge's offer to install the page as an app; it comes once, early, so it is kept here. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPrompt | undefined;
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of listeners) listener();
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  offer = event as InstallPrompt;
  changed();
});
window.addEventListener("appinstalled", () => {
  offer = undefined;
  changed();
});

/** Already running in its own window (installed). */
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches ?? false;

/**
 * "Install as an app": whether this browser offers it now, whether Igrek already runs as one, and
 * the call that shows the browser's own install question.
 */
export function useInstallApp(): { available: boolean; installed: boolean; install: () => Promise<void> } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    available: !!offer,
    installed: installed(),
    install: async () => {
      if (!offer) return;
      await offer.prompt();
      await offer.userChoice;
      offer = undefined;
      changed();
    },
  };
}
