import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";
import type { Terminals } from "./terminals";

/**
 * REA, "Reverse Engineer Anything" (github.com/morluto/rea, MIT): an MCP server that lets the AI look
 * inside apps, binaries and websites the user is allowed to examine. Igrek sets it up in a terminal
 * where the user reads and approves every change its setup proposes, and opens chats in its mode.
 * The version is pinned (a release at least two weeks old, like every package Igrek uses).
 */
const REA_PACKAGE = "rea-agents@5.0.0";

/** Whether Claude Code has REA: an MCP server named "rea" in the user's Claude settings. */
function reaInstalled(home = homedir()): boolean {
  for (const file of [join(home, ".claude.json"), join(home, ".claude", "settings.json")]) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as { mcpServers?: Record<string, unknown> };
      if (Object.keys(data.mcpServers ?? {}).some((name) => /^rea\b/i.test(name))) return true;
    } catch {
      // A settings file being written right now: try again on the next look.
    }
  }
  return false;
}

export function registerReaRoutes(app: Hono, terminals: Terminals): void {
  app.get("/api/rea", (c) =>
    c.json({ installed: reaInstalled(), node: Boolean(Bun.which("npx")), package: REA_PACKAGE }),
  );
  // REA's own setup, in a terminal here: it lists what it will change and waits for the user's OK.
  app.post("/api/rea/setup", (c) => {
    if (!Bun.which("npx"))
      return c.json({ error: "Install Node.js first (nodejs.org); REA's setup runs with npx" }, 400);
    try {
      return c.json(
        terminals.start({
          projectId: "rea",
          cwd: homedir(),
          tool: "shell",
          title: "REA setup",
          args: ["-c", `npx -y ${REA_PACKAGE} setup`],
        }),
      );
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });
}
