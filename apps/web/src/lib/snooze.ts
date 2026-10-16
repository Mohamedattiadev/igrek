const KEY = "godeye.snoozed";

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** Hides an inbox item until the given time (default: 4 hours). Per browser. */
export function snooze(id: string, ms = 4 * 60 * 60_000): void {
  const all = read();
  all[id] = Date.now() + ms;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage disabled: the item simply stays visible.
  }
}

export function isSnoozed(id: string): boolean {
  return (read()[id] ?? 0) > Date.now();
}
