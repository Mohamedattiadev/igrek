import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChatEvent, type ChatInfo, STEP_CUT } from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { ChatHistory, Chats, ruleCovers, ruleFor } from "./chats";
import { openDb } from "./db";

/** A stand-in `claude` that speaks the same stream-json protocol. */
function fakeClaude(): string {
  const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
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

describe("always allow in this project", () => {
  test("a shell rule is the command's first two words, and chained commands get none", () => {
    expect(ruleFor("Read", { file_path: "/x" })).toBe("Read");
    expect(ruleFor("Bash", { command: "bun test apps/server" })).toBe("Bash(bun test)");
    expect(ruleFor("Bash", { command: "bun test && rm -rf ~" })).toBeUndefined();
    expect(ruleFor("Bash", { command: "cat a > b" })).toBeUndefined();
    expect(ruleFor("Bash", { command: "echo $(whoami)" })).toBeUndefined();
  });

  test("a rule covers only the commands that start with its words", () => {
    expect(ruleCovers("Bash(bun test)", "Bash", { command: "bun test chats" })).toBe(true);
    expect(ruleCovers("Bash(bun test)", "Bash", { command: "bun testing" })).toBe(false);
    expect(ruleCovers("Bash(bun test)", "Bash", { command: "bun test; rm -rf ~" })).toBe(false);
    expect(ruleCovers("Read", "Read", { file_path: "/y" })).toBe(true);
    expect(ruleCovers("Read", "Edit", { file_path: "/y" })).toBe(false);
  });
});

describe("status pill", () => {
  test("approval while a step waits, then done until someone opens the chat", async () => {
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(fakeClaude(), "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    await Bun.sleep(400);
    chats.send(info.id, "go");
    await Bun.sleep(500);
    expect(chats.get(info.id)?.pill).toBe("approval");
    const attached = chats.attach(info.id, () => undefined);
    const permission = attached?.events.find((e) => e.kind === "permission");
    attached?.detach();
    chats.answer(info.id, permission?.kind === "permission" ? permission.requestId : "", "allow");
    await Bun.sleep(500);
    // Nobody had the chat open when the turn ended.
    expect(chats.get(info.id)?.pill).toBe("done");
    chats.attach(info.id, () => undefined);
    expect(chats.get(info.id)?.pill).toBeUndefined();
    chats.stopAll();
  });

  test("an answer that ends with a question waits for the user", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
    writeFileSync(
      join(dir, "claude"),
      `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "s", model: "m" });
for await (const chunk of Bun.stdin.stream()) {
  out({ type: "assistant", message: { id: "m1", content: [{ type: "text", text: "Which file should I change?" }] } });
  out({ type: "result", subtype: "success", duration_ms: 1 });
}
`,
    );
    chmodSync(join(dir, "claude"), 0o755);
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(dir, "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    await Bun.sleep(300);
    chats.send(info.id, "fix it");
    await Bun.sleep(400);
    expect(chats.get(info.id)?.pill).toBe("question");
    chats.stopAll();
  });
});

describe("questions and context", () => {
  test("an AskUserQuestion card waits for an answer, and the answer goes back in the tool's input", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
    writeFileSync(
      join(dir, "claude"),
      `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "s", model: "claude-test" });
let buf = "";
for await (const chunk of Bun.stdin.stream()) {
  buf += new TextDecoder().decode(chunk);
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (msg.type === "user") {
      out({ type: "assistant", message: { id: "m1", usage: { input_tokens: 10, cache_read_input_tokens: 50000, cache_creation_input_tokens: 2000, output_tokens: 5 }, content: [{ type: "text", text: "One question first." }] } });
      out({ type: "control_request", request_id: "q1", request: { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions: [{ question: "Which database?", header: "DB", options: [{ label: "SQLite" }, { label: "Postgres" }], multiSelect: false }] } } });
    }
    if (msg.type === "control_response") {
      const r = msg.response.response;
      out({ type: "assistant", message: { id: "m2", content: [{ type: "text", text: "Got: " + JSON.stringify(r.updatedInput.answers) }] } });
      out({ type: "result", subtype: "success", duration_ms: 1, modelUsage: { "claude-test": { contextWindow: 1000000 } } });
    }
  }
}
`,
    );
    chmodSync(join(dir, "claude"), 0o755);
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(dir, "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    const events: ChatEvent[] = [];
    chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.push(op.event);
    });
    await Bun.sleep(300);
    chats.send(info.id, "build it");
    await Bun.sleep(400);
    expect(chats.get(info.id)?.pill).toBe("question");
    expect(chats.get(info.id)?.context).toMatchObject({ tokens: 52010, window: 200000, cacheRead: 50000 });
    // "Always allow" never covers a question.
    expect(events.find((e) => e.kind === "permission")).toMatchObject({ toolName: "AskUserQuestion", rule: undefined });
    chats.answer(info.id, "q1", "allow", undefined, { "Which database?": "SQLite" });
    await Bun.sleep(400);
    expect(events.some((e) => e.kind === "text" && e.text === 'Got: {"Which database?":"SQLite"}')).toBe(true);
    expect(chats.get(info.id)?.context?.window).toBe(1000000);
    chats.stopAll();
  });
});

