import { describe, expect, test } from "bun:test";
import type { ChatEvent, Settings, ToolResult } from "@igrek/core";
import { editedThisTurn } from "./chats";
import { TurnGate } from "./turn-gate";

const result = (command: string, ok: boolean): ToolResult => ({
  kind: "test",
  command,
  exitCode: ok ? 0 : 1,
  ok,
  ms: 1,
  at: 1,
  output: ok ? "" : `${command} failed`,
});

function harness(mode: Settings["turnGate"] = "sendBack") {
  const events: ChatEvent[] = [];
  const sent: string[] = [];
  let next: ToolResult[] = [];
  const gate = new TurnGate(
    () => mode,
    { addEvent: (_id, event) => events.push(event), send: (_id, text) => sent.push(text) },
    async () => next,
  );
  return {
    gate,
    events,
    sent,
    checks: (r: ToolResult[]) => {
      next = r;
    },
    last: () => events.at(-1) as Extract<ChatEvent, { kind: "gate" }>,
  };
}

describe("turn gate", () => {
  test("only checks that passed at the baseline and fail now count, and they go back to the AI", async () => {
    const h = harness();
    h.checks([result("tsc", true), result("lint", false)]);
    await h.gate.baseline("/p");
    h.checks([result("tsc", false), result("lint", false)]);
    await h.gate.turnEnded("c1", "/p", ["/p/a.ts"]);
    expect(h.events[0]).toMatchObject({ kind: "gate", status: "running" });
    expect(h.last().status).toBe("fail");
    expect(h.last().checks.map((c) => [c.command, c.broke])).toEqual([
      ["tsc", true],
      ["lint", false],
    ]);
    expect(h.last().sentBack).toBe(true);
    expect(h.sent[0]).toContain("$ tsc\ntsc failed");
    expect(h.sent[0]).not.toContain("lint failed");
  });

  test("an unfixed break is sent back at most twice in a row; a message from the user starts over", async () => {
    const h = harness();
    h.checks([result("tsc", true)]);
    await h.gate.baseline("/p");
    h.checks([result("tsc", false)]);
    // The first turn and two answers to the gate's own messages: the third failure is only shown.
    for (let i = 0; i < 3; i++) await h.gate.turnEnded("c1", "/p", ["/p/a.ts"]);
    expect(h.sent).toHaveLength(2);
    expect(h.last().checks[0]?.broke).toBe(true);
    expect(h.last().sentBack).toBe(false);
    // The next turn starts from a user message, so the rounds start again.
    await h.gate.turnEnded("c1", "/p", ["/p/a.ts"]);
    expect(h.sent).toHaveLength(3);
  });

  test("turns without file changes, and the off mode, run nothing", async () => {
    const h = harness("off");
    h.checks([result("tsc", false)]);
    await h.gate.turnEnded("c1", "/p", ["/p/a.ts"]);
    const on = harness("check");
    await on.gate.turnEnded("c1", "/p", []);
    expect(h.events).toHaveLength(0);
    expect(on.events).toHaveLength(0);
  });

  test("files written this turn come from finished write steps after the last user message", () => {
    const tool = (name: string, file: string, status: "done" | "error" = "done"): ChatEvent => ({
      kind: "tool",
      id: file,
      at: 1,
      name,
      input: { file_path: file },
      status,
    });
    const events: ChatEvent[] = [
      tool("Edit", "/old.ts"),
      { kind: "user", id: "u", at: 2, text: "go", images: 0 },
      tool("Read", "/read.ts"),
      tool("Edit", "/a.ts"),
      tool("Write", "/b.ts"),
      tool("Edit", "/failed.ts", "error"),
      tool("Edit", "/a.ts"),
    ];
    expect(editedThisTurn(events).sort()).toEqual(["/a.ts", "/b.ts"]);
  });
});
