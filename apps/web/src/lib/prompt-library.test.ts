import { describe, expect, test } from "bun:test";
import en from "@igrek/i18n/locales/en.json";
import tr from "@igrek/i18n/locales/tr.json";
import { duplicates, fill, PROMPT_CATEGORIES, PROMPT_LIBRARY, variables } from "./prompt-library";

const prompt = (id: string, title: string, body: string, uses = 0) => ({ id, title, body, uses });

describe("prompt library", () => {
  test("blanks are found once each and filled; empty ones stay visible", () => {
    expect(variables("Fix {file} then test {file} and {area}")).toEqual(["file", "area"]);
    expect(fill("Fix {file} in {area}", { file: "a.ts" })).toBe("Fix a.ts in {area}");
  });

  test("copies are found by title and text; the most used one is kept", () => {
    const list = [
      prompt("a", "Polite", "Thanks!", 1),
      prompt("b", "Polite", "Thanks!", 5),
      prompt("c", "Polite ", " Thanks!"),
      prompt("d", "Polite", "Thank you"),
    ];
    expect(duplicates(list).map((p) => p.id)).toEqual(["a", "c"]);
    expect(duplicates([prompt("x", "A", "B")])).toEqual([]);
  });

  test("every ready-made prompt has a title and a text in every language, with the same number of blanks", () => {
    const texts = [en.prompts, tr.prompts] as Record<string, string>[];
    for (const { id, category } of PROMPT_LIBRARY) {
      expect(PROMPT_CATEGORIES).toContain(category);
      for (const lang of texts) {
        expect(lang[`lib_${id}_title`], id).toBeString();
        expect(lang[`lib_${id}_body`]?.length ?? 0, id).toBeGreaterThan(40);
      }
      const [enBody = "", trBody = ""] = texts.map((lang) => lang[`lib_${id}_body`] ?? "");
      expect(variables(trBody).length, id).toBe(variables(enBody).length);
    }
    for (const category of PROMPT_CATEGORIES) expect(PROMPT_LIBRARY.some((p) => p.category === category)).toBe(true);
  });
});
