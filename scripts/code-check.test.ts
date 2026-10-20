import { describe, expect, test } from "bun:test";
import { check, duplicates, effectFindings, RULES, readBaseline, serverLeaks } from "./code-check";

describe("effects", () => {
  const find = (code: string) => effectFindings(["apps/web/x.tsx"], () => code);

  test("a timer or listener that is never stopped leaks", () => {
    expect(find("useEffect(() => { setInterval(tick, 1000); }, []);")).toEqual(["effectLeak:apps/web/x.tsx"]);
    expect(find("useEffect(() => { const t = setInterval(tick, 1000); return () => clearInterval(t); }, []);")).toEqual(
      [],
    );
    expect(find("useEffect(() => { window.addEventListener('resize', f); }, []);")).toEqual([
      "effectLeak:apps/web/x.tsx",
    ]);
  });

  test("a fetch for changing inputs needs a guard against older answers", () => {
    const racy = "useEffect(() => { api.get(id).then((r) => setData(r)); }, [id]);";
    const guarded =
      "useEffect(() => { let live = true; api.get(id).then((r) => live && setData(r)); return () => { live = false; }; }, [id]);";
    const once = "useEffect(() => { api.get().then((r) => setData(r)); }, []);";
    expect(find(racy)).toEqual(["effectRace:apps/web/x.tsx"]);
    expect(find(guarded)).toEqual([]);
    expect(find(once)).toEqual([]);
  });
});

describe("server timers", () => {
  test("a server module that starts a timer must stop it; index.ts may run timers for the process", () => {
    const files: Record<string, string> = {
      "apps/server/src/a.ts": "this.t = setInterval(tick, 1000);",
      "apps/server/src/b.ts": "this.t = setInterval(tick, 1000); stop() { clearInterval(this.t); }",
      "apps/server/src/index.ts": "setInterval(tick, 1000);",
      "apps/web/src/c.ts": "setInterval(tick, 1000);",
    };
    expect(serverLeaks(Object.keys(files), (f) => files[f] ?? "")).toEqual(["serverLeak:apps/server/src/a.ts"]);
  });
});

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
  // It reads the whole code base (about five seconds now), so it gets more than the default five.
  test("Igrek's code is no worse than its baseline", () => {
    expect(check()).toEqual({ worse: [], better: [] });
  }, 60_000);
});
