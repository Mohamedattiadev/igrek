import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatEvent } from "@igrek/core";
import type { ChatOp } from "./chats";
import { Sealer } from "./seal";
import { lastAnswer, Telegram } from "./telegram";

const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "telegram-"));
  const said: { chat_id: number; text: string }[] = [];
  const toChief: string[] = [];
  const answers: [string, string][] = [];
  let listener: (op: ChatOp) => void = () => undefined;
  let events: ChatEvent[] = [];
  const web = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url.endsWith("/getMe")) return Response.json({ ok: true, result: { username: "my_igrek_bot" } });
    if (url.endsWith("/sendMessage")) said.push(body);
    // Long polling waits until the test stops the bot.
    if (url.endsWith("/getUpdates"))
      await new Promise((_, fail) => init?.signal?.addEventListener("abort", () => fail(new Error("aborted"))));
    return Response.json({ ok: true, result: [] });
  };
  const telegram = new Telegram(
    dir,
    new Sealer(dir),
    {
      send: (text) => toChief.push(text),
      answer: (id, d) => answers.push([id, d]),
      listen: (l) => {
        listener = l;
        return () => undefined;
      },
      events: () => events,
    },
    () => [{ name: "iban", value: "TR330006100519786457841326" }],
    web,
  );
  return {
    telegram,
    said,
    toChief,
    answers,
    emit: (event: ChatEvent, all: ChatEvent[] = [event]) => {
      events = all;
      listener({ op: "upsert", seq: 1, event });
    },
  };
}

describe("telegram", () => {
  test("only the chat with the code shown in Igrek is paired; strangers get nothing", async () => {
    const { telegram, said, toChief } = setup();
    const status = await telegram.configure(TOKEN);
    expect(status).toMatchObject({ configured: true, bot: "my_igrek_bot", paired: false });
    await telegram.handle({ update_id: 1, message: { chat: { id: 9 }, text: "/start 000000" } });
    await telegram.handle({ update_id: 2, message: { chat: { id: 9 }, text: "hello" } });
    expect(said).toEqual([]);
    await telegram.handle({ update_id: 3, message: { chat: { id: 7 }, text: `/start ${status.pairCode}` } });
    expect(telegram.status().paired).toBe(true);
    await telegram.handle({ update_id: 4, message: { chat: { id: 9 }, text: "do something" } });
    await telegram.handle({ update_id: 5, message: { chat: { id: 7 }, text: "Fix the login" } });
    expect(toChief).toEqual(["Fix the login"]);
    telegram.stop();
  });

  test("answers and approvals reach the phone with private details hidden; /allow answers", async () => {
    const { telegram, said, answers, emit } = setup();
    const status = await telegram.configure(TOKEN);
    await telegram.handle({ update_id: 1, message: { chat: { id: 7 }, text: `/start ${status.pairCode}` } });
    said.length = 0;
    const text: ChatEvent = { kind: "text", id: "t", at: 1, text: "Your IBAN TR330006100519786457841326 is saved." };
    const result: ChatEvent = { kind: "result", id: "r", at: 2, isError: false };
    emit(result, [{ kind: "user", id: "u", at: 0, text: "hi", images: 0 }, text, result]);
    emit({
      kind: "permission",
      id: "p",
      requestId: "req-1",
      at: 3,
      toolName: "mcp__igrek__igrek_delegate",
      input: { project: "Shop" },
      status: "pending",
    });
    await Bun.sleep(20);
    expect(said[0]?.text).toBe("Your IBAN [[private:iban]] is saved.");
    expect(said[1]?.text).toContain("/allow_1");
    await telegram.handle({ update_id: 2, message: { chat: { id: 7 }, text: "/allow_1" } });
    expect(answers).toEqual([["req-1", "allow"]]);
    telegram.stop();
  });

  test("the last answer is the AI's words since the user's message", () => {
    expect(
      lastAnswer([
        { kind: "text", id: "a", at: 0, text: "old" },
        { kind: "user", id: "u", at: 1, text: "q", images: 0 },
        { kind: "text", id: "b", at: 2, text: "one" },
        { kind: "text", id: "c", at: 3, text: "two" },
      ]),
    ).toBe("one\n\ntwo");
  });
});
