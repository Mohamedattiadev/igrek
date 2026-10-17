import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { McpServers, probeStdio } from "./mcpservers";
import { Sealer } from "./seal";

describe("MCP servers", () => {
  test("a stdio server is probed with initialize and tools/list (God Eye's own as the example)", async () => {
    const tools = await probeStdio(process.execPath, [join(import.meta.dir, "mcp.ts")], { GODEYE_PORT: "1" });
    expect(tools).toContain("godeye_project_memory");
    await expect(probeStdio("no-such-command-xyz", [], {})).rejects.toThrow("not installed");
  });

  test("added off, env values encrypted and kept out of the list, enabled ones in the chat config", async () => {
    const { sqlite } = openDb(":memory:");
    const mcp = new McpServers(sqlite, new Sealer(mkdtempSync(join(tmpdir(), "godeye-mcp-"))));
    const s = await mcp.add({
      name: "Docs",
      command: "npx",
      args: ["-y", "some-mcp@1.0.0"],
      env: { API_KEY: "secret-123", "bad key": "x" },
    });
    expect(s).toMatchObject({ kind: "stdio", enabled: false, envKeys: ["API_KEY"] });
    expect(JSON.stringify(sqlite.query("SELECT * FROM mcp_servers").all())).not.toContain("secret-123");
    expect(mcp.config()).toEqual({});
    mcp.setEnabled(s.id, true);
    expect(mcp.config()).toEqual({
      [s.id]: { command: "npx", args: ["-y", "some-mcp@1.0.0"], env: { API_KEY: "secret-123" } },
    });
    const fromCatalog = await mcp.add({ catalog: "memory" });
    expect(fromCatalog.args).toEqual(["-y", "@modelcontextprotocol/server-memory@2026.8.31"]);
    await expect(mcp.add({ command: "rm -rf /" })).rejects.toThrow();
    // A restart reads the encrypted values back.
    const again = new McpServers(
      sqlite,
      new Sealer((mcp as unknown as { sealer: { dataDir: string } }).sealer.dataDir),
    );
    await again.load();
    expect(again.list().find((x) => x.id === s.id)?.envKeys).toEqual(["API_KEY"]);
  });
});
