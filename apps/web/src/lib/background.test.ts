import { describe, expect, test } from "bun:test";

import { runInBackground } from "./background";

describe("work kept outside the page", () => {
  test("the same work is not started twice while it runs, and its result outlives the click", async () => {
    let calls = 0;
    let finish: (v: string) => void = () => undefined;
    const work = () => {
      calls++;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const first = runInBackground("ports:s1", "Open ports", work);
    const second = runInBackground("ports:s1", "Open ports", work);
    expect(calls).toBe(1);
    finish("22/tcp open");
    expect(await first).toBe("22/tcp open");
    expect(await second).toBe("22/tcp open");
    // Done: a new click runs it again.
    const again = runInBackground("ports:s1", "Open ports", work);
    expect(calls).toBe(2);
    finish("80/tcp open");
    expect(await again).toBe("80/tcp open");
  });

  test("a failure reaches the caller", async () => {
    await expect(runInBackground("check:s1", "Check", () => Promise.reject(new Error("no route")))).rejects.toThrow(
      "no route",
    );
  });
});
