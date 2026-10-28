import { describe, expect, test } from "bun:test";
import type { Seat } from "@igrek/core";
import { Budgets, overBudget, weekOf } from "./budgets";
import { Bus } from "./bus";
import { openDb } from "./db";

const seat = (id: string, week: number, tokens: number): Seat => ({
  memberId: id,
  name: id,
  at: 1,
  accounts: [{ provider: "claude", label: "Main", loggedIn: true, active: true, week }],
  week: { sessions: 3, input: tokens, output: 0, models: {} },
});

describe("budgets per person", () => {
  test("past a share of the weekly limit or a number of tokens, a person is over; under both, not", () => {
    expect(overBudget(seat("k", 0.92, 10), { weekPct: 80 })).toEqual({ weekPct: 92 });
    expect(overBudget(seat("k", 0.5, 2_000_000), { weekPct: 80, weekTokens: 1_000_000 })).toEqual({
      tokens: 2_000_000,
    });
    expect(overBudget(seat("k", 0.5, 10), { weekPct: 80, weekTokens: 1_000_000 })).toBeUndefined();
  });

  test("the admin gets one notice a week per person over budget; a budget of nothing is removed", () => {
    const { sqlite } = openDb(":memory:");
    const bus = new Bus();
    const notices: string[] = [];
    bus.subscribe((m) => m.type === "alert" && notices.push(`${m.kind}:${m.title}`));
    const budgets = new Budgets(sqlite, bus);
    budgets.set("kerim", { weekPct: 80 });
    budgets.set("ayse", { weekTokens: 5 });
    const monday = Date.UTC(2026, 9, 26, 9);
    budgets.check([seat("kerim", 0.9, 0), seat("ayse", 0.1, 1)], monday);
    budgets.check([seat("kerim", 0.95, 0)], monday + 3_600_000);
    expect(notices).toEqual(["budget:kerim"]);
    budgets.check([seat("kerim", 0.95, 0)], monday + 7 * 86_400_000);
    expect(notices).toHaveLength(2);
    budgets.set("kerim", {});
    expect(budgets.all()).toEqual({ ayse: { weekTokens: 5 } });
  });

  test("weeks are ISO weeks", () => {
    expect(weekOf(Date.UTC(2026, 9, 28))).toBe("2026-W44");
    expect(weekOf(Date.UTC(2027, 0, 1))).toBe("2026-W53");
  });
});
