/** App-wide actions any component can trigger (opening panels with context). */
export interface QuickAskRequest {
  question?: string;
  attachment?: { name: string; text: string };
}

/** "Prepare a prompt for this code" from the editor. */
export interface EnhanceCodeRequest {
  file: string;
  selection?: string;
  startLine?: number;
  endLine?: number;
}

/** "What is this?" on selected code: the matching cheatsheet items. */
export interface WhatIsRequest {
  code: string;
  /** Monaco's language id of the file. */
  fileLang?: string;
}

const target = new EventTarget();

export const actions = {
  quickAsk(request: QuickAskRequest = {}): void {
    target.dispatchEvent(new CustomEvent("quick-ask", { detail: request }));
  },
  captureIdea(): void {
    target.dispatchEvent(new CustomEvent("capture-idea"));
  },
  enhanceCode(request: EnhanceCodeRequest): void {
    target.dispatchEvent(new CustomEvent("enhance-code", { detail: request }));
  },
  onEnhanceCode(handler: (detail: EnhanceCodeRequest) => void): () => void {
    const listener = (event: Event) => handler((event as CustomEvent).detail);
    target.addEventListener("enhance-code", listener);
    return () => target.removeEventListener("enhance-code", listener);
  },
  whatIs(request: WhatIsRequest): void {
    target.dispatchEvent(new CustomEvent("what-is", { detail: request }));
  },
  onWhatIs(handler: (detail: WhatIsRequest) => void): () => void {
    const listener = (event: Event) => handler((event as CustomEvent).detail);
    target.addEventListener("what-is", listener);
    return () => target.removeEventListener("what-is", listener);
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
