import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_TESTERS, DEFAULT_SETTINGS, summarizeRun, type TesterSession } from "@godeye/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { Store } from "./store";
import { checkTarget, describeAction, parseReport, Testers } from "./testers";

describe("test users", () => {
  test("only http(s) addresses; local ones are recognised", () => {
    expect(checkTarget("http://localhost:3000/x").local).toBe(true);
    expect(checkTarget("http://192.168.1.5").local).toBe(true);
    expect(checkTarget("https://example.com").local).toBe(false);
    expect(() => checkTarget("file:///etc/passwd")).toThrow();
    expect(() => checkTarget("javascript:alert(1)")).toThrow();
  });

  test("the report at the end of the last message is read and checked", () => {
    const report = parseReport(
      'Done.\n<report>{"outcome":"gave-up","ease":14,"stuckAt":["menu"],"complaints":["Too small"],"issues":[{"title":"Tiny button","where":"header","severity":"bad","owner":"x"}],"quote":"I give up"}</report>',
    );
    expect(report).toMatchObject({ outcome: "gave-up", ease: 10, stuckAt: ["menu"], quote: "I give up" });
    expect(report.issues).toEqual([{ title: "Tiny button", where: "header", severity: "minor", owner: "uiux" }]);
    expect(() => parseReport("no report here")).toThrow();
  });

  test("actions read like what the person did", () => {
    expect(describeAction("mcp__browser__browser_click", { element: "Save button", ref: "e3" })).toBe(
      "click: Save button",
    );
    expect(describeAction("mcp__browser__browser_type", { element: "Name", text: "Ayşe" })).toBe('type: Name "Ayşe"');
    expect(describeAction("mcp__browser__browser_press_key", { key: "Tab" })).toBe("press_key: Tab");
  });

  test("the aunt score counts people with little tech experience", () => {
    const s = (profileId: string, ease: number, outcome: TesterSession["outcome"]): TesterSession => ({
      profileId,
      copy: 1,
      status: "done",
      outcome,
      ease,
      steps: [],
      screenshots: [],
      complaints: ["Text too small"],
    });
    const summary = summarizeRun(
      [s("aunt", 4, "struggled"), s("uncle", 2, "gave-up"), s("power-user", 9, "success")],
      BUILTIN_TESTERS,
    );
    expect(summary.aunt).toBe(30);
    expect(summary.success).toBeCloseTo(1 / 3);
    expect(summary.complaints).toEqual([{ text: "Text too small", count: 3 }]);
  });

  test("each person gets their own browser set-up and only safe tools", async () => {
    const { sqlite } = openDb(":memory:");
    const calls: { mcp: { mcpServers: { browser: { args: string[] } } }; allowed: string[]; system: string }[] = [];
    const testers = new Testers(
      sqlite,
      new Store(sqlite),
      new Bus(),
      new StopRegistry(),
      () => DEFAULT_SETTINGS,
      mkdtempSync(join(tmpdir(), "godeye-testers-")),
      tmpdir(),
      async ({ mcpConfig, allowed, system, onStep }) => {
        calls.push({ mcp: JSON.parse(mcpConfig), allowed, system });
        onStep({ at: Date.now(), thought: "Where is the button?" });
        return '<report>{"outcome":"success","ease":7,"complaints":[],"issues":[],"quote":"Fine"}</report>';
      },
      () => ({ browser: "/usr/bin/chromium", runtime: "node", mcp: "/x/cli.js" }),
    );
    expect(() => testers.start({ url: "http://localhost:3000", task: "x", profileIds: ["aunt"] })).toThrow();
    const run = testers.start({
      url: "http://localhost:3000",
      task: "Add a product",
      profileIds: ["screen-reader", "color-blind", "slow-phone", "nobody"],
      parallel: 2,
    });
    expect(run.sessions.map((s) => s.profileId)).toEqual(["screen-reader", "color-blind", "slow-phone"]);
    for (let i = 0; i < 100 && testers.get(run.id)?.status === "running"; i++) await Bun.sleep(5);
    const done = testers.get(run.id);
    expect(done?.status).toBe("done");
    expect(done?.sessions.every((s) => s.outcome === "success" && s.steps.length === 1)).toBe(true);

    const by = (word: string) => calls.find((c) => c.system.includes(word));
    const reader = by("screen reader");
    expect(reader?.allowed).not.toContain("browser_click");
    expect(reader?.allowed).toContain("browser_press_key");
    for (const c of calls) {
      expect(c.allowed).not.toContain("browser_run_code_unsafe");
      expect(c.allowed).not.toContain("browser_evaluate");
      const args = c.mcp.mcpServers.browser.args;
      expect(args).toContain("--isolated");
      expect(args[args.indexOf("--allowed-origins") + 1]).toBe("http://localhost:3000");
    }
    const cvd = by("colour blindness")?.mcp.mcpServers.browser.args ?? [];
    expect(cvd).toContain("--init-script");
    expect(cvd).toContain("vision");
    const slow = by("connection are slow")?.mcp.mcpServers.browser.args ?? [];
    expect(slow).toContain("--init-page");
    expect(slow[slow.indexOf("--device") + 1]).toBe("Pixel 7");

    const again = testers.repeat(run.id);
    expect(again.previousId).toBe(run.id);
  });
});

describe("test users without a report", () => {
  test("the report is written from the think-aloud log", async () => {
    const { sqlite } = openDb(":memory:");
    let asked = "";
    const testers = new Testers(
      sqlite,
      new Store(sqlite),
      new Bus(),
      new StopRegistry(),
      () => DEFAULT_SETTINGS,
      mkdtempSync(join(tmpdir(), "godeye-testers-")),
      tmpdir(),
      async ({ onStep }) => {
        onStep({ at: 1, thought: "I cannot find the save button" });
        onStep({ at: 2, action: "click: Save" });
        return "I saved it in the end, but it was hard.";
      },
      () => ({ browser: "/usr/bin/chromium", runtime: "node", mcp: "/x/cli.js" }),
      async (prompt) => {
        asked = prompt;
        return '<report>{"outcome":"struggled","ease":4,"complaints":["Save was hidden"],"issues":[],"quote":"Hard"}</report>';
      },
    );
    const run = testers.start({ url: "http://localhost:3000", task: "Save a note", profileIds: ["aunt"] });
    for (let i = 0; i < 100 && testers.get(run.id)?.status === "running"; i++) await Bun.sleep(5);
    expect(testers.get(run.id)?.sessions[0]).toMatchObject({ status: "done", outcome: "struggled", ease: 4 });
    expect(asked).toContain("THOUGHT: I cannot find the save button");
    expect(asked).toContain("I saved it in the end");
  });
});
