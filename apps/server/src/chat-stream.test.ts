import { describe, expect, test } from "bun:test";
import type { ChatEvent, ChatInfo } from "@igrek/core";
import { ChatStream } from "./chat-stream";

const info = { id: "c1", status: "working" } as unknown as ChatInfo;
const text = (id: string, value: string): ChatEvent => ({ kind: "text", id, at: 1, text: value }) as ChatEvent;

function harness() {
  const sent: { op: string; seq: number; ops?: { op: string; event?: ChatEvent }[]; events?: ChatEvent[] }[] = [];
  let buffered = 0;
  let seq = 0;
  const events: ChatEvent[] = [];
  const stream = new ChatStream(
    (data) => sent.push(JSON.parse(data)),
    () => buffered,
    () => ({ info, events: [...events], seq }),
  );
  return {
    sent,
    stream,
    setBuffered: (n: number) => {
      buffered = n;
    },
    change: (event: ChatEvent) => {
      seq++;
      const i = events.findIndex((e) => e.id === event.id);
      if (i < 0) events.push(event);
      else events[i] = event;
      stream.push({ op: "upsert", seq, event });
    },
  };
}

describe("chat stream", () => {
  test("many changes to one event go out once, with the newest sequence number", () => {
    const h = harness();
    h.stream.start({ info, events: [], seq: 0 });
    for (const word of ["a", "ab", "abc", "abcd"]) h.change(text("t1", word));
    h.change(text("t2", "x"));
    h.stream.flush();
    expect(h.sent).toHaveLength(2);
    const batch = h.sent[1];
    expect(batch?.op).toBe("batch");
    expect(batch?.seq).toBe(5);
    expect(batch?.ops?.map((o) => (o.event as { text: string }).text)).toEqual(["abcd", "x"]);
  });

  test("a socket that backs up gets one snapshot after it drains instead of the backlog", () => {
    const h = harness();
    h.stream.start({ info, events: [], seq: 0 });
    h.change(text("t1", "a"));
    h.setBuffered(2 * 1024 * 1024);
    h.stream.flush();
    const before = h.sent.length;
    for (let i = 0; i < 50; i++) h.change(text(`t${i}`, "more"));
    h.stream.flush();
    expect(h.sent.length).toBe(before);
    // Still too full: nothing yet.
    h.stream.drain();
    expect(h.sent.length).toBe(before);
    h.setBuffered(0);
    h.stream.drain();
    const last = h.sent.at(-1);
    expect(last?.op).toBe("init");
    expect(last?.seq).toBe(51);
    expect(last?.events).toHaveLength(50);
  });
});
