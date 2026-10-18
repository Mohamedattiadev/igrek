import { useEffect, useState } from "react";

/**
 * "Undo everywhere" (plan.md 7.0): a delete waits a few seconds before it really happens.
 * The item disappears at once; "Undo" brings it back and nothing is deleted.
 */
export interface PendingDelete {
  id: string;
  label: string;
  at: number;
}

const WAIT_MS = 6000;
const pending = new Map<
  string,
  { label: string; at: number; run: () => Promise<unknown>; timer: ReturnType<typeof setTimeout> }
>();
const events = new EventTarget();
const changed = () => events.dispatchEvent(new Event("change"));

export function deferDelete(id: string, label: string, run: () => Promise<unknown>, after?: () => void): void {
  const timer = setTimeout(() => {
    pending.delete(id);
    changed();
    void run().then(() => after?.());
  }, WAIT_MS);
  pending.set(id, { label, at: Date.now(), run, timer });
  changed();
}

export function undoDelete(id: string): void {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  changed();
}

/** Re-renders when the waiting list changes; `isPending` hides those items from lists. */
export function usePendingDeletes(): { isPending: (id: string) => boolean; list: PendingDelete[] } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    events.addEventListener("change", on);
    return () => events.removeEventListener("change", on);
  }, []);
  return {
    isPending: (id) => pending.has(id),
    list: [...pending.entries()].map(([id, e]) => ({ id, label: e.label, at: e.at })),
  };
}
