import { brotliDecompressSync } from "node:zlib";
import { fillPrivate, hidePrivate } from "@igrek/core";

/**
 * The privacy gateway (plan.md 13.6): every request Igrek's AI tools make to Anthropic goes through
 * this local server first. On the way out, the user's private details and their projects' .env
 * secrets become [[private:name]] wherever they appear: in a message, in a file the AI read, in a
 * command's output. On the way back, placeholders become the values again, so a file the AI writes
 * here gets the real value while the model never saw it. Nothing else changes; requests go on to
 * the address they would have gone to (ANTHROPIC_BASE_URL, or api.anthropic.com).
 */
type Values = () => { name: string; value: string }[];

/** Every string in a JSON value, changed by `f` (keys stay as they are). */
function mapStrings(value: unknown, f: (s: string) => string): unknown {
  if (typeof value === "string") return f(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, f));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, f)]));
  return value;
}

/** A request body with every private value hidden; says how many places were hidden. */
export function hideBody(body: string, values: { name: string; value: string }[]): { body: string; hidden: number } {
  if (!values.length || !body) return { body, hidden: 0 };
  let hidden = 0;
  try {
    const out = mapStrings(JSON.parse(body), (s) => {
      const r = hidePrivate(s, values);
      hidden += r.hidden.length;
      return r.text;
    });
    return { body: JSON.stringify(out), hidden };
  } catch {
    const r = hidePrivate(body, values);
    return { body: r.text, hidden: r.hidden.length };
  }
}

const OPEN = "[[private:";

/**
 * Streamed text with placeholders put back, piece by piece. A placeholder can arrive cut in two
 * (`[[pri` then `vate:x]]`), so the end of a piece that could be the start of one waits for the next.
 */
export class Refiller {
  private held = "";

  constructor(
    private readonly values: { name: string; value: string }[],
    /** Inside a JSON string (a tool's input as it streams): values are escaped as JSON. */
    readonly json = false,
  ) {}

  private fill(text: string): string {
    const values = this.json
      ? this.values.map((v) => ({ name: v.name, value: JSON.stringify(v.value).slice(1, -1) }))
      : this.values;
    return fillPrivate(text, values);
  }

  push(piece: string): string {
    const text = this.held + piece;
    // Hold back a tail that may still grow into a placeholder: "[", "[[pri", "[[private:na".
    let cut = text.length;
    const open = text.lastIndexOf("[[");
    const tail = open >= 0 ? text.slice(open) : "";
    if (open >= 0 && !tail.includes("]]") && tail.length <= 60 && (OPEN.startsWith(tail) || tail.startsWith(OPEN)))
      cut = open;
    else if (text.endsWith("[")) cut = text.length - 1;
    this.held = text.slice(cut);
    return this.fill(text.slice(0, cut));
  }

  flush(): string {
    const rest = this.fill(this.held);
    this.held = "";
    return rest;
  }
}

type Event = { type?: string; index?: number; delta?: { type?: string; text?: string; partial_json?: string } };

function parseEvent(line: string): Event | undefined {
  try {
    return JSON.parse(line.slice(6)) as Event;
  } catch {
    return undefined;
  }
}

type OpenAiEvent = {
  type: string;
  item_id?: string;
  content_index?: number;
  delta?: string;
  text?: string;
  arguments?: string;
  [key: string]: unknown;
};

/** Every string in an event filled; `arguments` (a tool call's JSON) gets values escaped as JSON. */
function fillDeep(value: unknown, values: { name: string; value: string }[], key = ""): unknown {
  if (typeof value === "string")
    return key === "arguments"
      ? fillPrivate(
          value,
          values.map((v) => ({ name: v.name, value: JSON.stringify(v.value).slice(1, -1) })),
        )
      : fillPrivate(value, values);
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, values));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, values, k)]));
  return value;
}

/**
 * The Responses API's stream (Codex): text and tool-call arguments arrive as deltas per item, then a
 * ".done" event and the whole item again. Deltas are refilled piece by piece like Anthropic's; what
 * was held back goes out as one more delta just before ".done"; every other event is filled whole.
 */
function openAiRewriter(values: { name: string; value: string }[]) {
  const parts = new Map<string, Refiller>();
  const key = (e: OpenAiEvent, args: boolean) => `${e.item_id ?? ""}:${args ? "args" : (e.content_index ?? 0)}`;
  return (event: string, line: string, data: OpenAiEvent): string => {
    const args = data.type.startsWith("response.function_call_arguments.");
    const delta = data.type === "response.output_text.delta" || data.type === "response.function_call_arguments.delta";
    const done = data.type === "response.output_text.done" || data.type === "response.function_call_arguments.done";
    let before = "";
    if (delta && typeof data.delta === "string") {
      const refiller = parts.get(key(data, args)) ?? new Refiller(values, args);
      parts.set(key(data, args), refiller);
      data.delta = refiller.push(data.delta);
    } else {
      const rest = done ? parts.get(key(data, args))?.flush() : undefined;
      if (done) parts.delete(key(data, args));
      if (rest) {
        const type = args ? "response.function_call_arguments.delta" : "response.output_text.delta";
        const { text: _text, arguments: _args, ...base } = data;
        before = `event: ${type}\ndata: ${JSON.stringify({ ...base, type, delta: rest })}\n\n`;
      }
      Object.assign(data, fillDeep(data, values));
    }
    return `${before}${event.replace(line, `data: ${JSON.stringify(data)}`)}\n\n`;
  };
}

