import { describe, expect, test } from "bun:test";
import type { ChatEvent } from "@igrek/core";
import { madeFiles } from "./made-files";

const tool = (input: unknown, result?: string): ChatEvent => ({
  kind: "tool",
  id: Math.random().toString(),
  at: 1,
  name: "Bash",
  input,
  status: "done",
  result,
});

describe("madeFiles", () => {
  test("finds the files a chat made, from steps and answers, newest first", () => {
    const events: ChatEvent[] = [
      tool({ file_path: "/home/me/shop/logo.png" }),
      tool({ command: "python make.py -o out/report.pdf" }),
      { kind: "text", id: "a", at: 2, text: "I saved the chart as `chart.svg` and the report at out/report.pdf." },
    ];
    expect(madeFiles(events, "/home/me/shop")).toEqual([
      "/home/me/shop/out/report.pdf",
      "/home/me/shop/chart.svg",
      "/home/me/shop/logo.png",
    ]);
  });

  test("leaves out web addresses and other kinds of files", () => {
    const events: ChatEvent[] = [
      { kind: "text", id: "a", at: 2, text: "See https://example.com/a.png and src/index.ts" },
    ];
    expect(madeFiles(events, "/p")).toEqual([]);
  });
});
