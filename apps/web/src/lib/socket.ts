import type { ServerMessage } from "@igrek/core";
import { useEffect, useRef, useState } from "react";

export type SocketStatus = "connecting" | "connected" | "offline";

/** Keeps one WebSocket open to the server, reconnecting with backoff. */
export function useServerSocket(onMessage: (message: ServerMessage) => void): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      setStatus(retry === 0 ? "connecting" : "offline");
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      socket.onopen = () => {
        retry = 0;
        setStatus("connected");
      };
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(event.data));
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setStatus("offline");
        retry++;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry, 15_000));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return status;
}
