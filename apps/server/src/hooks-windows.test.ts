import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeHookScript } from "./hooks";

describe("hooks on Windows", () => {
  test("a Bun script stands in for sh and curl, and forwards the payload with the session key", async () => {
    const seen: { path: string; cookie: string | null; body: string }[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ path: new URL(req.url).pathname, cookie: req.headers.get("cookie"), body: await req.text() });
        return new Response("context for claude");
      },
    });
    const dataDir = mkdtempSync(join(tmpdir(), "igrek-hook-"));
    writeFileSync(join(dataDir, "session.key"), "k1\n");
    const command = writeHookScript(dataDir, server.port ?? 0, "win32");
    const [, script] = command.match(/^"[^"]+" "([^"]+)"$/) ?? [];
    expect(script).toContain("igrek-hook.mjs");
    const proc = Bun.spawn([process.execPath, script ?? "", "session-start"], {
      stdin: new TextEncoder().encode('{"session_id":"s1"}'),
      stdout: "pipe",
      env: { PATH: process.env.PATH ?? "" },
    });
    expect(await new Response(proc.stdout).text()).toBe("context for claude");
    expect(seen).toEqual([
      { path: "/api/hooks/session-start", cookie: "igrek_session=k1", body: '{"session_id":"s1"}' },
    ]);
    server.stop(true);
  });
});
