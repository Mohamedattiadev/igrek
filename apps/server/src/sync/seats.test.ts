import { describe, expect, test } from "bun:test";
import type { Account } from "@igrek/core";
import { openDb } from "../db";
import { Seats } from "./seats";

const account = (over: Partial<Account>): Account => ({
  id: "a1",
  provider: "claude",
  label: "Work",
  configDir: "/home/me/.claude",
  isDefault: true,
  email: "me@example.com",
  plan: "Max",
  loggedIn: true,
  active: true,
  ...over,
});

describe("the Company page's reports", () => {
  test("this computer reports its accounts, limits and week, never an email address", () => {
    const { sqlite } = openDb(":memory:");
    const now = Date.now();
    const usage = sqlite.query(
      "INSERT INTO usage (session_id, ts, model, input, output, cache_read, cache_write) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    usage.run("s1", now - 3_600_000, "claude-opus-5-5", 100, 50, 1000, 10);
    usage.run("s1", now - 1_800_000, "claude-opus-5-5", 20, 10, 0, 0);
    usage.run("s2", now - 86_400_000, "claude-haiku-5-5", 5, 5, 0, 0);
    usage.run("old", now - 10 * 86_400_000, "claude-opus-5-5", 9999, 9999, 0, 0);
    const seats = new Seats(sqlite, () => [account({ rateLimit: { fiveHour: 0.93, week: 0.4, at: now } })], "0.1.8");
    const mine = seats.mine(now);
    expect(mine.accounts).toEqual([
      { provider: "claude", label: "Work", plan: "Max", loggedIn: true, active: true, fiveHour: 0.93, week: 0.4 },
    ]);
    expect(JSON.stringify(mine)).not.toContain("example.com");
    expect(mine.week).toEqual({
      sessions: 2,
      input: 100 + 1000 + 10 + 20 + 5,
      output: 50 + 10 + 5,
      models: { "claude-opus-5-5": 1160 + 30, "claude-haiku-5-5": 10 },
    });
    expect(mine.version).toBe("0.1.8");
  });

  test("a teammate's newest report is kept; an older one arriving late and a malformed one are not", () => {
    const { sqlite } = openDb(":memory:");
    const seats = new Seats(sqlite, () => [], "0.1.8");
    const report = (sessions: number) => ({ accounts: [], week: { sessions, input: 0, output: 0, models: {} } });
    seats.applyRemote("kerim", report(3), 200);
    seats.applyRemote("kerim", report(1), 100);
    seats.applyRemote("kerim", { accounts: "nope" }, 300);
    seats.applyRemote("kerim", { accounts: [], filler: "x".repeat(30_000) }, 400);
    expect(seats.reports()).toEqual([{ member: "kerim", report: report(3), at: 200 }]);
  });
});
