import { describe, expect, test } from "bun:test";
import type { Seat } from "@igrek/core";
import { seatAdvice } from "@igrek/core";

const now = 1_800_000_000_000;
const seat = (name: string, accounts: Partial<Seat["accounts"][number]>[], at = now - 60_000): Seat => ({
  memberId: name.toLowerCase(),
  name,
  at,
  accounts: accounts.map((a) => ({ provider: "claude", label: `${name}@x`, loggedIn: true, active: true, ...a })),
  week: { sessions: 3, input: 1, output: 1, models: {} },
});

describe("account suggestions", () => {
  test("someone at the weekly limit: a larger plan, and who has room on the same kind of account", () => {
    const advice = seatAdvice(
      [
        seat("Ayse", [{ week: 0.95, plan: "pro" }]),
        seat("Mehmet", [{ week: 0.1, plan: "pro" }]),
        seat("Can", [{ week: 0.3, plan: "pro" }]),
        seat("Deniz", [{ provider: "codex", week: 0 }]),
      ],
      now,
    );
    expect(advice).toEqual([
      { kind: "larger", member: "ayse", name: "Ayse", account: "Ayse@x", pct: 95, to: "Mehmet" },
    ]);
  });

  test("nobody with room: only the larger plan", () => {
    const advice = seatAdvice([seat("Ayse", [{ week: 0.92 }]), seat("Can", [{ week: 0.7 }])], now);
    expect(advice).toEqual([{ kind: "larger", member: "ayse", name: "Ayse", account: "Ayse@x", pct: 92 }]);
  });

  test("Max used little, no account at all; old reports and signed-out accounts say nothing", () => {
    const advice = seatAdvice(
      [
        seat("Ayse", [{ week: 0.05, plan: "max 20x" }]),
        seat("Bora", []),
        seat("Old", [{ week: 0.99 }], now - 5 * 86_400_000),
        seat("Out", [{ week: 0.99, loggedIn: false }]),
        seat("Busy", [{ week: 0.5, plan: "max" }]),
      ],
      now,
    );
    expect(advice).toEqual([
      { kind: "smaller", member: "ayse", name: "Ayse", account: "Ayse@x", plan: "max 20x", pct: 5 },
      { kind: "noAccount", member: "bora", name: "Bora" },
    ]);
  });
});
