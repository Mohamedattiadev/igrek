import { describe, expect, test } from "bun:test";
import type { ChatEvent, ChatInfo } from "@igrek/core";
import { reviewersFor, TurnReviews } from "./persona-review";

const info = { id: "c1", projectId: "p1", cwd: "/work", status: "idle", mode: "normal" } as ChatInfo;
const checkpoint: ChatEvent = { kind: "checkpoint", id: "cp", at: 0, checkpointId: "abc1234", projectId: "p1" };

function setup(on = true, extra: Partial<ChatInfo> = {}) {
  const added: ChatEvent[] = [];
  const asked: { personaId: string; question: string }[] = [];
  const reviews = new TurnReviews(
    () => on,
    { snapshot: () => ({ info: { ...info, ...extra }, events: [checkpoint] }), addEvent: (_, e) => added.push(e) },
    async (_, personaId, question) => {
      asked.push({ personaId, question });
      return { answer: `${personaId} looked` };
    },
    () => "+ hashed = md5(password)",
  );
  return { reviews, added, asked };
}

describe("expert review of sensitive changes", () => {
  test("files are matched to the expert of their field by name", () => {
    expect(reviewersFor(["src/auth/login.ts", "db/migrations/0002.sql", "README.md"])).toEqual([
      { expert: "security", topics: ["auth"], files: ["src/auth/login.ts"] },
      { expert: "database", topics: ["database"], files: ["db/migrations/0002.sql"] },
    ]);
    expect(reviewersFor(["src/billing/checkout.ts"])[0]?.expert).toBe("backend");
    expect(reviewersFor(["src/components/Button.tsx", "styles/session.css", "docs/auth.md"])).toEqual([]);
  });

  test("the expert reads the diff and its notes land in the chat as its card", async () => {
    const { reviews, added, asked } = setup();
    await reviews.turnEnded("c1", ["/work/src/auth.ts"]);
    expect(asked[0]?.personaId).toBe("security");
    expect(asked[0]?.question).toContain("md5(password)");
    const last = added.at(-1);
    expect(last?.kind === "tool" && last.status === "done" && last.result).toBe("security looked");
    expect(last?.kind === "tool" && (last.input as { question: string }).question).toBe("src/auth.ts");
  });

  test("off by default means no model call; a persona's own chat is not reviewed", async () => {
    const off = setup(false);
    await off.reviews.turnEnded("c1", ["/work/src/auth.ts"]);
    expect(off.asked).toEqual([]);
    const persona = setup(true, { persona: { id: "security", tools: "read" } });
    await persona.reviews.turnEnded("c1", ["/work/src/auth.ts"]);
    expect(persona.asked).toEqual([]);
  });
});
