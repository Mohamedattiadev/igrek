import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { Assist } from "./assist";
import { registerAssistRoutes } from "./assist-routes";
import { openDb } from "./db";
import { PrivateValues } from "./private-values";
import { Sealer } from "./seal";

// The privacy gateway can be off; a quick question must still keep saved details on this computer.
test("a quick question hides saved private details and the answer gets them back", async () => {
  const { sqlite } = openDb(":memory:");
  const privacy = new PrivateValues(sqlite, new Sealer(mkdtempSync(join(tmpdir(), "igrek-quick-"))));
  await privacy.ready;
  await privacy.save({ name: "maas", label: "Maaş", kind: "finance", value: "85.000 TL" });
  const asked: { question: string; history?: { q: string; a: string }[] }[] = [];
  const assist = {
    quickAsk: async (args: { question: string; history?: { q: string; a: string }[] }) => {
      asked.push(args);
      return { answer: "Yıllık [[private:maas]] x 12.", context: {} };
    },
  } as unknown as Assist;
  const app = new Hono();
  registerAssistRoutes(app, assist, privacy);

  const res = await app.request("/api/quick-ask", {
    method: "POST",
    body: JSON.stringify({ question: "Maaşım 85.000 TL, yıllık ne eder?", history: [{ q: "85.000 TL", a: "ok" }] }),
  });
  const body = (await res.json()) as { answer: string };

  const sent = asked[0];
  expect(sent?.question).not.toContain("85.000");
  expect(sent?.question).toContain("[[private:maas]]");
  expect(sent?.history?.[0]?.q).toBe("[[private:maas]]");
  expect(body.answer).toBe("Yıllık 85.000 TL x 12.");
});

test("a quick question can hide a figure for itself only, without saving it", async () => {
  const { sqlite } = openDb(":memory:");
  const privacy = new PrivateValues(sqlite, new Sealer(mkdtempSync(join(tmpdir(), "igrek-quickonce-"))));
  await privacy.ready;
  const asked: string[] = [];
  const assist = {
    quickAsk: async (args: { question: string }) => {
      asked.push(args.question);
      return { answer: "Kâr [[private:amount_1]] çeyrekte.", context: {} };
    },
  } as unknown as Assist;
  const app = new Hono();
  registerAssistRoutes(app, assist, privacy);
  const res = await app.request("/api/quick-ask", {
    method: "POST",
    body: JSON.stringify({ question: "Çeyrek kârı 2,4 milyon", hideOnce: [{ kind: "amount", value: "2,4 milyon" }] }),
  });
  expect(asked[0]).toContain("[[private:amount_1]]");
  expect(asked[0]).not.toContain("2,4 milyon");
  expect(((await res.json()) as { answer: string }).answer).toBe("Kâr 2,4 milyon çeyrekte.");
  expect(privacy.list()).toEqual([]);
});
