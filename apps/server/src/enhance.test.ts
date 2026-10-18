import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { detectIntent, isWeakPrompt, promptWeakness, renderEnhanced } from "@godeye/core";
import { StopRegistry } from "./bus";
import { migrate } from "./db";
import { Enhancer, parseEnhanceReply, sizeOf } from "./enhance";
import { Store } from "./store";

describe("weak prompt detection", () => {
  test("lazy requests are weak, specific ones are not", () => {
    for (const lazy of ["doğrusunu yap", "login bozuk düzelt", "fix it", "bunu hallet", "bak şuna"])
      expect(isWeakPrompt(lazy)).toBe(true);
    for (const clear of [
      "In apps/web/src/pages/Team.tsx the invite dialog doesn't reset its form after closing; reset it in close()",
      "/compact",
      "rename getUser() to fetchUser() everywhere in src/api.ts and update the callers",
    ])
      expect(isWeakPrompt(clear)).toBe(false);
    expect(promptWeakness("")).toBe(0);
  });

  test("intent comes from TR and EN words", () => {
    expect(detectIntent("login bozuk düzelt")).toBe("fix");
    expect(detectIntent("bu fonksiyonu açıkla")).toBe("explain");
    expect(detectIntent("add dark mode")).toBe("add");
    expect(detectIntent("şu dosyayı toparla")).toBe("refactor");
    expect(detectIntent("hmm")).toBe("other");
    expect(sizeOf("tüm projeyi sıfırdan yaz", "add")).toBe("large");
  });
});

describe("model reply", () => {
  test("reads parts, questions, and rejects junk", () => {
    const parts = parseEnhanceReply(
      'Sure! {"goal":"Fix login","context":["Decision: cookie stays HttpOnly"],"constraints":[],"done":["Tests pass"],"assumptions":["web only"],"size":"small","explanation":"Ekledim"}',
    );
    expect(parts?.parts?.goal).toBe("Fix login");
    expect(parts?.size).toBe("small");
    const questions = parseEnhanceReply(
      '{"questions":[{"question":"Hangi login?","options":["Web","Mobil"]},{"question":"bad","options":["one"]}]}',
    );
    expect(questions?.questions).toEqual([{ question: "Hangi login?", options: ["Web", "Mobil"] }]);
    expect(parseEnhanceReply("no json here")).toBeUndefined();
    expect(parseEnhanceReply('{"goal":""}')).toBeUndefined();
  });

  test("render skips empty sections and dropped assumptions", () => {
    const text = renderEnhanced(
      { goal: "Fix login", context: ["a"], constraints: [], done: ["b"], assumptions: ["x", "y"] },
      [0],
    );
    expect(text).toContain("## Goal\nFix login");
    expect(text).not.toContain("## Constraints");
    expect(text).toContain("- y");
    expect(text).not.toContain("- x");
  });
});

describe("enhancer", () => {
  const db = new Database(":memory:");
  migrate(db);
  const store = new Store(db);
  db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Demo', '/nonexistent/demo', 0)").run();
  db.query(
    "INSERT INTO memory_items (id, project_id, section, text, created_at) VALUES ('m1', 'p1', 'decision', 'Session cookie stays HttpOnly; token sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123', 1)",
  ).run();
  db.query(
    "INSERT INTO memory_items (id, project_id, section, text, created_at) VALUES ('m2', 'p1', 'failed', 'localStorage tokens were tried and dropped', 2)",
  ).run();
  const enhancer = new Enhancer(
    db,
    store,
    new StopRegistry(),
    () => ({ language: "tr", enhanceLanguage: "en" }) as never,
    "/tmp",
    () => [{ userId: "u2", name: "Kerim", projectId: "p1", files: ["src/auth.ts"], overlap: ["src/auth.ts"], at: 0 }],
  );

  test("gathers only real facts, scrubbed, and honours exclusions", () => {
    const all = enhancer.gather({
      text: "login bozuk",
      projectId: "p1",
      file: { path: "/nonexistent/demo/src/auth.ts", startLine: 10, endLine: 20, selection: "const x = 1" },
    });
    expect(all.map((g) => g.kind)).toEqual(["memory", "file", "team"]);
    expect(all[0]?.lines.join()).not.toContain("sk-ant-api03");
    expect(all[1]?.label).toBe("auth.ts:10-20");
    expect(all[2]?.lines[0]).toContain("Kerim");
    expect(enhancer.gather({ text: "x", projectId: "p1", exclude: ["memory", "team"] }).map((g) => g.kind)).toEqual([]);
  });

  test("template mode works without AI and is logged", async () => {
    const result = await enhancer.enhance({ text: "login bozuk düzelt", projectId: "p1", template: true });
    expect(result.mode).toBe("template");
    expect(result.intent).toBe("fix");
    expect(result.parts?.goal).toBe("login bozuk düzelt");
    expect(result.parts?.context.some((c) => c.includes("HttpOnly"))).toBe(true);
    expect(result.parts?.done.length).toBeGreaterThan(0);
    expect(result.parts?.assumptions).toEqual([]);
    enhancer.record(result.id, "enhanced", "final text");
    expect(db.query("SELECT choice, final FROM enhancements WHERE id = ?").get(result.id)).toEqual({
      choice: "enhanced",
      final: "final text",
    });
  });
});

