import { describe, expect, test } from "bun:test";
import { guessLang } from "./highlight";

describe("a code block that names no language", () => {
  test("gets one from how it starts, or stays plain", () => {
    expect(guessLang("docker exec -i db psql -U poultry -d app < /tmp/fix.sql")).toBe("sh");
    expect(guessLang("$ bun test")).toBe("sh");
    expect(guessLang("SELECT count(*) FROM cards_with_weight;")).toBe("sql");
    expect(guessLang('{"ok": true}')).toBe("json");
    expect(guessLang("export const answer = 42;")).toBe("ts");
    expect(guessLang("def main():\n    pass")).toBe("py");
    expect(guessLang("Just a sentence.")).toBeUndefined();
  });
});
