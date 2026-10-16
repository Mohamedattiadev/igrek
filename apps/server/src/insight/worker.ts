/// <reference lib="webworker" />
import { scoreCategories } from "./checks";
import { diagrams } from "./diagram";
import { takeSnapshot } from "./snapshot";

/** Scans run here so a big repository never freezes terminals and chats. */
declare const self: Worker;
self.onmessage = (event: MessageEvent<{ id: number; root: string }>) => {
  try {
    const snap = takeSnapshot(event.data.root);
    const { categories, overall } = scoreCategories(snap);
    self.postMessage({
      id: event.data.id,
      ok: true,
      categories,
      overall,
      diagrams: diagrams(snap),
      fileCount: snap.files.length,
    });
  } catch (err) {
    self.postMessage({ id: event.data.id, ok: false, error: (err as Error).message });
  }
};