/** One SSE stream (Anthropic's, or OpenAI's Responses API) with the placeholders in its text and tool inputs put back. */
export function refillStream(source: ReadableStream<Uint8Array>, values: { name: string; value: string }[]) {
  const blocks = new Map<number, Refiller>();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const rewrite = (event: string): string => {
    const line = event.split("\n").find((l) => l.startsWith("data: "));
    const data = line ? parseEvent(line) : undefined;
    if (!line || !data) return `${event}\n\n`;
    // OpenAI's Responses API (Codex): its own events, its own refilling.
    if (data.type?.startsWith("response.")) return openAi(event, line, data as OpenAiEvent);
    const index = data.index ?? 0;
    if (data.type === "content_block_delta" && data.delta) refillDelta(data.delta, index);
    else if (data.type === "content_block_stop" && blocks.has(index)) {
      // What was held back goes out as one last delta of its block, then the block ends.
      const rest = lastDelta(index);
      if (rest) return `event: content_block_delta\ndata: ${rest}\n\n${event}\n\n`;
    }
    return `${event.replace(line, `data: ${JSON.stringify(data)}`)}\n\n`;
  };
  const openAi = openAiRewriter(values);
  /** A delta's text or tool-input piece, with its block's placeholders put back. */
  const refillDelta = (delta: NonNullable<Event["delta"]>, index: number) => {
    const json = delta.type === "input_json_delta";
    const key = json ? "partial_json" : "text";
    const piece = delta[key];
    if (typeof piece !== "string") return;
    const refiller = blocks.get(index) ?? new Refiller(values, json);
    blocks.set(index, refiller);
    delta[key] = refiller.push(piece);
  };
  /** The held-back end of a block, as one more delta event; nothing when nothing was held. */
  const lastDelta = (index: number): string | undefined => {
    const refiller = blocks.get(index) as Refiller;
    blocks.delete(index);
    const rest = refiller.flush();
    if (!rest) return undefined;
    const delta = refiller.json ? { type: "input_json_delta", partial_json: rest } : { type: "text_delta", text: rest };
    return JSON.stringify({ type: "content_block_delta", index, delta });
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          controller.enqueue(encoder.encode(rewrite(buffer.slice(0, end))));
          buffer = buffer.slice(end + 2);
          end = buffer.indexOf("\n\n");
        }
      }
      if (buffer.trim()) controller.enqueue(encoder.encode(rewrite(buffer)));
      controller.close();
    },
  });
}

/** Headers that belong to one connection, not to the request: never passed on. */
const HOP = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "transfer-encoding",
  // The body goes on unpacked (it was read to hide values), so it is no longer encoded.
  "content-encoding",
]);

/** A request's body as text, unpacked first: Codex sends its requests compressed with zstd. */
async function bodyText(req: Request): Promise<string> {
  const bytes = new Uint8Array(await req.arrayBuffer());
  const encoding = req.headers.get("content-encoding")?.toLowerCase();
  if (encoding === "zstd") return new TextDecoder().decode(Bun.zstdDecompressSync(bytes));
  if (encoding === "gzip") return new TextDecoder().decode(Bun.gunzipSync(bytes));
  if (encoding === "br") return new TextDecoder().decode(brotliDecompressSync(bytes));
  return new TextDecoder().decode(bytes);
}

/**
 * Starts the gateway on a free local port; returns its address, for ANTHROPIC_BASE_URL. Only this
 * computer can reach it (127.0.0.1). `onHidden` hears how many places a request had hidden.
 */
export function startGateway(
  values: Values,
  /** Where requests go on to: one address, or one per path (OpenAI's API and ChatGPT's Codex backend). */
  upstream: string | ((path: string) => string) = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
  onHidden: (count: number) => void = () => undefined,
): { url: string; stop: () => void } {
  const targetOf = (path: string) => (typeof upstream === "string" ? upstream : upstream(path)).replace(/\/+$/, "");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 255,
    async fetch(req) {
      const url = new URL(req.url);
      // Codex tries the Responses API over a WebSocket first; "426" makes it use the HTTP stream,
      // which the gateway can read, for the rest of the session.
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket")
        return new Response("Use HTTP through Igrek's gateway", { status: 426 });
      const known = values();
      const raw = req.method === "GET" || req.method === "HEAD" ? "" : await bodyText(req);
      const { body, hidden } = hideBody(raw, known);
      if (hidden) onHidden(hidden);
      const headers = new Headers();
      req.headers.forEach((v, k) => {
        if (!HOP.has(k.toLowerCase())) headers.set(k, v);
      });
      // Plain bytes back, so the stream can be read and the placeholders put back.
      headers.set("accept-encoding", "identity");
      const res = await fetch(`${targetOf(url.pathname)}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        body: body || undefined,
      });
      const out = new Headers(res.headers);
      for (const h of ["content-length", "content-encoding", "transfer-encoding"]) out.delete(h);
      const type = res.headers.get("content-type") ?? "";
      if (!res.body || !known.length) return new Response(res.body, { status: res.status, headers: out });
      if (type.includes("text/event-stream"))
        return new Response(refillStream(res.body, known), { status: res.status, headers: out });
      const text = await res.text();
      let filled = text;
      try {
        filled = JSON.stringify(fillDeep(JSON.parse(text), known));
      } catch {
        filled = fillPrivate(text, known);
      }
      return new Response(filled, { status: res.status, headers: out });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
