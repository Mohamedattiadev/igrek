import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@igrek/core";
import { Assist, fillPrompt, promptVariables } from "./assist";
import { StopRegistry } from "./bus";
import { migrate } from "./db";
import { Store } from "./store";

function setup() {
  const sqlite = new Database(":memory:");
  migrate(sqlite);
  const store = new Store(sqlite);
  return { store, assist: new Assist(sqlite, store, new StopRegistry(), () => DEFAULT_SETTINGS, "/tmp") };
}

describe("idea box", () => {
  test("captures, moves between statuses and deletes", () => {
    const { assist } = setup();
    const idea = assist.addIdea("Dark mode for reports");
    expect(assist.listIdeas()[0]).toMatchObject({ text: "Dark mode for reports", status: "new" });
    assist.updateIdea(idea.id, { status: "accepted" });
    assist.updateIdea(idea.id, { status: "nonsense" });
    expect(assist.listIdeas()[0]?.status).toBe("accepted");
    assist.deleteIdea(idea.id);
    expect(assist.listIdeas()).toHaveLength(0);
  });
});

describe("prompt library", () => {
  test("saves, edits and ranks by use", () => {
    const { assist } = setup();
    const a = assist.savePrompt({ title: "Review", body: "Review {file} for bugs", tags: ["review", " "] });
    const b = assist.savePrompt({ title: "Tests", body: "Write tests for {feature}" });
    assist.usePrompt(b.id);
    expect(assist.listPrompts().map((p) => p.title)).toEqual(["Tests", "Review"]);
    assist.savePrompt({ id: a.id, title: "Review v2", body: a.body });
    expect(assist.listPrompts().find((p) => p.id === a.id)?.title).toBe("Review v2");
    expect(a.tags).toEqual(["review"]);
  });

  test("fills blanks and lists them", () => {
    expect(promptVariables("Fix {file} then {file} and {test}")).toEqual(["file", "test"]);
    expect(fillPrompt("Fix {file} in {x}", { file: "a.ts" })).toBe("Fix a.ts in {x}");
  });
});
