import { expect, test } from "bun:test";
import { WRITING_STYLE } from "@igrek/core";
import { withWriting } from "./summarizer";

test("every small job gets the writing rules, added to its own system prompt when it has one", () => {
  expect(withWriting(["--tools", ""])).toEqual(["--tools", "", "--append-system-prompt", WRITING_STYLE]);
  const own = withWriting(["--append-system-prompt", "You review code.", "--model", "x"]);
  expect(own[1]).toBe(`You review code.\n\n${WRITING_STYLE}`);
  expect(own.slice(2)).toEqual(["--model", "x"]);
  // Both languages the user writes in are covered.
  expect(WRITING_STYLE).toContain("Turkish:");
  expect(WRITING_STYLE).toContain("English:");
});
