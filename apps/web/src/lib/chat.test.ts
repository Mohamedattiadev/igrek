import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@godeye/core";
import { applyChanges } from "./chat";

const text = (id: string, value: string) => ({ kind: "text", id, at: 1, text: value }) as ChatEvent;

describe("applyChanges", () => {
  test("replaces known events in place, appends new ones and keeps the old list untouched", () => {
    const list = [text("a", "1"), text("b", "2")];
    const next = applyChanges(list, [
      { op: "upsert", event: text("b", "22") },
      { op: "upsert", event: text("c", "3") },
      { op: "upsert", event: text("c", "33") },
    ]);
    expect(next.map((e) => (e as { text: string }).text)).toEqual(["1", "22", "33"]);
    expect(list.map((e) => (e as { text: string }).text)).toEqual(["1", "2"]);
  });

  test("a batch with only status changes keeps the same list", () => {
    const list = [text("a", "1")];
    expect(applyChanges(list, [])).toBe(list);
  });
});