describe("loops and cut-off steps", () => {
  test("the same step three times is reported once, and a step left running is cut off at the end of the turn", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
    writeFileSync(
      join(dir, "claude"),
      `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "s", model: "m" });
for await (const chunk of Bun.stdin.stream()) {
  for (let i = 0; i < 4; i++)
    out({ type: "assistant", message: { id: "m" + i, content: [{ type: "tool_use", id: "t" + i, name: "Bash", input: { command: "npm test" } }] } });
  for (let i = 0; i < 3; i++)
    out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t" + i, content: "fail" }] } });
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
    await Bun.sleep(300);
    chats.send(info.id, "fix the tests");
    await Bun.sleep(400);
    const loops = [...events.values()].filter((e) => e.kind === "notice" && e.code === "loop");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toMatchObject({ text: "Bash" });
    // t3 never got a result before the turn ended.
    expect(events.get("t3")).toMatchObject({ status: "error", result: STEP_CUT });
    expect(events.get("t2")).toMatchObject({ status: "done" });
    chats.stopAll();
  });
});

describe("usage limit", () => {
  test("a turn stopped by the limit says when it resets, and can go on by itself", async () => {
    const reset = Math.floor(Date.now() / 1000) + 1;
    const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
    writeFileSync(
      join(dir, "claude"),
      `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
out({ type: "system", subtype: "init", session_id: "s", model: "m" });
let n = 0;
for await (const chunk of Bun.stdin.stream()) {
  n++;
  if (n === 1) out({ type: "result", subtype: "error_during_execution", is_error: true, result: "Claude AI usage limit reached|${reset}" });
  else out({ type: "result", subtype: "success", duration_ms: 1 });
}
`,
    );
    chmodSync(join(dir, "claude"), 0o755);
    Chats.resumeMargin = 0;
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(dir, "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    const events: ChatEvent[] = [];
    chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.push(op.event);
    });
    await Bun.sleep(300);
    chats.send(info.id, "go");
    await Bun.sleep(300);
    expect(chats.get(info.id)?.limit).toEqual({ resetsAt: reset * 1000 });
    expect(chats.get(info.id)?.pill).toBe("limit");
    chats.resumeAtReset(info.id, "go on");
    expect(chats.get(info.id)?.limit?.resumeAt).toBeGreaterThan(0);
    await Bun.sleep(1500);
    expect(events.filter((e) => e.kind === "user").map((e) => (e.kind === "user" ? e.text : ""))).toEqual([
      "go",
      "go on",
    ]);
    expect(chats.get(info.id)?.limit).toBeUndefined();
    Chats.resumeMargin = 60_000;
    chats.stopAll();
  });
});

describe("chat queue", () => {
  test("a message written while the AI works waits, then goes out when the turn ends", async () => {
    const chats = new Chats(new Bus(), new StopRegistry(), () => join(fakeClaude(), "claude"));
    const info = chats.start({ projectId: "p", cwd: tmpdir() });
    const events: ChatEvent[] = [];
    chats.attach(info.id, (op) => {
      if (op.op === "upsert") events.push(op.event);
    });
    await Bun.sleep(400);
    chats.send(info.id, "first");
    await Bun.sleep(500);
    expect(chats.get(info.id)?.status).toBe("waiting");

    chats.send(info.id, "second");
    chats.send(info.id, "third");
    expect(chats.get(info.id)?.queued?.map((q) => q.text)).toEqual(["second", "third"]);
    const third = chats.get(info.id)?.queued?.[1]?.id ?? "";
    chats.unqueue(info.id, third);
    expect(chats.get(info.id)?.queued?.map((q) => q.text)).toEqual(["second"]);

    const permission = events.find((e) => e.kind === "permission");
    chats.answer(info.id, permission?.kind === "permission" ? permission.requestId : "", "allow");
    await Bun.sleep(600);
    // The turn ended, so "second" went out on its own and the queue is empty.
    expect(events.filter((e) => e.kind === "user").map((e) => (e.kind === "user" ? e.text : ""))).toEqual([
      "first",
      "second",
    ]);
    expect(chats.get(info.id)?.queued).toBeUndefined();
    chats.stopAll();
  });

  test("queued text survives in the history and is handed to the chat that continues it", () => {
    const { sqlite } = openDb(":memory:");
    const history = new ChatHistory(sqlite);
    history.record([
      {
        id: "a",
        projectId: "p",
        cwd: "/",
        title: "t",
        mode: "normal",
        status: "working",
        startedAt: 1,
        sessionId: "s1",
        queued: [{ id: "q1", text: "next step", images: 1 }],
      },
    ]);
    expect(history.takeQueue("s1")).toEqual([{ id: "q1", text: "next step", images: 0 }]);
    expect(history.takeQueue("s1")).toEqual([]);
  });
});

describe("chat streaming", () => {
  test("a text block after a thinking block is not shown twice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "igrek-fakeclaude-"));
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
