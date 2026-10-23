import { expect, test } from "bun:test";
import { validatePatch } from "./settings";

test("private file patterns are kept tidy, and one that could break the AI's rule is refused", () => {
  expect(validatePatch({ privateFiles: [" bordro*.pdf ", "", "bordro*.pdf", "finans/*.xlsx"] })).toEqual({
    patch: { privateFiles: ["bordro*.pdf", "finans/*.xlsx"] },
  });
  // The pattern goes inside Read(...): a bracket would end the rule early and drop the rest.
  expect(validatePatch({ privateFiles: ["a) Read(**"] })).toHaveProperty("error");
  expect(validatePatch({ privateFiles: "bordro.pdf" })).toHaveProperty("error");
});
