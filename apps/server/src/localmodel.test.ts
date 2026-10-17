import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StopRegistry } from "./bus";
import { ollamaModels } from "./localmodel";
import { localModel, runClaude } from "./summarizer";

const asked: string[] = [];
const ollama = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/tags") return Response.json({ models: [{ name: "qwen2.5:7b" }] });
    if (url.pathname === "/api/chat") {
      const body = (await req.json()) as { model: string; messages: { role: string; content: string }[] };
      asked.push(`${body.model}:${body.messages.at(-1)?.content}`);
      return Response.json({ message: { role: "assistant", content: "local answer" } });
    }
    return new Response("no", { status: 404 });
  },
});
const config = { url: `http://localhost:${ollama.port}`, model: "qwen2.5:7b" };
const original = process.env.PATH;
afterAll(() => {
  ollama.stop();
  process.env.PATH = original;
  localModel.pick = () => undefined;
  localModel.limitedUntil = 0;
});

describe("local model", () => {
  test("lists models; small jobs go to Ollama when set to always", async () => {
    expect(await ollamaModels(config.url)).toEqual({ running: true, models: ["qwen2.5:7b"] });
    expect((await ollamaModels("http://localhost:1")).running).toBe(false);
    localModel.pick = () => config;
    expect(await runClaude("Summarize this", tmpdir(), new StopRegistry(), "haiku")).toBe("local answer");
    expect(asked).toEqual(["qwen2.5:7b:Summarize this"]);
  });

  test("when Claude says the limit is full, the small job finishes locally and later ones go local for a while", async () => {
    // A fake `claude` that answers like a full limit.
    const bin = mkdtempSync(join(tmpdir(), "godeye-fakeclaude-"));
    writeFileSync(
      join(bin, "claude"),
      `#!/bin/sh\necho '{"type":"result","is_error":true,"result":"Claude AI usage limit reached|1800000000"}'\nexit 1\n`,
    );
    chmodSync(join(bin, "claude"), 0o755);
    process.env.PATH = `${bin}:${original}`;
    localModel.pick = (limited) => (limited ? config : undefined);
    localModel.limitedUntil = 0;
    asked.length = 0;
    expect(await runClaude("Sort these", tmpdir(), new StopRegistry(), "haiku")).toBe("local answer");
    expect(localModel.limitedUntil).toBeGreaterThan(Date.now());
    expect(await runClaude("Next one", tmpdir(), new StopRegistry(), "haiku")).toBe("local answer");
    expect(asked).toEqual(["qwen2.5:7b:Sort these", "qwen2.5:7b:Next one"]);
    // Bigger models (coding, personas) never go local.
    await expect(runClaude("Write code", tmpdir(), new StopRegistry(), "sonnet")).rejects.toThrow(/limit/);
  });
});
