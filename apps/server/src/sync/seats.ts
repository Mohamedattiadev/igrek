import type { Database } from "bun:sqlite";
import { platform } from "node:os";
import type { Account, Seat } from "@igrek/core";

/** What one Igrek tells the team about itself: its AI accounts and its week, never chats or emails. */
export type SeatReport = Pick<Seat, "version" | "os" | "accounts" | "week">;

const WEEK = 7 * 86_400_000;

/**
 * The Company page (plan.md, 26 Oct 2026): who in the team uses which AI accounts, how full their
 * limits are, and how much was used this week. Each Igrek reports itself, end-to-end encrypted on
 * the team's index channel, when the user lets it (Settings, shareUsage); the hub sees nothing.
 */
export class Seats {
  constructor(
    private readonly db: Database,
    private readonly accounts: () => Account[],
    private readonly version: string,
  ) {}

  /** This computer's report: the account labels and plans as the user named them, the limits, the week's tokens. */
  mine(now = Date.now()): SeatReport {
    const rows = this.db
      .query("SELECT session_id, model, input, output, cache_read, cache_write FROM usage WHERE ts >= ?")
      .all(now - WEEK) as {
      session_id: string;
      model: string | null;
      input: number;
      output: number;
      cache_read: number;
      cache_write: number;
    }[];
    const models: Record<string, number> = {};
    let input = 0;
    let output = 0;
    for (const r of rows) {
      input += r.input + r.cache_read + r.cache_write;
      output += r.output;
      if (r.model) models[r.model] = (models[r.model] ?? 0) + r.input + r.output + r.cache_read + r.cache_write;
    }
    return {
      version: this.version,
      os: platform(),
      accounts: this.accounts().map((a) => ({
        provider: a.provider,
        label: a.label,
        ...(a.plan ? { plan: a.plan } : {}),
        loggedIn: a.loggedIn,
        active: a.active,
        ...(a.rateLimit?.fiveHour !== undefined ? { fiveHour: a.rateLimit.fiveHour } : {}),
        ...(a.rateLimit?.week !== undefined ? { week: a.rateLimit.week } : {}),
      })),
      week: { sessions: new Set(rows.map((r) => r.session_id)).size, input, output, models },
    };
  }

  /** A teammate's report; only the newest one is kept. */
  applyRemote(member: string, value: Record<string, unknown>, at: number): void {
    // A report is a few hundred bytes; anything far bigger is not one.
    const data = JSON.stringify(value);
    if (data.length > 20_000 || !Array.isArray(value.accounts)) return;
    this.db
      .query(
        "INSERT INTO team_seats (member, data, at) VALUES (?, ?, ?) ON CONFLICT(member) DO UPDATE SET data = excluded.data, at = excluded.at WHERE excluded.at > team_seats.at",
      )
      .run(member, data, at);
  }

  /** Every teammate's last report (the caller adds who they are and whether they are online). */
  reports(): { member: string; report: SeatReport; at: number }[] {
    return (
      this.db.query("SELECT member, data, at FROM team_seats").all() as { member: string; data: string; at: number }[]
    ).map((r) => ({ member: r.member, report: JSON.parse(r.data) as SeatReport, at: r.at }));
  }
}
