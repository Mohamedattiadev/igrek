import { describe, expect, test } from "bun:test";
import { keysOf, unusedKeys } from "./dead-keys";

describe("unused interface texts", () => {
  const tree = {
    files: { title: "Files", old: "Old" },
    servers: { tag_prod: "prod", tag_other: "other" },
    check: { readme: { title: "README" } },
    items_one: "{{count}} item",
    items_other: "{{count}} items",
  };

  test("written-out keys, prefixes and plural forms count as used; the rest is reported", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: sample source code the checker reads, as text
    const src = 't("files.title"); t(`servers.tag_${tag}`); t(`check.${id}.title`); t("items", { count });';
    expect(keysOf(tree)).toHaveLength(7);
    expect(unusedKeys(tree, src)).toEqual(["files.old"]);
  });

  test("a plain word counts as used when the text it replaces is used", () => {
    const plain = {
      files: { title: "Files", old: "Old" },
      plain: { files: { title: "Your files", old: "Older" }, gone: { title: "Nothing" } },
    };
    expect(unusedKeys(plain, 't("files.title");')).toEqual(["files.old", "plain.files.old", "plain.gone.title"]);
  });
});
