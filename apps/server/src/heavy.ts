/** A person counts as working for this long after their last action (a click that changes something, typing). */
const QUIET_MS = 20_000;
/** Background work waits for quiet at most this long, then runs anyway (it must not wait forever). */
const MAX_WAIT_MS = 10 * 60_000;

/**
 * Igrek's heavy background work (plan.md 19.10): summaries, lesson scans, recaps and reports,
 * secret scans, the knowledge digest. One at a time, in order, and each waits until the person has
 * stopped clicking and typing for a moment, so the app stays quick while they work.
 */
export class HeavyWork {
  private chain: Promise<unknown> = Promise.resolve();
  private lastActive = 0;
  /** What is running now, for the status line and tests. */
  running?: string;

  constructor(
    private readonly sleep: (ms: number) => Promise<void> = (ms) => Bun.sleep(ms),
    private readonly now: () => number = Date.now,
  ) {}

  /** The person did something (the server calls it on every change they make). */
  active(): void {
    this.lastActive = this.now();
  }

  busy(): boolean {
    return this.now() - this.lastActive < QUIET_MS;
  }

  /** Runs after everything queued before it, once the person is quiet; its error is its own. */
  run<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const until = this.now() + MAX_WAIT_MS;
      while (this.busy() && this.now() < until) await this.sleep(2000);
      this.running = name;
      try {
        return await fn();
      } finally {
        this.running = undefined;
      }
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}
