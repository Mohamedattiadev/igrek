import type { ChatEvent, ChatInfo, ChatMode, RecentChat } from "@igrek/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

type ChangeOp = { op: "upsert"; event: ChatEvent } | { op: "info"; info: ChatInfo };

/** The server merges changes and sends them in batches; `seq` only grows, so stale batches are dropped. */
type ServerOp =
  | { op: "init"; seq: number; info: ChatInfo; events: ChatEvent[] }
  | { op: "batch"; seq: number; ops: ChangeOp[] }
  | { op: "error"; error: string };

/** Applies a batch of event changes in one go (one render instead of one per streamed word). */
export function applyChanges(list: ChatEvent[], ops: ChangeOp[]): ChatEvent[] {
  let next = list;
  let positions: Map<string, number> | undefined;
  for (const op of ops) {
    if (op.op !== "upsert") continue;
    if (next === list) next = list.slice();
    positions ??= new Map(next.map((e, i) => [e.id, i]));
    const index = positions.get(op.event.id);
    if (index === undefined) {
      positions.set(op.event.id, next.length);
      next.push(op.event);
    } else next[index] = op.event;
  }
  return next;
}

interface Sinks {
  setInfo: (info: ChatInfo) => void;
  setEvents: (update: ChatEvent[] | ((list: ChatEvent[]) => ChatEvent[])) => void;
  setError: (error: string) => void;
}

/** Applies one server message and returns the newest sequence number seen. */
function receive(op: ServerOp, seq: number, sinks: Sinks): number {
  if (op.op === "error") {
    sinks.setError(op.error);
    return seq;
  }
  if (op.op === "init") {
    sinks.setInfo(op.info);
    sinks.setEvents(op.events);
    return op.seq;
  }
  if (op.seq <= seq) return seq;
  const info = op.ops.findLast((o) => o.op === "info");
  if (info?.op === "info") sinks.setInfo(info.info);
  if (op.ops.some((o) => o.op === "upsert")) sinks.setEvents((list) => applyChanges(list, op.ops));
  return op.seq;
}

/** What a chat was about, kept by the server so it can be picked up again after God Eye restarts. */
export type KnownChat = Pick<RecentChat, "projectId" | "sessionId" | "title">;

/** Live connection to one chat: its events, status, and the actions you can take. */
export function useChat(id: string) {
  const [info, setInfo] = useState<ChatInfo>();
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [error, setError] = useState<string>();
  /** The chat no longer exists on the server (it ended or God Eye restarted); what we knew of it. */
  const [gone, setGone] = useState<KnownChat | true>();
  const socket = useRef<WebSocket>(undefined);

  useEffect(() => {
    let closed = false;
    let opened = false;
    let seq = -1;
    let retry: ReturnType<typeof setTimeout> | undefined;
    setGone(undefined);
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat/${id}`);
      socket.current = ws;
      ws.onopen = () => {
        opened = true;
      };
      ws.onmessage = (message) => {
        seq = receive(JSON.parse(message.data) as ServerOp, seq, { setInfo, setEvents, setError });
      };
      ws.onclose = () => {
        if (closed) return;
        // Never got in: ask whether the chat still exists before trying again.
        if (!opened)
          void fetch("/api/chats")
            .then((r) => (r.ok ? (r.json() as Promise<ChatInfo[]>) : undefined))
            .then((list) => {
              if (closed) return;
              if (list && !list.some((c) => c.id === id))
                void api
                  .recentChat(id)
                  .then((known) => !closed && setGone(known))
                  .catch(() => !closed && setGone(true));
              else retry = setTimeout(connect, 1500);
            })
            .catch(() => {
              if (!closed) retry = setTimeout(connect, 1500);
            });
        else retry = setTimeout(connect, 1500);
        opened = false;
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, [id]);

  const post = useCallback((message: unknown) => {
    setError(undefined);
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(message));
  }, []);

  return {
    info,
    events,
    error,
    gone,
    /** While the AI works the message is queued; "steer" stops the turn and sends it now. */
    send: (text: string, images: { mediaType: string; data: string }[] = [], how: "queue" | "steer" = "queue") =>
      post({ op: "send", text, images, how }),
    unqueue: (queuedId: string) => post({ op: "unqueue", queuedId }),
    /** Go on by itself a minute after the plan's usage limit resets. */
    resumeAtReset: (text: string) => post({ op: "resumeAtReset", text }),
    cancelResume: () => post({ op: "cancelResume" }),
    sendQueued: (queuedId: string) => post({ op: "sendQueued", queuedId }),
    answer: (
      requestId: string,
      decision: "allow" | "deny" | "always" | "project",
      message?: string,
      answers?: Record<string, string>,
    ) => post({ op: "permission", requestId, decision, message, answers }),
    interrupt: () => post({ op: "interrupt" }),
    setMode: (mode: ChatMode) => post({ op: "mode", mode }),
  };
}

/** Line diff (LCS) for showing edits; falls back to "all removed / all added" for huge inputs. */
export function lineDiff(before: string, after: string): { type: "same" | "del" | "add"; text: string }[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 250_000) {
    return [...a.map((text) => ({ type: "del" as const, text })), ...b.map((text) => ({ type: "add" as const, text }))];
  }
  // Longest-common-subsequence table, flattened: lcs(i, j) = table[i * width + j].
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  const lcs = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1));
    }
  }
  const out: { type: "same" | "del" | "add"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] ?? "" });
      i++;
      j++;
    } else if (lcs(i + 1, j) >= lcs(i, j + 1)) out.push({ type: "del", text: a[i++] ?? "" });
    else out.push({ type: "add", text: b[j++] ?? "" });
  }
  while (i < a.length) out.push({ type: "del", text: a[i++] ?? "" });
  while (j < b.length) out.push({ type: "add", text: b[j++] ?? "" });
  return out;
}
