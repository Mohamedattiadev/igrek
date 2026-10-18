import type { ChatEvent, ChatInfo, ChatMode } from "@godeye/core";
import { useCallback, useEffect, useRef, useState } from "react";

type ServerOp =
  | { op: "init"; info: ChatInfo; events: ChatEvent[] }
  | { op: "upsert"; event: ChatEvent }
  | { op: "info"; info: ChatInfo }
  | { op: "error"; error: string };

/** What a chat was about, kept in the browser so it can be picked up again after God Eye restarts. */
export interface KnownChat {
  projectId: string;
  sessionId?: string;
  title: string;
}
const KNOWN = "godeye.chats.known";

function readKnown(): Record<string, KnownChat> {
  try {
    return JSON.parse(localStorage.getItem(KNOWN) ?? "{}") as Record<string, KnownChat>;
  } catch {
    return {};
  }
}

function remember(info: ChatInfo): void {
  try {
    const all = readKnown();
    all[info.id] = { projectId: info.projectId, sessionId: info.sessionId, title: info.title };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 100))) delete all[k];
    localStorage.setItem(KNOWN, JSON.stringify(all));
  } catch {
    // Only a convenience.
  }
}

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
    let retry: ReturnType<typeof setTimeout> | undefined;
    setGone(undefined);
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/chat/${id}`);
      socket.current = ws;
      ws.onopen = () => {
        opened = true;
      };
      ws.onmessage = (message) => {
        const op = JSON.parse(message.data) as ServerOp;
        if (op.op === "init") {
          setInfo(op.info);
          setEvents(op.events);
          remember(op.info);
        } else if (op.op === "info") {
          setInfo(op.info);
          remember(op.info);
        } else if (op.op === "error") setError(op.error);
        else
          setEvents((list) => {
            const index = list.findIndex((e) => e.id === op.event.id);
            if (index < 0) return [...list, op.event];
            const next = list.slice();
            next[index] = op.event;
            return next;
          });
      };
      ws.onclose = () => {
        if (closed) return;
        // Never got in: ask whether the chat still exists before trying again.
        if (!opened)
          void fetch("/api/chats")
            .then((r) => (r.ok ? (r.json() as Promise<ChatInfo[]>) : undefined))
            .then((list) => {
              if (closed) return;
              if (list && !list.some((c) => c.id === id)) setGone(readKnown()[id] ?? true);
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
    send: (text: string, images: { mediaType: string; data: string }[] = []) => post({ op: "send", text, images }),
    answer: (requestId: string, decision: "allow" | "deny" | "always") =>
      post({ op: "permission", requestId, decision }),
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
