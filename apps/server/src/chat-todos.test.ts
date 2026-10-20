import { describe, expect, test } from "bun:test";
import { ChatTodos } from "./chat-todos";
import { openDb } from "./db";

describe("a chat's to-do list", () => {
  test("items are added, ticked off and removed, in the order they were written", () => {
    const todos = new ChatTodos(openDb(":memory:").sqlite);
    todos.add("s1", "  Write the   login test ", 1);
    const [first] = todos.add("s1", "Update the docs", 2);
    expect(first?.text).toBe("Write the login test");
    const done = todos.update("s1", first?.id ?? "", { done: true }, 3);
    expect(done.map((t) => [t.text, t.done])).toEqual([
      ["Write the login test", true],
      ["Update the docs", false],
    ]);
    expect(done[0]?.doneAt).toBe(3);
    expect(todos.remove("s1", first?.id ?? "").map((t) => t.text)).toEqual(["Update the docs"]);
    expect(() => todos.add("s1", "   ")).toThrow();
  });

  test("another chat's items are neither shown nor changed; a new chat's list moves to its session", () => {
    const todos = new ChatTodos(openDb(":memory:").sqlite);
    const [mine] = todos.add("chat:c1", "Mine");
    todos.update("other", mine?.id ?? "", { done: true });
    todos.remove("other", mine?.id ?? "");
    expect(todos.list("other")).toEqual([]);
    todos.adopt("chat:c1", "sess-1");
    expect(todos.list("sess-1").map((t) => [t.text, t.done])).toEqual([["Mine", false]]);
  });
});
