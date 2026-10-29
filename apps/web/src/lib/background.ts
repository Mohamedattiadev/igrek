import { useCallback, useSyncExternalStore } from "react";

/**
 * Work a button started that takes a while (a server scan, an expert's answer, a report): kept here,
 * outside the page, so leaving the page and coming back shows it still running, then its result (a
 * user pressed "Look", went elsewhere, came back and found the button as if nothing had happened).
 * The top bar lists what is running and what just finished, each a link back to its page.
 */
export interface BackgroundTask {
  key: string;
  label: string;
  /** The page it was started on, to go back to it. */
  path: string;
  startedAt: number;
  status: "running" | "done" | "failed";
  finishedAt?: number;
  result?: unknown;
  error?: string;
  /** Seen on its page after it finished: it leaves the "just finished" list. */
  seen?: boolean;
}

const tasks = new Map<string, BackgroundTask & { promise?: Promise<unknown> }>();
const listeners = new Set<() => void>();
/** The page now, to go back to (empty outside a browser, as in tests). */
const here = () => (typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`);
let snapshot: BackgroundTask[] = [];
/** Finished work stays listed this long, unless its page shows it first. */
const KEEP_MS = 15 * 60_000;

function changed(): void {
  const now = Date.now();
  for (const [key, task] of tasks)
    if (task.status !== "running" && (task.finishedAt ?? now) < now - KEEP_MS) tasks.delete(key);
  snapshot = [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Where it was started, when the caller gave no name: the page's title and its open tab. */
function pageLabel(): string {
  const title = document.querySelector("main h1, h1")?.textContent?.trim() ?? "";
  const tab = document.querySelector("fieldset input[type=radio]:checked")?.parentElement?.textContent?.trim();
  return [title, tab].filter(Boolean).join(" · ") || document.title;
}

/** Starts it unless the same work is already running; the promise is the work's own. */
export function runInBackground<T>(key: string, label: string, work: () => Promise<T>): Promise<T> {
  const running = tasks.get(key);
  if (running?.status === "running" && running.promise !== undefined) return running.promise as Promise<T>;
  const task: BackgroundTask & { promise?: Promise<unknown> } = {
    key,
    label,
    path: here(),
    startedAt: Date.now(),
    status: "running",
  };
  const promise = work().then(
    (result) => {
      Object.assign(task, { status: "done", result, finishedAt: Date.now() });
      changed();
      return result;
    },
    (err: unknown) => {
      Object.assign(task, { status: "failed", error: (err as Error).message, finishedAt: Date.now() });
      changed();
      throw err;
    },
  );
  task.promise = promise;
  tasks.set(key, task);
  changed();
  return promise;
}

/** Everything running and recently finished, newest first. */
export function useBackgroundTasks(): BackgroundTask[] {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/**
 * One button's work: whether it runs, its last result or error, and a way to start it. The result
 * outlives the page: coming back shows it. `key` names the work and what it is about ("ports:<server>").
 */
export function useBackground<T>(
  key: string,
  label?: string,
): {
  running: boolean;
  result?: T;
  error?: string;
  run: (work: () => Promise<T>) => Promise<T | undefined>;
} {
  const list = useBackgroundTasks();
  const task = list.find((x) => x.key === key);
  if (task && task.status !== "running" && !task.seen) task.seen = true;
  const run = useCallback(
    (work: () => Promise<T>) => runInBackground(key, label ?? pageLabel(), work).catch(() => undefined),
    [key, label],
  );
  return {
    running: task?.status === "running",
    result: task?.status === "done" ? (task.result as T) : undefined,
    error: task?.status === "failed" ? task.error : undefined,
    run,
  };
}

/**
 * A drop-in for `useState(false)` behind a button's "working..." state: the state lives in the
 * background store, keyed by `name` and the page, so it survives leaving the page while the work
 * goes on, and shows in the top bar. The work's own result reaches the page through its usual reload.
 */
export function useBusyState(name: string, label?: string): [boolean, (on: boolean) => void] {
  const key = `${name}@${window.location.pathname}`;
  const list = useBackgroundTasks();
  const busy = list.some((x) => x.key === key && x.status === "running");
  const set = useCallback(
    (on: boolean) => {
      const task = tasks.get(key);
      if (on) {
        if (task?.status === "running") return;
        tasks.set(key, {
          key,
          label: label ?? pageLabel(),
          path: here(),
          startedAt: Date.now(),
          status: "running",
        });
      } else if (task?.status === "running") Object.assign(task, { status: "done", finishedAt: Date.now() });
      changed();
    },
    [key, label],
  );
  return [busy, set];
}
