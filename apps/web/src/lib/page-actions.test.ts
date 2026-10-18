import { describe, expect, test } from "bun:test";
import { matchesKeys, showKeys } from "./page-actions";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("page shortcuts", () => {
  test("Mod is Ctrl on Linux and Windows, Cmd on a Mac, and other keys must match exactly", () => {
    expect(matchesKeys(key(".", { ctrlKey: true }), "Mod+.", false)).toBe(true);
    expect(matchesKeys(key(".", { metaKey: true }), "Mod+.", true)).toBe(true);
    expect(matchesKeys(key(".", { metaKey: true }), "Mod+.", false)).toBe(false);
    expect(matchesKeys(key("d", { altKey: true }), "Alt+D", false)).toBe(true);
    expect(matchesKeys(key("d", { altKey: true, shiftKey: true }), "Alt+D", false)).toBe(false);
    expect(matchesKeys(key("d"), "Alt+D", false)).toBe(false);
  });

  test("shown with the word for this computer", () => {
    expect(showKeys("Mod+.", false)).toBe("Ctrl+.");
    expect(showKeys("Mod+.", true)).toBe("Cmd+.");
  });
});
