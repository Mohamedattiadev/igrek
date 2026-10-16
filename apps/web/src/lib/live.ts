import type { IndexStatus, ServerMessage, TerminalInfo } from "@godeye/core";
import { type DependencyList, useEffect, useRef, useState } from "react";
import { api } from "./api";

const events = new EventTarget();

/** Called by the shell for every server message; pages subscribe below. */
export function dispatchServerMessage(message: ServerMessage): void {
  events.dispatchEvent(new CustomEvent(message.type, { detail: message }));
}

export function useServerEvent<T extends ServerMessage["type"]>(
  type: T,
  handler: (message: Extract<ServerMessage, { type: T }>) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: Event) => ref.current((event as CustomEvent).detail);
    events.addEventListener(type, listener);
    return () => events.removeEventListener(type, listener);
  }, [type]);
}

/**
 * Loads data and reloads it whenever the server says sessions changed,
 * optionally only when one of `projectIds` is affected.
 */
export function useLiveData<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  match?: (projectIds: string[], sessionIds: string[]) => boolean,
): { data?: T; error?: string; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const loader = useRef(load);
  loader.current = load;

  const reload = () => {
    loader
      .current()
      .then((value) => {
        setData(value);
        setError(undefined);
      })
      .catch((err: Error) => setError(err.message));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: callers pass their own deps
  useEffect(reload, deps);

  useServerEvent("sessions-changed", (message) => {
    if (!match || match(message.projectIds, message.sessionIds)) reload();
  });

  return { data, error, reload };
}

export function useIndexStatus(): IndexStatus | undefined {
  const [status, setStatus] = useState<IndexStatus>();
  useServerEvent("index", (message) => setStatus(message.status));
  return status;
}

/** Open terminals, kept current by the server's "terminals" events. */
export function useTerminals(): TerminalInfo[] {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  useEffect(() => {
    api
      .terminals()
      .then(setTerminals)
      .catch(() => undefined);
  }, []);
  useServerEvent("terminals", (message) => setTerminals(message.terminals));
  return terminals;
}
