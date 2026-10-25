import { describe, expect, test } from "bun:test";
import { affectedBy } from "./blast";

const FILES: Record<string, string> = {
  "src/cart/total.ts": "export const total = 1;",
  "src/cart/index.ts": 'export * from "./total";',
  "src/pages/Checkout.tsx": 'import { total } from "../cart/total";',
  "src/pages/Cart.tsx": 'import { total } from "../cart";',
  "src/lazy.ts": 'const m = await import("./cart/total.ts");',
  "src/old.js": 'const t = require("./cart/total");',
  "src/cart/total.test.ts": 'import { total } from "./total";',
  "src/other.ts": 'import x from "react"; import { y } from "./util";',
  "README.md": 'import { total } from "./src/cart/total";',
};
const read = (p: string) => FILES[p];

describe("what else a change could break", () => {
  test("files importing a changed file, by any path form, tests first", () => {
    const out = affectedBy(Object.keys(FILES), ["src/cart/total.ts"], read);
    expect(out.map((a) => [a.path, a.test])).toEqual([
      ["src/cart/total.test.ts", true],
      ["src/cart/index.ts", false],
      ["src/lazy.ts", false],
      ["src/old.js", false],
      ["src/pages/Checkout.tsx", false],
    ]);
  });

  test("an index file is found by its folder's name", () => {
    expect(affectedBy(Object.keys(FILES), ["src/cart/index.ts"], read).map((a) => a.path)).toEqual([
      "src/pages/Cart.tsx",
    ]);
  });

  test("a change to a non-code file affects nothing here", () => {
    expect(affectedBy(Object.keys(FILES), ["README.md"], read)).toEqual([]);
  });
});
