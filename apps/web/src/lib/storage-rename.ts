/**
 * Igrek was called God Eye until 2026-10-18, and this browser may still hold its settings
 * under the old names (godeye.zen, godeye.panel.chat, ...). They are copied to the new names
 * once, before the app reads them; a value already saved under the new name wins.
 */
type KeyStore = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

const DONE = "igrek.renamed";

export function copyOldKeys(storage: KeyStore): number {
  if (storage.getItem(DONE)) return 0;
  const old: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith("godeye")) old.push(key);
  }
  let copied = 0;
  for (const key of old) {
    const next = `igrek${key.slice("godeye".length)}`;
    const value = storage.getItem(key);
    if (value === null || storage.getItem(next) !== null) continue;
    storage.setItem(next, value);
    copied++;
  }
  storage.setItem(DONE, "1");
  return copied;
}

export function renameStoredKeys(): void {
  try {
    copyOldKeys(localStorage);
  } catch {
    // Storage blocked (private window): there is nothing old to keep.
  }
}
