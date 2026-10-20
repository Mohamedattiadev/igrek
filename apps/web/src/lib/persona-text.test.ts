import { describe, expect, test } from "bun:test";
import { BUILTIN_PERSONAS } from "@igrek/core";
import tr from "@igrek/i18n/personas/tr.json";

/** The profile parts the expert page shows as text (the timeline, books and rules stay as written). */
const shown = BUILTIN_PERSONAS.flatMap(({ profile: p }) => [
  p.bio,
  p.style,
  ...(p.mastery ?? []),
  ...(p.decisions ?? []),
  ...p.checklist,
  ...p.pitfalls,
]).filter(Boolean);

describe("Turkish expert profiles", () => {
  test("every sentence the expert page shows has a Turkish one", () => {
    const table = tr as Record<string, string>;
    expect(shown.filter((text) => !table[text])).toEqual([]);
  });

  test("no sentence is left over from an English text that changed", () => {
    const now = new Set(shown);
    expect(Object.keys(tr).filter((text) => !now.has(text))).toEqual([]);
  });
});