describe("persona prompts", () => {
  test("the persona's checklist joins the done-when items", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const e = new Enhancer(
      db,
      new Store(db),
      new StopRegistry(),
      () => ({ language: "en" }) as never,
      "/tmp",
      () => [],
      () => undefined,
      (id) =>
        id === "security"
          ? { name: "Security expert", checklist: ["No secrets in logs", "Inputs validated on the server"] }
          : undefined,
    );
    const plain = await e.enhance({ text: "add a login form", template: true });
    const secure = await e.enhance({ text: "add a login form", template: true, personaId: "security" });
    expect(secure.parts?.done).toEqual([
      ...(plain.parts?.done ?? []),
      "No secrets in logs",
      "Inputs validated on the server",
    ]);
  });
});

describe("shortcuts and stats", () => {
  test("shorthands expand as whole words only", async () => {
    const { expandShortcuts } = await import("@godeye/core");
    expect(expandShortcuts("login bozuk dyy", { dyy: "doğrusunu yap" })).toBe("login bozuk doğrusunu yap");
    expect(expandShortcuts("dyyx kalsın", { dyy: "doğrusunu yap" })).toBe("dyyx kalsın");
    expect(expandShortcuts("DYY, lütfen", { dyy: "doğrusunu yap" })).toBe("doğrusunu yap, lütfen");
  });

  test("stats count only what was sent and suggest repeated shorthands", () => {
    const db = new Database(":memory:");
    migrate(db);
    const e = new Enhancer(
      db,
      new Store(db),
      new StopRegistry(),
      () => ({ language: "tr", enhanceShortcuts: {} }) as never,
      "/tmp",
    );
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      db.query(
        "INSERT INTO enhancements (id, at, intent, mode, original, choice) VALUES (?, ?, 'fix', 'ai', 'login dyy', 'enhanced')",
      ).run(`a${i}`, now - i);
      db.query(
        "INSERT INTO enhancements (id, at, intent, mode, original, choice) VALUES (?, ?, 'fix', 'template', 'login dyy', 'pending')",
      ).run(`b${i}`, now - i);
    }
    const s = e.stats(now + 1);
    expect(s.week.total).toBe(3);
    expect(s.suggestions).toContain("dyy");
    expect(s.missing[0]?.count).toBe(3);
  });
});

describe("prompt coach", () => {
  test("concrete tips for what is missing; none for a clear prompt", async () => {
    const { coachPrompt } = await import("@godeye/core");
    expect(coachPrompt("bunu düzelt")).toEqual(["which", "error", "done"]);
    expect(coachPrompt("fix the login page")).toEqual(["error", "where", "done"]);
    expect(
      coachPrompt(
        "Fix `login()` in src/auth.ts: TypeError when the password is empty; the test in auth.test.ts should pass",
      ),
    ).toEqual([]);
    expect(coachPrompt("refactor src/db.ts")).toEqual(["keep"]);
    expect(coachPrompt("deploy the latest version")).toContain("env");
    expect(coachPrompt("/compact")).toEqual([]);
  });
});
