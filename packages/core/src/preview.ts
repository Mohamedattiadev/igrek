/** Live preview and pick-and-change (plan.md Faz 10). */

export interface DevServerInfo {
  projectId: string;
  /** package.json script it runs ("dev"), or the direct command God Eye chose. */
  script: string;
  command: string;
  status: "starting" | "running" | "stopped" | "failed";
  /** Where the app itself answers. */
  url?: string;
  /** God Eye's local proxy in front of it: the same app with the picker script added. */
  previewUrl?: string;
  /** Elements carry their file and line (God Eye's Vite plugin, added without touching your config). */
  sourceMap: boolean;
  framework?: "vite" | "next" | "other";
  startedAt: number;
  exitCode?: number;
  error?: string;
}

/** What the picker reports about the element you clicked. */
export interface PickedElement {
  tag: string;
  id?: string;
  classes: string[];
  text: string;
  /** "src/components/Button.tsx:12:7" when known. */
  source?: string;
  selector: string;
  html: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  /** Page it was picked on. */
  url: string;
}

export interface PreviewError {
  kind: "console" | "error" | "promise" | "network";
  message: string;
  url?: string;
  status?: number;
  stack?: string;
  at: number;
}

export interface QuickEdit {
  ok: boolean;
  summary: string;
  ms: number;
  checkpointId?: string;
  /** Screenshots of the element before and after (served by God Eye). */
  before?: string;
  after?: string;
  error?: string;
}

export interface VisualCheck {
  /** Viewport name → share of pixels that changed (0–1) and the diff image. */
  sizes: { name: "desktop" | "tablet" | "phone"; changed: number; baseline?: string; current: string; diff?: string }[];
  at: number;
  baselineAt?: number;
}
