import type { Database } from "bun:sqlite";
import type { Seat, SeatBudget } from "@igrek/core";
import type { Hono } from "hono";
import type { Bus } from "./bus";

/**
 * Budgets per person on the Company page (plan.md, earlier talks): how much of their weekly AI
 * limit, or how many tokens a week, is fine; past it they show under "What to watch" and the admin
 * gets one desktop notice that week. Kept on this computer (the admin's), never sent anywhere.
 */

/** "2026-W44": the week a notice was sent in, so it comes once a week, not at every report. */
export function weekOf(at: number): string {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** What a person's week is past, if anything: the highest limit use of their accounts, and their tokens. */
export function overBudget(
  seat: Pick<Seat, "accounts" | "week">,
  budget: SeatBudget,
): { weekPct?: number; tokens?: number } | undefined {
  const used = Math.max(0, ...seat.accounts.map((a) => a.week ?? 0)) * 100;
  const tokens = seat.week.input + seat.week.output;
  const pct = budget.weekPct && used >= budget.weekPct ? Math.round(used) : undefined;
  const over = budget.weekTokens && tokens >= budget.weekTokens ? tokens : undefined;
  return pct !== undefined || over !== undefined
    ? { ...(pct !== undefined ? { weekPct: pct } : {}), ...(over !== undefined ? { tokens: over } : {}) }
    : undefined;
}

export class Budgets {
  constructor(
    private readonly db: Database,
    private readonly bus: Bus,
  ) {}

  all(): Record<string, SeatBudget> {
    const rows = this.db.query("SELECT member, week_pct, week_tokens FROM seat_budgets").all() as {
      member: string;
      week_pct: number | null;
      week_tokens: number | null;
    }[];
    return Object.fromEntries(
      rows.map((r) => [
        r.member,
        { ...(r.week_pct ? { weekPct: r.week_pct } : {}), ...(r.week_tokens ? { weekTokens: r.week_tokens } : {}) },
      ]),
    );
  }

  set(member: string, budget: SeatBudget): void {
    const pct = budget.weekPct ? Math.min(100, Math.max(1, Math.round(budget.weekPct))) : null;
    const tokens = budget.weekTokens ? Math.max(1, Math.round(budget.weekTokens)) : null;
    this.db.transaction(() => {
      if (!pct && !tokens) this.db.query("DELETE FROM seat_budgets WHERE member = ?").run(member);
      else
        this.db
          .query(
            `INSERT INTO seat_budgets (member, week_pct, week_tokens) VALUES (?, ?, ?)
             ON CONFLICT(member) DO UPDATE SET week_pct = excluded.week_pct, week_tokens = excluded.week_tokens`,
          )
          .run(member, pct, tokens);
    })();
  }

  /** People past their budget get one notice a week (the Company page always shows them). */
  check(seats: Seat[], now = Date.now()): void {
    const budgets = this.all();
    const week = weekOf(now);
    for (const seat of seats) {
      const budget = budgets[seat.memberId];
      const over = budget && overBudget(seat, budget);
      if (!over) continue;
      const { changes } = this.db
        .query("UPDATE seat_budgets SET noticed = ? WHERE member = ? AND (noticed IS NULL OR noticed != ?)")
        .run(week, seat.memberId, week);
      if (changes) this.bus.publish({ type: "alert", kind: "budget", title: seat.name, link: "/company" });
    }
  }
}

export function registerBudgetRoutes(app: Hono, budgets: Budgets, isAdmin: () => boolean): void {
  app.get("/api/team/budgets", (c) => c.json(budgets.all()));
  app.put("/api/team/budgets/:member", async (c) => {
    if (!isAdmin()) return c.json({ error: "Only an admin sets budgets" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as SeatBudget;
    budgets.set(c.req.param("member"), {
      weekPct: Number(body.weekPct) || undefined,
      weekTokens: Number(body.weekTokens) || undefined,
    });
    return c.json(budgets.all());
  });
}
