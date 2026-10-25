import { describe, expect, test } from "bun:test";
import { ExtensionPairing } from "./extension-pair";

describe("pairing the extension without copying a key", () => {
  test("a key only after the user allows it, handed over once", () => {
    let made = 0;
    const pairing = new ExtensionPairing({ pair: () => `key-${++made}-xxxxxxxxxxxxxxxxxxxx` });
    const r = pairing.ask(1000);
    expect(r?.code).toMatch(/^\d{6}$/);
    expect(pairing.poll(r?.id ?? "", 1000)).toEqual({ status: "waiting" });
    expect(pairing.waiting(1000)).toHaveLength(1);
    expect(pairing.decide(r?.id ?? "", true)).toBe(true);
    expect(pairing.poll(r?.id ?? "", 1000)).toEqual({ status: "allowed", key: "key-1-xxxxxxxxxxxxxxxxxxxx" });
    expect(pairing.poll(r?.id ?? "", 1000)).toEqual({ status: "gone" });
    expect(made).toBe(1);
  });

  test("denied gets no key; old and too many requests are dropped", () => {
    const pairing = new ExtensionPairing({ pair: () => "never" });
    const r = pairing.ask(0);
    pairing.decide(r?.id ?? "", false);
    expect(pairing.poll(r?.id ?? "", 0)).toEqual({ status: "denied" });
    for (let i = 0; i < 3; i++) pairing.ask(10);
    expect(pairing.ask(10)).toBeUndefined();
    expect(pairing.waiting(10 + 5 * 60_000 + 1)).toEqual([]);
  });
});
