import { describe, expect, test } from "bun:test";
import { reportUiHint, SCHEMAS } from "./index";

describe("report UI hint", () => {
  test("teaches every Igrek component, positionally, inside Markdown", () => {
    const hint = reportUiHint();
    for (const name of Object.keys(SCHEMAS)) expect(hint).toContain(`${name}(`);
    expect(hint).toContain("```openui-lang");
    // Buttons can ask the assistant a follow-up.
    expect(hint).toContain("ActionExpression");
    expect(hint).toContain("@ToAssistant");
    expect(hint).toStartWith("You write a report in Markdown.");
    // About a thousand tokens: cheap enough to add to a weekly report.
    expect(hint.length).toBeLessThan(6000);
  });
});
