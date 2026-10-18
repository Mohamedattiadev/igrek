import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, words } from "@godeye/learn";
import { loadContent } from "@godeye/learn/load";
import { migrate } from "./db";
import { detectTechs, Learn, searchContent, stageChecks, texts } from "./learn";

describe("learning center content", () => {
  test("every cheatsheet and roadmap is valid, in both languages, with sources", () => {
    const content = loadContent();
    expect(content.errors).toEqual([]);
    expect(content.sheets.some((s) => s.id === "git")).toBe(true);
  });

  test("search finds items by English, Turkish and folded Turkish words", () => {
    const content = loadContent();
    expect(searchContent(content, "undo last commit")[0]).toMatchObject({ sheet: "git" });
    expect(searchContent(content, "dal oluştur").some((h) => h.id === "switch")).toBe(true);
    expect(searchContent(content, "dal olustur").some((h) => h.id === "switch")).toBe(true);
    expect(searchContent(content, "git stas")[0]).toMatchObject({ id: "stash" });
    expect(searchContent(content, "")).toEqual([]);
    // Turkish endings: "commiti", "almak" still find "Son commit'i düzeltme" / "geri al" items.
    expect(searchContent(content, "son commiti geri almak").length).toBeGreaterThan(0);
    expect(searchContent(content, "dalları listelemek").some((h) => h.sheet === "git")).toBe(true);
  });

  test("words and versions", () => {
    expect(words("Nasıl İşaretlerim? node.js")).toEqual(["nasil", "isaretlerim", "node.js"]);
    expect(compareVersions("18.3.1", "19")).toBeLessThan(0);
    expect(compareVersions("^19.2.0", "19.2")).toBe(0);
  });
});

