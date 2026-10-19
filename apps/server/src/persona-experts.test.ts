import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE_EXPERTS, DEFAULT_SETTINGS, viewSummary } from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { Experts, expertsHint } from "./persona-experts";
import { Personas } from "./personas";
import { Store } from "./store";

/** `reply` is what the model answers, or a call of its own (one that fails, say). */
function setup(reply: string | (() => Promise<string>) = "Use one service per bounded context (src/app.ts:12).") {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "igrek-experts-"));
  const projectId = store.addProject(dir);
  const personas = new Personas(sqlite, store, new Bus(), new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  const calls: { prompt: string; cwd: string; model: string; system: string }[] = [];
  const experts = new Experts(sqlite, personas, store, new StopRegistry(), async (prompt, cwd, model, system) => {
    calls.push({ prompt, cwd, model, system });
    return typeof reply === "string" ? reply : reply();
  });
  return { experts, personas, projectId, dir, calls };
}

describe("experts on call", () => {
  test("a question goes to the persona, in the project folder, with its own prompt", async () => {
    const { experts, projectId, dir, calls } = setup();
    const result = await experts.ask(projectId, "architect", "Should the cache live in the server?");
    expect(result.answer).toBe("Use one service per bounded context (src/app.ts:12).");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cwd).toBe(dir);
    expect(calls[0]?.prompt).toBe("Should the cache live in the server?");
    // It knows it answers another agent, briefly and without changing anything.
    expect(calls[0]?.system).toContain("consulted by another AI agent");
  });

  test("what the expert writes in its notebook is kept for the project, not shown", async () => {
    const reply = `Add an index on orders(user_id).
<notebook>{"opinions":[{"claim":"orders needs an index on user_id","reasoning":"the list query scans","evidence":"src/db.ts:40","confidence":"high"}]}</notebook>`;
    const { experts, personas, projectId } = setup(reply);
    const result = await experts.ask(projectId, "database", "Why is the orders page slow?");
    expect(result.answer).toBe("Add an index on orders(user_id).");
    expect(personas.opinions("database", projectId).map((o) => o.claim)).toEqual(["orders needs an index on user_id"]);
  });

  test("unknown experts and empty questions are refused before any model call", async () => {
    const { experts, projectId, calls } = setup();
    await expect(experts.ask(projectId, "nobody", "What now?")).rejects.toThrow("No expert called nobody");
    await expect(experts.ask(projectId, "architect", " ")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test("each persona's view of a project is stored and replaced when written again", async () => {
    const { experts, projectId } = setup("Layered server, React web.");
    await experts.refreshView(projectId, "architect", 1000);
    await experts.refreshView(projectId, "architect", 2000);
    expect(experts.views(projectId)).toEqual([
      { personaId: "architect", text: "Layered server, React web.", at: 2000 },
    ]);
  });

  test("removing an own persona removes its views; resetting a built-in keeps them", async () => {
    const { experts, personas, projectId } = setup("A view.");
    const own = personas.save({ id: "game-designer", name: "Game designer", role: "Game feel", group: "engineering" });
    await experts.refreshView(projectId, own.id);
    await experts.refreshView(projectId, "architect");
    personas.remove(own.id);
    personas.remove("architect");
    expect(experts.views(projectId).map((v) => v.personaId)).toEqual(["architect"]);
  });

  test("views are written in the background; who is reading and who failed is kept", async () => {
    const { experts, projectId } = setup("Sums it up.\n\n## Today\nA monolith.");
    const changes: string[] = [];
    experts.onChange = (id) => changes.push(id);
    const started = experts.start(projectId, ["architect", "security"]);
    expect(started.running.sort()).toEqual(["architect", "security"]);
    // Asking again while it runs does not start a second read.
    expect(experts.start(projectId, ["architect"]).running).toHaveLength(2);
    while (experts.state(projectId).running.length) await Bun.sleep(5);
    const state = experts.state(projectId);
    expect(state.views.map((v) => v.personaId).sort()).toEqual(["architect", "security"]);
    expect(state.errors).toEqual({});
    expect(changes.length).toBeGreaterThanOrEqual(3);
    expect(changes.every((id) => id === projectId)).toBe(true);
  });

  test("a failed look is reported for that expert; unknown experts are refused up front", async () => {
    const { experts, projectId } = setup();
    expect(() => experts.start(projectId, ["nobody"])).toThrow("No expert called nobody");
    const failing = setup(async () => {
      throw new Error("model unavailable");
    });
    failing.experts.start(failing.projectId, ["qa"]);
    while (failing.experts.state(failing.projectId).running.length) await Bun.sleep(5);
    expect(failing.experts.state(failing.projectId).errors).toEqual({ qa: "model unavailable" });
  });

  test("with no one named, the core panel is asked", () => {
    const { experts, projectId } = setup();
    expect(experts.start(projectId).running.sort()).toEqual([...CORE_EXPERTS].sort());
  });

  test("a persona's chat knows the view it wrote of the project", async () => {
    const { experts, personas, projectId } = setup("The API is one NestJS process.\n\n## Risks\nNo queue.");
    await experts.refreshView(projectId, "architect", Date.UTC(2026, 9, 1));
    const architect = personas.get("architect");
    if (!architect) throw new Error("architect missing");
    const prompt = personas.systemPrompt(architect, projectId);
    expect(prompt).toContain("Your written view of this project (Oct 2026");
    expect(prompt).toContain("The API is one NestJS process.");
    expect(personas.systemPrompt(architect, null)).not.toContain("Your written view");
  });

  test("a view's opening sentence is its summary; old views have none", () => {
    expect(viewSummary("A modular monolith that holds up.\n\n## Today\nNestJS.")).toEqual({
      summary: "A modular monolith that holds up.",
      rest: "## Today\nNestJS.",
    });
    expect(viewSummary("**Bold summary.**\n\nMore.").summary).toBe("Bold summary.");
    expect(viewSummary("## Today\nNestJS.\n\n## Risks").summary).toBeUndefined();
    expect(viewSummary("One paragraph only.")).toEqual({ rest: "One paragraph only." });
  });

  test("the chat is told which experts it can call and when", () => {
    const { experts } = setup();
    const hint = expertsHint(experts.roster());
    expect(hint).toContain("igrek_ask_expert");
    expect(hint).toContain("@<id>");
    expect(hint).toContain(`"@all" means: ask each of these in parallel,\n${CORE_EXPERTS.join(", ")}`);
    expect(hint).toMatch(/- architect: /);
    expect(hint).toMatch(/- security: /);
  });
});
