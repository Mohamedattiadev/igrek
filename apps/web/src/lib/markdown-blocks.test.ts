import { describe, expect, test } from "bun:test";
import { Lru } from "./lru";
import { healBlock, splitBlocks } from "./markdown-blocks";

describe("streamed markdown", () => {
  test("splits into top-level blocks that join back to the same text", () => {
    const text = "# Title\n\nFirst **para**.\n\n- a\n- b\n\n```ts\nconst x = 1;\n```\n\nLast";
    const blocks = splitBlocks(text);
    expect(blocks.length).toBe(5);
    expect(blocks.join("")).toBe(text);
    expect(blocks[3]).toStartWith("```ts");
  });

  test("a growing answer only changes its last block", () => {
    const a = splitBlocks("One.\n\nTwo is half");
    const b = splitBlocks("One.\n\nTwo is half written now");
    expect(b[0]).toBe(a[0] as string);
    expect(b[1]).not.toBe(a[1] as string);
  });

  test("closes half-written bold and inline code, leaves fences alone", () => {
    expect(healBlock("Use **bold")).toBe("Use **bold**");
    expect(healBlock("Run `npm i")).toBe("Run `npm i`");
    expect(healBlock("Done **ok** and `x`")).toBe("Done **ok** and `x`");
    expect(healBlock("```ts\nconst a = `x")).toBe("```ts\nconst a = `x");
  });

  test("the cache keeps what was read last", () => {
    const cache = new Lru<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(2);
  });
});
