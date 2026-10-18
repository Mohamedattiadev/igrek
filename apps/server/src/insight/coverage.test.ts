import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { coverageMap, parseLcov } from "./coverage";
import { takeSnapshot } from "./snapshot";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "igrek-cov-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("test coverage map", () => {
  test("a file is tested when a test imports it or is named after it", () => {
    const root = project({
      "src/lib/math.ts": "export const add = (a: number, b: number) => a + b;\n",
      "src/lib/math.test.ts": 'import { add } from "./math";\n',
      "src/api/users.ts": "export const users = [];\n",
      "src/api/__tests__/users.test.ts": "test('x', () => {});\n",
      "src/ui/big.tsx": "export const Big = () => null;\n".repeat(30),
      "app/models.py": "class User: pass\n",
      "tests/test_models.py": "from app.models import User\n",
    });
    const map = coverageMap(takeSnapshot(root));
    expect(map.source).toBe("static");
    expect(map.files).toBe(4);
    expect(map.tested).toBe(3);
    expect(map.untested.map((f) => f.path)).toEqual(["src/ui/big.tsx"]);
    expect(map.folders.find((f) => f.path === "src/lib")).toMatchObject({ files: 1, tested: 1 });
  });

  test("the project's own lcov report wins and gives line coverage", () => {
    const root = project({
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
      "coverage/lcov.info": "TN:\nSF:src/a.ts\nLF:10\nLH:8\nend_of_record\n",
    });
    const map = coverageMap(takeSnapshot(root));
    expect(map.source).toBe("report");
    expect(map.report).toBe("coverage/lcov.info");
    expect(map.tested).toBe(1);
    // b.ts was never loaded: all of its lines count as uncovered (8 of 10 + 2).
    expect(map.percent).toBe(67);
    expect(parseLcov(`SF:${root}/src/a.ts\nLF:4\nLH:1\nend_of_record\n`, root).get("src/a.ts")).toEqual({
      lines: 4,
      covered: 1,
    });
  });
});
