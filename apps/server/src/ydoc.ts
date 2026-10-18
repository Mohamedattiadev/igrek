import * as Y from "yjs";

/**
 * Shared text that merges instead of overwriting (plan.md 4.1, Yjs CRDT): two people editing the
 * same wiki page at once both keep their changes. A page's whole Yjs state travels with it (base64);
 * applying a state twice, or in any order, gives the same text, so sync needs no ordering.
 */

/** Edits from a seed made before a page had a Yjs state carry this client id on every device. */
const SEED_CLIENT = 1;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));

/**
 * A page's document: from its stored state, or seeded from its text. The seed always gets the same
 * client id, so two devices that turn the same existing page into a document make identical items
 * and merging them later does not repeat the text.
 */
function load(state: string | null | undefined, text: string): Y.Doc {
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, unb64(state));
  else if (text) {
    const seed = new Y.Doc();
    seed.clientID = SEED_CLIENT;
    seed.getText("body").insert(0, text);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
  }
  return doc;
}

/** Turns "the text is now `next`" into the smallest edit: keep the common start and end, replace the middle. */
function edit(doc: Y.Doc, next: string): void {
  const body = doc.getText("body");
  const now = body.toString();
  if (now === next) return;
  let start = 0;
  while (start < now.length && start < next.length && now[start] === next[start]) start++;
  let end = 0;
  while (
    end < now.length - start &&
    end < next.length - start &&
    now[now.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  doc.transact(() => {
    body.delete(start, now.length - start - end);
    body.insert(start, next.slice(start, next.length - end));
  });
}

/** The user saved the page: record the change as an edit, return the new state and the text. */
export function saveText(
  state: string | null | undefined,
  current: string,
  next: string,
): { state: string; text: string } {
  const doc = load(state, current);
  edit(doc, next);
  return { state: b64(Y.encodeStateAsUpdate(doc)), text: doc.getText("body").toString() };
}

/**
 * A teammate's version arrived. With a Yjs state both sides' edits merge; from an older Igrek
 * (plain text only) the text is applied as an edit, so the local history is not thrown away.
 */
export function mergeText(
  local: string | null | undefined,
  localText: string,
  remote: { state?: string; text: string },
): { state: string; text: string } {
  const doc = load(local, localText);
  if (remote.state) Y.applyUpdate(doc, unb64(remote.state));
  else edit(doc, remote.text);
  return { state: b64(Y.encodeStateAsUpdate(doc)), text: doc.getText("body").toString() };
}
