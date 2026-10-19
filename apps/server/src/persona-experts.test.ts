import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { Experts, expertsHint } from "./persona-experts";
import { Personas } from "./personas";
import { Store } from "./store";

function setup(reply = "Use one service per bounded context (src/app.ts:12).") {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "igrek-experts-"));
  const projectId = store.addProject(dir);
  const personas = new Personas(sqlite, store, new Bus(), new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  const calls: { prompt: string; cwd: string; model: string; system: string }[] = [];
  const experts = new Experts(sqlite, personas, store, new StopRegistry(), async (prompt, cwd, model, system) => {
    calls.push({ prompt, cwd, model, system });
    return reply;
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

  test("the chat is told which experts it can call and when", () => {
    const { experts } = setup();
    const hint = expertsHint(experts.roster());
    expect(hint).toContain("igrek_ask_expert");
    expect(hint).toContain("@<id>");
    expect(hint).toMatch(/- architect: /);
    expect(hint).toMatch(/- security: /);
  });
});
