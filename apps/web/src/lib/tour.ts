/** The 60-second tour (plan.md 7.0): started after setup, from Settings or the command palette. */
const PENDING = "igrek.tour.pending";

export function startTour(): void {
  window.dispatchEvent(new CustomEvent("igrek:tour"));
}

/** Setup finished: show the tour once the main screen is up. */
export function queueTour(): void {
  try {
    localStorage.setItem(PENDING, "1");
  } catch {
    // Without storage the tour can still be started from Settings.
  }
}

export function takeQueuedTour(): boolean {
  try {
    const queued = localStorage.getItem(PENDING) === "1";
    localStorage.removeItem(PENDING);
    return queued;
  } catch {
    return false;
  }
}

const SEEN = "igrek.tour.seen";

/** The tour starts by itself once; after it was closed or finished it waits to be asked for. */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // Without storage it simply won't start by itself.
  }
}
