import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@godeye/core";
import { groupWork, workCounts } from "./chat-log";

const tool = (id: string, name: string): ChatEvent => ({ kind: "tool", id, at: 0, name, input: {}, status: "done" });
const text = (id: string): ChatEvent => ({ kind: "text", id, at: 0, text: "hi" });

describe("work log", () => {
  const events = [
    text("t1"),
    tool("a", "Read"),
    tool("b", "Read"),
    tool("c", "Edit"),
    text("t2"),
    tool("d", "Bash"),
    tool("e", "TodoWrite"),
  ];

  test("runs of tool calls become one line; a single call and the to-do list stay cards", () => {
    const units = groupWork(events, "grouped");
    expect(units.map((u) => (u.kind === "group" ? `group:${u.tools.length}` : u.event.id))).toEqual([
      "t1",
      "group:3",
      "t2",
      "d",
      "e",
    ]);
  });

  test("every step, plain lines only, or only the text", () => {
    expect(groupWork(events, "all")).toHaveLength(events.length);
    expect(groupWork(events, "plain").filter((u) => u.kind === "group")).toHaveLength(2);
    expect(groupWork(events, "text").map((u) => (u.kind === "event" ? u.event.id : "group"))).toEqual(["t1", "t2"]);
  });

  test("counts steps by kind in a fixed order", () => {
    const run = [tool("a", "Edit"), tool("b", "Read"), tool("c", "Read"), tool("d", "mcp__x__y")];
    expect(workCounts(run as Extract<ChatEvent, { kind: "tool" }>[])).toEqual([
      ["read", 2],
      ["edit", 1],
      ["other", 1],
    ]);
  });
});
