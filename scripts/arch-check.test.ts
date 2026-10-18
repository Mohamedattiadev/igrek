import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { check, cycles, RULES, sourceFiles } from "./arch-check";
import { DRIFT_BASELINE, drift, OUT, render } from "./c4";

describe("architecture gate", () => {
  test("finds an import cycle and ignores what has none", () => {
    const edges = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set(["a"])],
      ["d", new Set(["a"])],
    ]);
    expect(cycles(edges)).toEqual([["a", "b", "c"]]);
    expect(cycles(new Map([["x", new Set(["y"])]]))).toEqual([]);
  });

  test("the web UI importing server code breaks a rule", () => {
    const broken = RULES.filter((r) => r.from.test("apps/web/src/pages/X.tsx") && r.to.test("apps/server/src/db.ts"));
    expect(broken.map((r) => r.name)).toEqual(["ui-not-into-server"]);
  });

  // The ratchet: God Eye itself has no layer violation and no cycle, and none may come in.
  test("God Eye keeps every rule", () => {
    const { violations, cycles: loops } = check(sourceFiles());
    expect(violations).toEqual([]);
    expect(loops).toEqual([]);
  });

  test("the C4 picture matches the code", () => {
    expect(readFileSync(OUT, "utf8")).toBe(render());
  });
});

describe("intended architecture", () => {
  test("no import goes against the server's layers beyond the known, explained ones", () => {
    const known = JSON.parse(readFileSync(DRIFT_BASELINE, "utf8")) as { edges: string[] };
    const now = drift();
    // New drift fails; fixed drift must leave the list, so it only shrinks.
    expect(now.filter((e) => !known.edges.includes(e))).toEqual([]);
    expect(known.edges.filter((e) => !now.includes(e))).toEqual([]);
  });
});
