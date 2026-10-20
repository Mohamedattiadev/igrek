import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@igrek/core";
import { latestTodos, progress } from "./todos";

const write = (id: string, todos: unknown): ChatEvent => ({
  kind: "tool",
  id,
  at: 0,
  name: "TodoWrite",
  input: { todos },
  status: "done",
});

describe("the agent's plan", () => {
  test("the last list written is the plan; other tools do not count", () => {
    const events: ChatEvent[] = [
      write("1", [{ content: "Read the code", status: "in_progress" }]),
      { kind: "tool", id: "2", at: 0, name: "Read", input: {}, status: "done" },
      write("3", [
        { content: "Read the code", status: "completed" },
        { content: "Fix the bug", status: "in_progress", activeForm: "Fixing the bug" },
        { content: "Run tests", status: "pending" },
      ]),
      { kind: "text", id: "4", at: 0, text: "Working on it" },
    ];
    const todos = latestTodos(events);
    expect(todos?.map((t) => t.status)).toEqual(["completed", "in_progress", "pending"]);
    expect(progress(todos ?? [])).toEqual({
      done: 1,
      total: 3,
      current: { content: "Fix the bug", status: "in_progress", activeForm: "Fixing the bug" },
    });
  });

  test("no plan, or a broken one, gives nothing to show", () => {
    expect(latestTodos([{ kind: "text", id: "1", at: 0, text: "hi" }])).toBeUndefined();
    expect(latestTodos([write("1", "not a list")])).toBeUndefined();
    expect(
      latestTodos([
        write("1", [
          { content: "", status: "x" },
          { content: "Step", status: "odd" },
        ]),
      ]),
    ).toEqual([{ content: "Step", status: "pending" }]);
  });
});
