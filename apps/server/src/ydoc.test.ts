import { describe, expect, test } from "bun:test";
import { mergeText, saveText } from "./ydoc";

const page = "# Deploy\n\nStep one: build.\n\nStep two: copy.\n\nStep three: restart.";

describe("shared wiki text (Yjs)", () => {
  test("two people editing different parts at the same time keep both changes", () => {
    const start = saveText(null, "", page);
    const ayse = saveText(start.state, start.text, page.replace("build.", "build with bun run build."));
    const kerem = saveText(start.state, start.text, page.replace("restart.", "restart and check /health."));
    const atAyse = mergeText(ayse.state, ayse.text, { state: kerem.state, text: kerem.text });
    const atKerem = mergeText(kerem.state, kerem.text, { state: ayse.state, text: ayse.text });
    expect(atAyse.text).toBe(atKerem.text);
    expect(atAyse.text).toContain("build with bun run build.");
    expect(atAyse.text).toContain("restart and check /health.");
  });

  test("two devices turning the same existing page into a document do not repeat its text", () => {
    // Both had the page as plain text before pages merged.
    const ayse = saveText(null, page, `${page}\n\nAyse's note.`);
    const merged = mergeText(null, page, { state: ayse.state, text: ayse.text });
    expect(merged.text).toBe(`${page}\n\nAyse's note.`);
  });

  test("plain text from an older Igrek is taken as an edit, keeping the history", () => {
    const mine = saveText(null, "", page);
    const fromOld = mergeText(mine.state, mine.text, { text: page.replace("copy.", "rsync.") });
    expect(fromOld.text).toBe(page.replace("copy.", "rsync."));
    // Later edits on top of it still merge with a teammate's state.
    const next = saveText(fromOld.state, fromOld.text, `${fromOld.text}\n\nDone.`);
    expect(next.text.endsWith("Done.")).toBe(true);
  });

  test("applying the same state twice changes nothing", () => {
    const a = saveText(null, "", page);
    const once = mergeText(a.state, a.text, { state: a.state, text: a.text });
    const twice = mergeText(once.state, once.text, { state: a.state, text: a.text });
    expect(twice.text).toBe(page);
  });
});
