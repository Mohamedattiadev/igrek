/// <reference lib="webworker" />
import type { InsightConfig, ToolResult } from "@godeye/core";
import { apiMap } from "./apis";
import { scoreCategories } from "./checks";
import { diagrams } from "./diagram";
import { takeSnapshot } from "./snapshot";

/** Scans run here so a big repository never freezes terminals and chats. */
declare const self: Worker;
self.onmessage = (event: MessageEvent<{ id: number; root: string; config?: InsightConfig; tools?: ToolResult[] }>) => {
  try {
    const snap = takeSnapshot(event.data.root);
    const { categories, overall, catalog } = scoreCategories(snap, {
      config: event.data.config,
      tools: event.data.tools,
    });
    self.postMessage({
      id: event.data.id,
      ok: true,
      categories,
      overall,
      catalog,
      diagrams: diagrams(snap),
      apis: apiMap(snap),
      fileCount: snap.files.length,
    });
  } catch (err) {
    self.postMessage({ id: event.data.id, ok: false, error: (err as Error).message });
  }
};
