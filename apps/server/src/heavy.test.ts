import { describe, expect, test } from "bun:test";
import { HeavyWork } from "./heavy";

describe("heavy background work (plan.md 19.10)", () => {
  test("one at a time, in order", async () => {
    const heavy = new HeavyWork(async () => undefined);
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await Bun.sleep(ms);
      log.push(`end ${name}`);
    };
    await Promise.all([heavy.run("a", job("a", 30)), heavy.run("b", job("b", 5)), heavy.run("c", job("c", 5))]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  test("waits while the person works, then runs", async () => {
    let now = 0;
    const waits: number[] = [];
    const heavy = new HeavyWork(
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      () => now,
    );
    heavy.active();
    expect(heavy.busy()).toBe(true);
    let ran = false;
    await heavy.run("summary", async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    // Twenty seconds of quiet, in two-second steps.
    expect(waits.length).toBe(10);
  });

  test("a failing job does not stop the ones after it", async () => {
    const heavy = new HeavyWork(async () => undefined);
    const first = heavy.run("bad", async () => {
      throw new Error("boom");
    });
    await expect(first).rejects.toThrow("boom");
    expect(await heavy.run("good", async () => 42)).toBe(42);
  });
});
