import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@igrek/core";
import { delegatedTo, EXPERT_TOOL, groupWork, workCounts } from "./chat-log";

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

  test("asking an expert stays its own card, even when only the text is shown", () => {
    const steps = [tool("a", "Read"), tool("x", EXPERT_TOOL), tool("b", "Read"), text("t1")];
    const ids = (level: "grouped" | "plain" | "text") =>
      groupWork(steps, level).map((u) => (u.kind === "event" ? u.event.id : "group"));
    expect(ids("grouped")).toEqual(["a", "x", "b", "t1"]);
    expect(ids("plain")).toEqual(["group", "x", "group", "t1"]);
    expect(ids("text")).toEqual(["x", "t1"]);
  });

  test("the tool call behind a question card is not shown", () => {
    const units = groupWork([text("t1"), tool("q", "AskUserQuestion"), text("t2")], "grouped");
    expect(units.map((u) => (u.kind === "event" ? u.event.id : "group"))).toEqual(["t1", "t2"]);
    expect(groupWork([tool("q", "AskUserQuestion")], "all")).toEqual([]);
  });

  test("work handed to a subagent stays its own card, even when only text is shown", () => {
    const handOver = { ...tool("h", "Task"), input: { subagent_type: "architect", description: "Review the layers" } };
    const units = groupWork([tool("a", "Read"), handOver as ChatEvent, tool("b", "Read"), text("t")], "text");
    expect(units.map((u) => (u.kind === "event" ? u.event.id : "group"))).toEqual(["h", "t"]);
    expect(delegatedTo(handOver as Extract<ChatEvent, { kind: "tool" }>)).toBe("architect");
    expect(delegatedTo(tool("x", "Task") as Extract<ChatEvent, { kind: "tool" }>)).toBeUndefined();
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
