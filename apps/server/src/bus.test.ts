import { expect, test } from "bun:test";
import { StopRegistry } from "./bus";

test("the stop registry says how many things run after every change, once each", async () => {
  const stops = new StopRegistry();
  const seen: number[] = [];
  stops.onChange = (count) => seen.push(count);
  const offA = stops.register("a", { label: "a", stop: () => undefined });
  stops.register("b", { label: "b", stop: () => undefined });
  offA();
  // A second "off" (a process that ends after it was stopped) changes nothing and says nothing.
  offA();
  expect(stops.count()).toBe(1);
  await stops.stopAll();
  expect(seen).toEqual([1, 2, 1, 0]);
  expect(stops.count()).toBe(0);
});
