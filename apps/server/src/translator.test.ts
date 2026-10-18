import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { Settings } from "@igrek/core";
import { migrate } from "./db";
import { Translator } from "./translator";

describe("translating teammates' notes", () => {
  test("translated once, then served from the cache; off unless asked when background AI is off", async () => {
    const db = new Database(":memory:");
    migrate(db);
    let calls = 0;
    let auto = true;
    const tr = new Translator(
      db,
      () => ({ autoSummarize: auto }) as Settings,
      "/tmp",
      async (prompt) => {
        calls++;
        const list = JSON.parse(prompt.slice(prompt.indexOf("\n["))) as string[];
        return JSON.stringify(list.map((t) => `TR: ${t}`));
      },
    );
    expect(await tr.translate(["Bruk Postgres", "Penger i øre"], "tr")).toEqual([
      "TR: Bruk Postgres",
      "TR: Penger i øre",
    ]);
    expect(await tr.translate(["Penger i øre"], "tr")).toEqual(["TR: Penger i øre"]);
    expect(calls).toBe(1);
    auto = false;
    expect(await tr.translate(["Ny tekst"], "tr")).toEqual([undefined]);
    expect(await tr.translate(["Ny tekst"], "tr", true)).toEqual(["TR: Ny tekst"]);
    expect(calls).toBe(2);
  });
});
