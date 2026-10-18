import type { Database } from "bun:sqlite";
import { MCP_CATALOG, type McpServerEntry } from "@igrek/core";
import { cleanEnv } from "./env";
import type { Sealer } from "./seal";

type Stored = Omit<McpServerEntry, "id" | "envKeys">;

/** A JSON-RPC conversation with a stdio MCP server: initialize, then list its tools. */
export async function probeStdio(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeout = 60_000,
): Promise<string[]> {
  if (!Bun.which(command)) throw new Error(`${command} is not installed`);
  const proc = Bun.spawn([command, ...args], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: cleanEnv(env) });
  const timer = setTimeout(() => proc.kill(), timeout);
  try {
    const send = (msg: object) => {
      proc.stdin.write(`${JSON.stringify(msg)}\n`);
      proc.stdin.flush();
    };
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "igrek", version: "1" } },
    });
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let initialized = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith("{")) continue;
        const msg = JSON.parse(line) as {
          id?: number;
          result?: { tools?: { name: string }[] };
          error?: { message: string };
        };
        if (msg.error) throw new Error(msg.error.message);
        if (msg.id === 1 && !initialized) {
          initialized = true;
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        } else if (msg.id === 2) return (msg.result?.tools ?? []).map((t) => t.name);
      }
    }
    const err = (await new Response(proc.stderr).text()).trim().split("\n").slice(-3).join(" ");
    throw new Error(err || "The server stopped before listing its tools");
  } finally {
    clearTimeout(timer);
    proc.kill();
  }
}

/**
 * Your own MCP servers (plan.md 13.1): added by hand or from a small catalog of free ones,
 * tested before use, and offered in chats next to Igrek's own tools (the AI asks before it
 * uses one). Environment values (API keys) are encrypted and never shown again.
 */
export class McpServers {
  private envCache = new Map<string, Record<string, string>>();

  constructor(
    private readonly db: Database,
    private readonly sealer: Sealer,
  ) {}

  /** Decrypts the env values once at start, so building a chat's config needs no waiting. */
  async load(): Promise<void> {
    for (const r of this.db.query("SELECT id, env FROM mcp_servers").all() as { id: string; env: string | null }[])
      if (r.env)
        this.envCache.set(r.id, JSON.parse(await this.sealer.open(r.env, `mcp:${r.id}`)) as Record<string, string>);
  }

  list(): McpServerEntry[] {
    return (
      this.db.query("SELECT id, data FROM mcp_servers ORDER BY created_at").all() as { id: string; data: string }[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Stored),
      id: r.id,
      envKeys: Object.keys(this.envCache.get(r.id) ?? {}),
    }));
  }

  private save(id: string, data: Stored): void {
    this.db.query("UPDATE mcp_servers SET data = ? WHERE id = ?").run(JSON.stringify(data), id);
  }

  async add(input: {
    name?: string;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    catalog?: string;
  }): Promise<McpServerEntry> {
    const from = input.catalog ? MCP_CATALOG.find((c) => c.id === input.catalog) : undefined;
    if (input.catalog && !from) throw new Error("Unknown catalog entry");
    const url = input.url?.trim();
    const command = (from?.command ?? input.command ?? "").trim();
    const args = (from?.args ?? input.args ?? []).map(String).slice(0, 40);
    if (!url && !/^[\w./-]{1,200}$/.test(command))
      throw new Error("Give a command (like npx or uvx) or an http(s) URL");
    if (url && !/^https?:\/\/[\w.:-]+(\/[\w./%?=&-]*)?$/.test(url)) throw new Error("That URL doesn't look right");
    const name = (input.name?.trim() || from?.name || command || url || "MCP").slice(0, 60);
    const id = `${
      (from?.id ?? name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30) || "mcp"
    }-${crypto.randomUUID().slice(0, 4)}`;
    const env = Object.fromEntries(
      Object.entries(input.env ?? {}).filter(
        ([k, v]) => /^[A-Z_][A-Z0-9_]{0,60}$/.test(k) && typeof v === "string" && v,
      ),
    );
    const data: Stored = {
      name,
      kind: url ? "http" : "stdio",
      ...(url ? { url } : { command, args }),
      enabled: false,
      ...(from ? { catalog: from.id } : {}),
    };
    this.db
      .query("INSERT INTO mcp_servers (id, data, env, created_at) VALUES (?, ?, ?, ?)")
      .run(
        id,
        JSON.stringify(data),
        Object.keys(env).length ? await this.sealer.seal(JSON.stringify(env), `mcp:${id}`) : null,
        Date.now(),
      );
    if (Object.keys(env).length) this.envCache.set(id, env);
    return this.list().find((s) => s.id === id) as McpServerEntry;
  }

  setEnabled(id: string, enabled: boolean): void {
    const entry = this.list().find((s) => s.id === id);
    if (!entry) throw new Error("Not found");
    const { id: _id, envKeys: _k, ...data } = entry;
    this.save(id, { ...data, enabled });
  }

  remove(id: string): void {
    this.db.query("DELETE FROM mcp_servers WHERE id = ?").run(id);
    this.envCache.delete(id);
  }

  /** Starts the server once and lists its tools; the result is kept on the entry. */
  async test(id: string): Promise<McpServerEntry> {
    const entry = this.list().find((s) => s.id === id);
    if (!entry) throw new Error("Not found");
    const { id: _id, envKeys: _k, ...data } = entry;
    try {
      if (entry.kind === "http") {
        const res = await fetch(entry.url as string, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "igrek", version: "1" } },
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.save(id, { ...data, tools: [], testedAt: Date.now(), error: undefined });
      } else {
        const tools = await probeStdio(entry.command as string, entry.args ?? [], this.envCache.get(id) ?? {});
        this.save(id, { ...data, tools: tools.slice(0, 100), testedAt: Date.now(), error: undefined });
      }
    } catch (err) {
      this.save(id, { ...data, testedAt: Date.now(), error: (err as Error).message.slice(0, 300) });
    }
    return this.list().find((s) => s.id === id) as McpServerEntry;
  }

  /** The enabled servers, in Claude Code's --mcp-config shape. */
  config(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const s of this.list()) {
      if (!s.enabled) continue;
      out[s.id] =
        s.kind === "http"
          ? { type: "http", url: s.url }
          : {
              command: s.command,
              args: s.args ?? [],
              ...(this.envCache.has(s.id) ? { env: this.envCache.get(s.id) } : {}),
            };
    }
    return out;
  }
}
