import { afterAll, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkTools } from "./system";

const bin = mkdtempSync(join(tmpdir(), "igrek-tools-"));
const path = process.env.PATH;
afterAll(() => {
  process.env.PATH = path;
  rmSync(bin, { recursive: true, force: true });
});

function tool(name: string, script: string): void {
  writeFileSync(join(bin, name), `#!/bin/sh\n${script}\n`);
  chmodSync(join(bin, name), 0o755);
}

test("a tool that is there but cannot start is shown as broken, with its error", async () => {
  // Seen in the AppImage: codex was on PATH, but its version command died with a library error.
  tool("codex", 'echo "node: symbol lookup error: node: undefined symbol: BrotliDecoderVersion" >&2; exit 127');
  tool("git", "echo git version 2.55.0");
  process.env.PATH = bin;
  const tools = await checkTools(true);
  const codex = tools.find((t) => t.id === "codex");
  expect(codex).toMatchObject({ found: true, broken: true });
  expect(codex?.version).toContain("symbol lookup error");
  expect(tools.find((t) => t.id === "git")).toEqual({
    id: "git",
    found: true,
    version: "git version 2.55.0",
    required: true,
  });
  expect(tools.find((t) => t.id === "gemini")?.found).toBe(false);
});
