import { describe, expect, test } from "bun:test";
import { filterMentions, insertMention, type MentionItem, mentionQuery } from "./mention";

const items: MentionItem[] = [
  { id: "backend-senior", name: "Backend Senior", role: "APIs and databases" },
  { id: "security", name: "Güvenlik uzmanı", role: "Threats and secrets" },
  { id: "ux", name: "UX Designer", role: "Flows and backend-free prototypes" },
  { id: "dba", name: "Database Admin", role: "Indexes" },
];

describe("@ mentions", () => {
  test("a mention is found only at the start or after a space", () => {
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("ask @back", 9)).toEqual({ start: 4, query: "back" });
    expect(mentionQuery("line\n@ux", 8)).toEqual({ start: 5, query: "ux" });
    expect(mentionQuery("me@mail.com", 11)).toBeUndefined();
    expect(mentionQuery("ask @back now", 13)).toBeUndefined();
    expect(mentionQuery("no mention", 10)).toBeUndefined();
  });

  test("the caret decides which word is being typed", () => {
    expect(mentionQuery("@ux then more", 3)).toEqual({ start: 0, query: "ux" });
    expect(mentionQuery("@ux then more", 8)).toBeUndefined();
  });

  test("an empty query lists everyone up to the limit", () => {
    expect(filterMentions(items, "")).toHaveLength(4);
    expect(filterMentions(items, "", 2)).toHaveLength(2);
  });

  test("id, name and role match, accents and case aside", () => {
    expect(filterMentions(items, "guven").map((i) => i.id)).toEqual(["security"]);
    expect(filterMentions(items, "SECRET").map((i) => i.id)).toEqual(["security"]);
    expect(filterMentions(items, "zzz")).toEqual([]);
  });

  test("matches at the start of the id or name come first", () => {
    expect(filterMentions(items, "back").map((i) => i.id)).toEqual(["backend-senior", "ux"]);
    expect(filterMentions(items, "data").map((i) => i.id)).toEqual(["dba", "backend-senior"]);
  });

  test("picking replaces the typed word and leaves a space", () => {
    expect(insertMention("ask @ba", { start: 4, caret: 7 }, "backend-senior")).toEqual({
      text: "ask @backend-senior ",
      caret: 20,
    });
    expect(insertMention("@ux and more", { start: 0, caret: 2 }, "ux")).toEqual({ text: "@ux and more", caret: 4 });
    expect(insertMention("@", { start: 0, caret: 1 }, "dba")).toEqual({ text: "@dba ", caret: 5 });
  });
});