describe("what a project uses", () => {
  test("installed npm versions win over the range in package.json; go.mod and requirements are read", () => {
    const root = mkdtempSync(join(tmpdir(), "learn-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    mkdirSync(join(root, "node_modules", "react"), { recursive: true });
    writeFileSync(join(root, "node_modules", "react", "package.json"), JSON.stringify({ version: "19.2.1" }));
    mkdirSync(join(root, "api"));
    writeFileSync(join(root, "api", "requirements.txt"), "Django==5.2.1\n# comment\nfastapi>=0.115\n");
    mkdirSync(join(root, "svc"));
    writeFileSync(join(root, "svc", "go.mod"), "module x\n\ngo 1.25.1\n");
    const sheets = [
      { id: "react", detect: { npm: ["react"] } },
      { id: "django", detect: { pip: ["django"] } },
      { id: "fastapi", detect: { pip: ["fastapi"] } },
      { id: "go", detect: { files: ["go.mod"] } },
      { id: "rust", detect: { files: ["Cargo.toml"] } },
    ];
    const found = detectTechs(root, sheets);
    expect(found).toContainEqual({ id: "react", version: "19.2.1", from: "npm:react" });
    expect(found).toContainEqual({ id: "django", version: "5.2.1", from: "pip:django" });
    expect(found).toContainEqual({ id: "fastapi", version: "0.115", from: "pip:fastapi" });
    expect(found).toContainEqual({ id: "go", version: "1.25.1", from: "go.mod" });
    expect(found.some((t) => t.id === "rust")).toBe(false);
  });

  test("stages are judged from scores, deploys and monitors; unknown stays unknown", () => {
    const checks = stageChecks("p1", {
      commits: 4,
      scores: { testing: 82, security: 55 },
      apis: 0,
      hasTests: true,
      packaged: true,
      environments: 0,
      deploys: 0,
      monitors: 1,
      errorTracking: false,
    });
    const by = Object.fromEntries(checks.map((c) => [c.stage, c]));
    expect(by.testing?.state).toBe("done");
    expect(by.security).toMatchObject({
      state: "missing",
      reason: "score:55",
      link: "/p/p1?tab=sections&cat=security",
    });
    expect(by.performance?.state).toBe("unknown");
    expect(by.deploy?.state).toBe("missing");
    expect(by.monitoring?.state).toBe("done");
    expect(by["data-api"]?.state).toBe("unknown");
  });
});

describe("the user's marks, newer versions and translations", () => {
  const db = new Database(":memory:");
  migrate(db);

  test("code the AI wrote is compared with the installed version", () => {
    const root = mkdtempSync(join(tmpdir(), "godeye-apiver-"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { react: "^18.2.0" } }));
    mkdirSync(join(root, "node_modules/react"), { recursive: true });
    writeFileSync(join(root, "node_modules/react/package.json"), JSON.stringify({ version: "18.3.1" }));
    const app = join(root, "App.jsx");
    writeFileSync(app, 'import { useState } from "react";\nconst [s, act] = useActionState(save, null);\n');
    const notes = join(root, "NOTES.md");
    writeFileSync(notes, "useOptimistic( is nice");
    const learn = new Learn(db, async () => "");
    expect(learn.apiCheck(root, [app, notes, join(root, "gone.js")])).toEqual([
      expect.objectContaining({ file: app, line: 2, sheet: "react", item: "use-action-state", installed: "18.3.1" }),
    ]);
    writeFileSync(join(root, "node_modules/react/package.json"), JSON.stringify({ version: "19.2.0" }));
    expect(learn.apiCheck(root, [app])).toEqual([]);
  });

  test("favorites, notes, reports and done steps", () => {
    const learn = new Learn(db, async () => "");
    learn.mark("favorite", "git/stash", true);
    learn.mark("note", "git/stash", "use -u for new files");
    learn.mark("report", "git/reflog", "the 30 days are 90 for reachable entries");
    learn.mark("done", "react/setup", true);
    let state = learn.mark("favorite", "git/rebase", true);
    expect(state.favorites).toEqual(["git/stash", "git/rebase"]);
    expect(state.notes["git/stash"]).toBe("use -u for new files");
    expect(state.reports[0]).toMatchObject({ key: "git/reflog" });
    expect(state.done).toEqual(["react/setup"]);
    state = learn.mark("favorite", "git/stash", false);
    expect(state.favorites).toEqual(["git/rebase"]);
    expect(() => learn.mark("note", "../etc", "x")).toThrow();
  });

  test("a newer major version marks the sheet as behind", async () => {
    const dir = mkdtempSync(join(tmpdir(), "learn-content-"));
    mkdirSync(join(dir, "sheets"));
    const sheet = (
      await Bun.file(join(import.meta.dir, "../../../packages/learn/content/sheets/git.yaml")).text()
    ).replace('version: "2.55"', 'version: "2.55"\nlatest: eol:git');
    writeFileSync(join(dir, "sheets", "git.yaml"), sheet);
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return Response.json({ result: { latest: { name: "3.0.1" } } });
    }) as unknown as typeof fetch;
    const learn = new Learn(db, async () => "", fetcher, dir);
    const latest = await learn.checkLatest(true);
    expect(asked).toEqual(["https://endoflife.date/api/v1/products/git/releases/latest"]);
    expect(latest).toEqual([{ sheet: "git", latest: "3.0.1", behind: true, at: expect.any(Number) }]);
  });

  test("PyPI packages are asked on PyPI", async () => {
    const dir = mkdtempSync(join(tmpdir(), "learn-content-"));
    mkdirSync(join(dir, "sheets"));
    writeFileSync(
      join(dir, "sheets", "flask.yaml"),
      await Bun.file(join(import.meta.dir, "../../../packages/learn/content/sheets/flask.yaml")).text(),
    );
    const asked: string[] = [];
    const fetcher = (async (url: string) => {
      asked.push(url);
      return Response.json({ info: { version: "4.0.0" } });
    }) as unknown as typeof fetch;
    const latest = await new Learn(db, async () => "", fetcher, dir).checkLatest(true);
    expect(asked).toEqual(["https://pypi.org/pypi/flask/json"]);
    expect(latest[0]).toMatchObject({ sheet: "flask", latest: "4.0.0", behind: true });
  });

  test("other languages are translated once and cached; code is left to the model's care", async () => {
    let calls = 0;
    const learn = new Learn(db, async (prompt) => {
      calls++;
      const input = JSON.parse(prompt.slice(prompt.indexOf("{"))) as Record<string, string>;
      return JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, `DE ${v}`])));
    });
    const sheet = learn.sheet("git");
    expect(sheet).toBeDefined();
    const all = texts(sheet);
    expect(all.some(([k]) => k === "summary")).toBe(true);
    const out = await learn.translate("sheet", "git", "de", "German");
    expect(out.summary).toStartWith("DE ");
    expect(Object.keys(out).length).toBe(all.length);
    const before = calls;
    await learn.translate("sheet", "git", "de", "German");
    expect(calls).toBe(before);
    expect(learn.translation("sheet", "git", "de")?.summary).toStartWith("DE ");
    await expect(learn.translate("sheet", "git", "tr", "Turkish")).rejects.toThrow();
  });
});
