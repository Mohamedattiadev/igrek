import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent, ChatInfo } from "@godeye/core";
import { Bus, StopRegistry } from "./bus";
import { ChatHistory, Chats } from "./chats";
import { openDb } from "./db";

/** A stand-in `claude` that speaks the same stream-json protocol. */
function fakeClaude(): string {
  const dir = mkdtempSync(join(tmpdir(), "godeye-fakeclaude-"));
  const script = `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "sess-1", model: "claude-test" });
let buf = "";
for await (const chunk of Bun.stdin.stream()) {
  buf += new TextDecoder().decode(chunk);
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (msg.type === "user") {
      out({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } });
      out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Writ" } } });
      out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ing it." } } });
      out({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Writing it." }, { type: "tool_use", id: "tu1", name: "Write", input: { file_path: "/x", content: "hi" } }] } });
      out({ type: "rate_limit_event", rate_limit_info: { unifiedWindows: { five_hour: { utilization: 0.2, resetsAt: 100 }, seven_day: { utilization: 0.5, resetsAt: 200 } } } });
      out({ type: "control_request", request_id: "req-1", request: { subtype: "can_use_tool", tool_name: "Write", input: { file_path: "/x", content: "hi" } } });
    }
    if (msg.type === "control_response") {
      const allowed = msg.response.response.behavior === "allow";
      out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "tu1", is_error: !allowed, content: allowed ? "File created" : "denied" }] } });
      out({ type: "result", subtype: "success", duration_ms: 42 });
    }
  }
}
`;
  writeFileSync(join(dir, "claude"), script);
  chmodSync(join(dir, "claude"), 0o755);
  return dir;
}

describe("chat", () => {
  test("streams text, asks permission in the UI, and finishes the turn", async () => {
    const bin = fakeClaude();
    const snapshots: string[] = [];
    const chats = new Chats(
      new Bus(),
      new StopRegistry(),
      () => join(bin, "claude"),
      (_cwd, label) => {
        snapshots.push(label);
        return "abc123";
      },
    );
    const info = chats.start({ projectId: "p", cwd: tmpdir(), mode: "normal" });

    const events = new Map<string, ChatEvent>();
    const attached = chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.set(op.event.id, op.event);
    });
    await Bun.sleep(400);
    expect(chats.get(info.id)?.sessionId).toBe("sess-1");

    chats.send(info.id, "Write hi to /x");
    await Bun.sleep(600);
    // A snapshot is taken before the AI turn and shown in the chat.
    expect(snapshots).toEqual(["Write hi to /x"]);
    expect([...events.values()].find((e) => e.kind === "checkpoint")).toMatchObject({ checkpointId: "abc123" });
    const permission = [...events.values()].find((e) => e.kind === "permission");
    expect(permission).toMatchObject({ toolName: "Write", status: "pending" });
    expect(chats.get(info.id)?.status).toBe("waiting");
    expect([...events.values()].find((e) => e.kind === "text")).toMatchObject({ text: "Writing it." });
    expect(chats.get(info.id)?.rateLimit).toMatchObject({ fiveHour: 0.2, week: 0.5, weekResetsAt: 200_000 });

    chats.answer(info.id, permission?.kind === "permission" ? permission.requestId : "", "allow");
    await Bun.sleep(500);
    expect([...events.values()].find((e) => e.kind === "tool")).toMatchObject({
      status: "done",
      result: "File created",
    });
    expect([...events.values()].some((e) => e.kind === "result")).toBe(true);
    expect(chats.get(info.id)?.status).toBe("idle");

    attached?.detach();
    chats.stopAll();
  });
});

describe("chat streaming", () => {
  test("a text block after a thinking block is not shown twice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "godeye-fakeclaude-"));
    writeFileSync(
      join(dir, "claude"),
      `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "s", model: "m" });
for await (const chunk of Bun.stdin.stream()) {
  out({ type: "stream_event", event: { type: "message_start", message: { id: "m1" } } });
  out({ type: "stream_event", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello there" } } });
  out({ type: "assistant", message: { id: "m1", content: [{ type: "thinking", thinking: "" }] } });
  out({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Hello there" }] } });
  out({ type: "result", subtype: "success", duration_ms: 1 });
}
`,
    );
    chmodSync(join(dir, "claude"), 0o755);
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(dir, "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    const events = new Map<string, ChatEvent>();
    chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.set(op.event.id, op.event);
    });
    chats.send(info.id, "hi");
    for (let i = 0; i < 200 && chats.get(info.id)?.status !== "idle"; i++) await Bun.sleep(10);
    expect([...events.values()].filter((e) => e.kind === "text").map((e) => (e.kind === "text" ? e.text : ""))).toEqual(
      ["Hello there"],
    );
    chats.stopAll();
  });
});

describe("chat history", () => {
  const info = (id: string, sessionId?: string, title = id): ChatInfo => ({
    id,
    projectId: "p1",
    cwd: "/tmp",
    title,
    mode: "normal",
    status: "idle",
    startedAt: 1,
    sessionId,
  });

  test("keeps chats with a saved session, newest first, and skips live ones", () => {
    const { sqlite } = openDb(":memory:");
    const history = new ChatHistory(sqlite);
    history.record([info("a", "s-a"), info("b")], 10);
    history.record([info("c", "s-c")], 20);
    history.record([info("a", "s-a", "renamed")], 30);
    expect(history.recent(10).map((c) => [c.id, c.title])).toEqual([
      ["a", "renamed"],
      ["c", "c"],
    ]);
    expect(history.recent(10, new Set(["a"])).map((c) => c.id)).toEqual(["c"]);
    expect(history.get("b")).toBeUndefined();
    expect(history.get("c")?.sessionId).toBe("s-c");
    history.forget("c");
    expect(history.get("c")).toBeUndefined();
  });
});
