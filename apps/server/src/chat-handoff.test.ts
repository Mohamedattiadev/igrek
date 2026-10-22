import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@igrek/core";
import { chatHandoffPrompt } from "./chat-handoff";

const events: ChatEvent[] = [
  { kind: "user", id: "u1", at: 1, text: "Add a cart page; my IBAN is TR330006100519786457841326", images: 0 },
  { kind: "tool", id: "t1", at: 2, name: "Edit", input: { file_path: "src/cart.tsx" }, status: "done" },
  { kind: "tool", id: "t2", at: 3, name: "Read", input: { file_path: "src/other.ts" }, status: "done" },
  { kind: "text", id: "a1", at: 4, text: "The cart page is half done." },
];

describe("chatHandoffPrompt", () => {
  test("tells Codex what was asked, the last answer and the edited files", () => {
    const prompt = chatHandoffPrompt({ title: "Cart", branch: "igrek/cart" }, events);
    expect(prompt).toContain('("Cart")');
    expect(prompt).toContain("- Add a cart page");
    expect(prompt).toContain("The cart page is half done.");
    expect(prompt).toContain("- src/cart.tsx");
    expect(prompt).not.toContain("src/other.ts");
    expect(prompt).toContain("Branch: igrek/cart");
  });

  test("private values stay out, and Codex is told why", () => {
    const prompt = chatHandoffPrompt({ title: "Cart" }, events, [
      { name: "iban", value: "TR330006100519786457841326" },
    ]);
    expect(prompt).not.toContain("TR330006100519786457841326");
    expect(prompt).toContain("[[private:iban]]");
    expect(prompt).toContain("Never guess them");
  });
});
