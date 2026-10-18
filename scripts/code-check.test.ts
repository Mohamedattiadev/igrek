import { describe, expect, test } from "bun:test";
import { check, duplicates, RULES, readBaseline } from "./code-check";

describe("code quality gate", () => {
  const block = Array.from({ length: 14 }, (_, i) => `const value${i} = compute(${i}) + offset;`).join("\n");

  test("a block copied into a second file is found in both places", () => {
    const files: Record<string, string> = { "a.ts": `${block}\nexport const a = 1;`, "b.ts": `let x = 2;\n${block}` };
    expect(duplicates(["a.ts", "b.ts"], (f) => files[f] ?? "").sort()).toEqual(["a.ts", "b.ts"]);
  });

  test("lists of names and braces are not copies", () => {
    const names = Array.from({ length: 20 }, (_, i) => `  Name${i},`).join("\n");
    const files: Record<string, string> = {
      "a.ts": `import {\n${names}\n} from "x";`,
      "b.ts": `const m = {\n${names}\n};`,
    };
    expect(duplicates(["a.ts", "b.ts"], (f) => files[f] ?? "")).toEqual([]);
  });

  test("every known finding has a written reason", () => {
    const base = readBaseline();
    for (const key of Object.keys(base.counts)) {
      const rule = key.split(":")[0] ?? "";
      expect(RULES[rule]).toBeDefined();
      expect(base.reasons[rule]?.length ?? 0).toBeGreaterThan(20);
    }
  });

  // The ratchet: no rule may count higher in any file, and a lower count must be written down.
  test("God Eye's code is no worse than its baseline", () => {
    expect(check()).toEqual({ worse: [], better: [] });
  });
});
