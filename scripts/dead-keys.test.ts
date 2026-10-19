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
});
