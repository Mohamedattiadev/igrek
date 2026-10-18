import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { designFindings } from "./design";
import { takeSnapshot } from "./snapshot";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "gd-design-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("design patterns and SOLID", () => {
  const cases = Array.from({ length: 9 }, (_, i) => `case "k${i}": return ${i};`).join("\n");
  const root = project({
    "src/a.ts": "class A { private static instance: A; static getInstance() { return A.instance; } }",
    "src/b.ts": "class B { private static instance: B; }",
    "src/c.ts": "class C { private static instance: C; }",
    "src/pay.ts": "interface PaymentStrategy { pay(): void }\nclass Card implements PaymentStrategy { pay() {} }",
    "src/kind.ts": `function f(item) {\n  switch (item.kind) {\n${cases}\n  }\n}`,
    "src/bird.ts": 'class Penguin extends Bird {\n  fly() { throw new Error("not supported"); }\n}',
    "src/orders.ts": "class Orders {\n  constructor() {\n    this.repo = new OrderRepository();\n  }\n}",
    "src/huge.ts": `class Huge {\n${"  x = 1;\n".repeat(650)}}`,
  });
  const found = designFindings(takeSnapshot(root));

  test("each rule is found where it applies", () => {
    const rules = found.map((f) => f.rule);
    expect(rules.filter((r) => r === "singleton")).toHaveLength(3);
    expect(found.find((f) => f.rule === "singleImplementation")?.detail).toBe("PaymentStrategy");
    expect(found.find((f) => f.rule === "bigSwitch")).toMatchObject({ file: "src/kind.ts", detail: "9" });
    expect(found.find((f) => f.rule === "refusedBequest")?.file).toBe("src/bird.ts");
    expect(found.find((f) => f.rule === "hardDependency")?.detail).toBe("OrderRepository");
    expect(found.find((f) => f.rule === "godClass")?.detail).toContain("Huge");
  });

  test("an abstract method that raises is a base class, not a refusal", () => {
    const base = project({
      "m.py": "class Model(Base):\n    @abstractmethod\n    def analyze(self):\n        raise NotImplementedError\n",
    });
    expect(designFindings(takeSnapshot(base))).toEqual([]);
  });

  test("one or two Singletons are fine", () => {
    const few = designFindings(takeSnapshot(project({ "src/a.ts": "class A { private static instance: A; }" })));
    expect(few).toEqual([]);
  });
});
