import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@igrek/core";
import { EXPERT_TOOL } from "./chat-log";
import { editedPath, whyOf } from "./why";

const user = (id: string, text: string): ChatEvent => ({ kind: "user", id, at: 0, text, images: 0 });
const tool = (id: string, name: string, input: unknown, result?: string): ChatEvent => ({
  kind: "tool",
  id,
  at: 0,
  name,
  input,
  status: "done",
  result,
});
const todos = (id: string, list: { content: string; status: string }[]) => tool(id, "TodoWrite", { todos: list });

describe("why a file changed", () => {
  test("the request, the step in progress and the expert asked in the same turn", () => {
    const events = [
      user("u1", "Make the login safer"),
      todos("t1", [
        { content: "Read the login code", status: "completed" },
        { content: "Hash passwords with Argon2id", status: "in_progress" },
      ]),
      tool("x1", EXPERT_TOOL, { expert: "security", question: "Which hash?" }, "Argon2id, with these settings"),
      tool("e1", "Edit", { file_path: "/p/src/auth.ts", old_string: "a", new_string: "b" }),
    ];
    expect(whyOf(events, "e1")).toEqual({
      request: "Make the login safer",
      step: "Hash passwords with Argon2id",
      expert: { id: "security", question: "Which hash?", note: "Argon2id, with these settings" },
    });
  });

  test("an expert from an earlier turn is not this edit's reason", () => {
    const events = [
      user("u1", "Ask the architect"),
      tool("x1", "Task", { subagent_type: "architect", description: "Review" }, "Split the module"),
      user("u2", "Fix the typo"),
      tool("e1", "Write", { file_path: "/p/README.md", content: "x" }),
    ];
    expect(whyOf(events, "e1")).toEqual({ request: "Fix the typo" });
  });

  test("nothing is made up for an unknown step", () => {
    expect(whyOf([user("u1", "hi")], "missing")).toEqual({});
  });

  test("the path an edit changed", () => {
    expect(editedPath(tool("e1", "MultiEdit", { file_path: "/p/a.ts", edits: [] }))).toBe("/p/a.ts");
    expect(editedPath(tool("e2", "NotebookEdit", { notebook_path: "/p/n.ipynb" }))).toBe("/p/n.ipynb");
    expect(editedPath(tool("r1", "Read", { file_path: "/p/a.ts" }))).toBeUndefined();
  });
});
