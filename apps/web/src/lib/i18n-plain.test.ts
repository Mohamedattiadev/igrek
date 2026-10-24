import { describe, expect, test } from "bun:test";
import tr from "@igrek/i18n/locales/tr.json";
import i18n, { setPlainWords } from "./i18n";

describe("the Simple view's plain words", () => {
  test("replace the usual texts and give them back, in English and the shown language", async () => {
    i18n.addResourceBundle("tr", "translation", tr, true, true);
    await i18n.changeLanguage("en");
    expect(i18n.t("project.branch")).toBe("Branch");
    expect(i18n.t("trust.mcp", { count: 2 })).toBe("2 MCP servers");

    setPlainWords(true);
    expect(i18n.t("project.branch")).toBe("Line of work");
    expect(i18n.t("trust.mcp", { count: 2 })).toBe("2 connected tools");
    expect(i18n.t("project.sessions")).toBe("Chats");
    // Texts without a plain word stay as they are.
    expect(i18n.t("nav.settings")).toBe("Settings");

    setPlainWords(false);
    expect(i18n.t("project.branch")).toBe("Branch");
    expect(i18n.t("project.sessions")).toBe("Sessions");

    await i18n.changeLanguage("tr");
    setPlainWords(true);
    expect(i18n.t("project.lastCommit")).toBe("Son kayıt");
    setPlainWords(false);
    expect(i18n.t("project.lastCommit")).toBe("Son commit");
  });

  test("every plain word has a text to replace, in both hand-checked languages", () => {
    const leaves = (tree: object, prefix = ""): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === "string" ? [`${prefix}${k}`] : leaves(v as object, `${prefix}${k}.`),
      );
    for (const code of ["en", "tr"]) {
      const plain = i18n.getResource(code, "translation", "plain") as object;
      for (const key of leaves(plain))
        expect([code, key, typeof i18n.getResource(code, "translation", key)]).toEqual([code, key, "string"]);
    }
  });
});
