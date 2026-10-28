import { describe, expect, test } from "bun:test";
import { coalesce } from "./live";

describe("coalesced reloads (plan.md 19.10)", () => {
  test("a burst of calls is one run; calls while it runs make exactly one more", async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const trigger = coalesce(
      () =>
        new Promise<void>((resolve) => {
          runs++;
          release = resolve;
        }),
      10,
    );
    for (let i = 0; i < 20; i++) trigger();
    await Bun.sleep(30);
    expect(runs).toBe(1);
    // Five more while it runs: one more run after it, not five.
    for (let i = 0; i < 5; i++) trigger();
    await Bun.sleep(30);
    release();
    await Bun.sleep(5);
    expect(runs).toBe(2);
    release();
    await Bun.sleep(30);
    expect(runs).toBe(2);
  });
});
