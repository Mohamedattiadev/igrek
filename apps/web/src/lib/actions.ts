/** App-wide actions any component can trigger (opening panels with context). */
export interface QuickAskRequest {
  question?: string;
  attachment?: { name: string; text: string };
}

const target = new EventTarget();

export const actions = {
  quickAsk(request: QuickAskRequest = {}): void {
    target.dispatchEvent(new CustomEvent("quick-ask", { detail: request }));
  },
  captureIdea(): void {
    target.dispatchEvent(new CustomEvent("capture-idea"));
  },
  on(type: "quick-ask" | "capture-idea", handler: (detail: QuickAskRequest) => void): () => void {
    const listener = (event: Event) => handler((event as CustomEvent).detail ?? {});
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  },
};

/** Project / session / terminal the user is looking at, read from the URL. */
export function contextFromPath(path: string): { projectId?: string; sessionId?: string; terminalId?: string } {
  const project = path.match(/^\/p\/([^/?]+)(?:\/s\/([^/?]+))?/);
  if (project) return { projectId: project[1], sessionId: project[2] };
  const terminal = path.match(/^\/t\/([^/?]+)/);
  return terminal ? { terminalId: terminal[1] } : {};
}
