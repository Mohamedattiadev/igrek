import type {
  Account,
  Approval,
  ChatInfo,
  IndexStatus,
  ProjectListItem,
  ServerMessage,
  TerminalInfo,
} from "@igrek/core";
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
 * A reload that coalesces (plan.md 19.10): calls within `wait` ms become one, and while one runs,
 * the calls that arrive make exactly one more run after it, never a pile of them. Events come in
 * bursts while a chat writes; each used to reload the whole list again.
 */
export function coalesce(run: () => Promise<unknown>, wait = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let again = false;
  const go = () => {
    timer = undefined;
    if (running) {
      again = true;
      return;
    }
    running = true;
    void run()
      .catch(() => undefined)
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          go();
        }
      });
  };
  return () => {
    if (!timer) timer = setTimeout(go, wait);
  };
}

/** `coalesce` for a component: the latest `run` is used, the trigger stays the same. */
export function useCoalesced(run: () => unknown, wait = 250): () => void {
  const latest = useRef(run);
  latest.current = run;
  const [trigger] = useState(() => coalesce(async () => latest.current(), wait));
  return trigger;
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

  // A burst of changes (a chat writing) is one reload, not one per change.
  const soon = useCoalesced(
    () =>
      loader
        .current()
        .then((value) => {
          setData(value);
          setError(undefined);
        })
        .catch((err: Error) => setError(err.message)),
    300,
  );
  useServerEvent("sessions-changed", (message) => {
    if (!match || match(message.projectIds, message.sessionIds)) soon();
  });

  return { data, error, reload };
}

export function useIndexStatus(): IndexStatus | undefined {
  const [status, setStatus] = useState<IndexStatus>();
  useServerEvent("index", (message) => setStatus(message.status));
  return status;
}

/** How many things the emergency stop would stop now, kept current by the server. */
export function useStoppable(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    api
      .stoppable()
      .then((r) => setCount(r.count))
      .catch(() => undefined);
  }, []);
  useServerEvent("stoppable", (message) => setCount(message.count));
  return count;
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

/** AI requests waiting for the user's approval (server commands for now). */
export function useApprovals(): Approval[] {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  useEffect(() => {
    api
      .approvals()
      .then(setApprovals)
      .catch(() => undefined);
  }, []);
  useServerEvent("approvals", (message) => setApprovals(message.approvals));
  return approvals;
}

/** Open chats, kept current by the server's "chats" events. */
export function useChats(): ChatInfo[] {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  useEffect(() => {
    api
      .chats()
      .then(setChats)
      .catch(() => undefined);
  }, []);
  useServerEvent("chats", (message) => setChats(message.chats));
  return chats;
}

/** Accounts with their latest limit reading; refreshed when accounts or limits change. */
export function useAccounts(): Account[] {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const load = () => {
    api
      .accounts()
      .then(setAccounts)
      .catch(() => undefined);
  };
  useEffect(load, []);
  useServerEvent("accounts-changed", load);
  useServerEvent("limits-changed", load);
  return accounts;
}

export function useProjects(): ProjectListItem[] {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  useEffect(() => {
    api
      .projects()
      .then((list) => setProjects(list.filter((p) => !p.hidden)))
      .catch(() => undefined);
  }, []);
  return projects;
}
