import { describe, expect, test } from "bun:test";
import { hideBody, Refiller, refillStream, startGateway } from "./gateway";

const values = [
  { name: "tc_kimlik", value: "10000000146" },
  { name: "env_stripe_key", value: 'sk_live_"abc"123' },
];

const sse = (events: unknown[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(new TextEncoder().encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });

describe("the privacy gateway", () => {
  test("every string in the request is hidden: a message, a file the AI read, a command's output", () => {
    const body = JSON.stringify({
      messages: [
        { role: "user", content: "My id is 10000000146" },
        { role: "user", content: [{ type: "tool_result", content: 'STRIPE_KEY=sk_live_"abc"123\n' }] },
      ],
    });
    const out = hideBody(body, values);
    expect(out.body).not.toContain("10000000146");
    expect(out.body).not.toContain("sk_live_");
    expect(out.body).toContain("[[private:tc_kimlik]]");
    expect(out.hidden).toBe(2);
  });

  test("a placeholder cut across pieces comes back whole, and other brackets pass untouched", () => {
    const r = new Refiller(values);
    const out = [
      r.push("id: [[pri"),
      r.push("vate:tc_ki"),
      r.push("mlik]] and [[1, 2]] ok ["),
      r.push("x]"),
      r.flush(),
    ];
    expect(out.join("")).toBe("id: 10000000146 and [[1, 2]] ok [x]");
  });

  test("a streamed tool input gets the value escaped as JSON, so the input stays valid", async () => {
    const stream = refillStream(
      sse([
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", input: {} } },
        {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"key": "[[private:env_' },
        },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: 'stripe_key]]"}' } },
        { type: "content_block_stop", index: 1 },
      ]),
      values,
    );
    const text = await new Response(stream).text();
    const json = [...text.matchAll(/"partial_json":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).join("");
    expect(JSON.parse(json)).toEqual({ key: 'sk_live_"abc"123' });
  });

  test("end to end: the upstream sees only placeholders, the caller gets the values back", async () => {
    let seen = "";
    const upstream = Bun.serve({
      port: 0,
      async fetch(req) {
        seen = await req.text();
        return Response.json({ content: [{ type: "text", text: "Stored [[private:tc_kimlik]]." }] });
      },
    });
    const gateway = startGateway(() => values, `http://127.0.0.1:${upstream.port}`);
    const res = await fetch(`${gateway.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ messages: [{ role: "user", content: "save 10000000146" }] }),
    });
    expect(seen).not.toContain("10000000146");
    expect(((await res.json()) as { content: { text: string }[] }).content[0]?.text).toBe("Stored 10000000146.");
    gateway.stop();
    upstream.stop(true);
  });
});
