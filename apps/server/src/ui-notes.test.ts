import { describe, expect, test } from "bun:test";
import { openDb } from "./db";
import { cleanElement, UiNotes } from "./ui-notes";

describe("notes on a part of the screen (plan.md 19.5)", () => {
  test("a note keeps the element it is about; closed ones leave the list; a teammate's show too", () => {
    const { sqlite } = openDb(":memory:");
    sqlite.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'shop', '/tmp/shop', 1)").run();
    const notes = new UiNotes(sqlite);
    const element = { url: "/cart", selector: "main > button.pay", tag: "button", text: "Pay now" };
    const mine = notes.add("p", element, "Too small on a phone", "Ati");
    sqlite
      .query(
        `INSERT INTO comments (id, project_id, target_kind, target_id, author_id, author_name, text, mentions, at, read)
         VALUES ('k', 'p', 'ui', ?, 'u-kerim', 'Kerim', 'Wrong colour', '[]', ?, 0)`,
      )
      .run(JSON.stringify({ url: "igrek:/projects", selector: "h1", tag: "h1" }), Date.now() + 1);
    expect(notes.list("p").map((n) => [n.text, n.mine, n.author])).toEqual([
      ["Too small on a phone", true, "Ati"],
      ["Wrong colour", false, "Kerim"],
    ]);
    notes.close([mine]);
    expect(notes.list("p").map((n) => n.text)).toEqual(["Wrong colour"]);
  });

  test("only what describes the element is kept, cut to size; one without a selector is refused", () => {
    expect(cleanElement({ url: "/x", selector: "a", tag: "a", extra: 1, text: " " })).toEqual({
      url: "/x",
      selector: "a",
      tag: "a",
    });
    expect(cleanElement({ url: "/x", selector: "" })).toBeUndefined();
    expect(cleanElement({ url: "/x", selector: "x".repeat(900), tag: "div" })?.selector).toHaveLength(300);
  });
});
