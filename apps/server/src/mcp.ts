/**
 * God Eye MCP server (plan.md 1.4): lets any AI session ask God Eye for project
 * memory, past sessions and search. Speaks MCP over stdio and forwards to the
 * local God Eye API, so it needs God Eye running.
 *
 *   claude mcp add --scope user godeye -- bun /path/to/apps/server/src/mcp.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { APP_VERSION } from "@godeye/core";

const PORT = Number(process.env.GODEYE_PORT ?? 7777);
const HOME = process.env.GODEYE_HOME ?? join(homedir(), ".godeye");

function key(): string {
  return readFileSync(join(HOME, "session.key"), "utf8").trim();
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    headers: { host: `localhost:${PORT}`, cookie: `godeye_session=${key()}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`God Eye answered ${res.status}`);
  return res.json() as Promise<T>;
}

const pathArg = { type: "string", description: "Project folder. Defaults to the current working directory." };

const TOOLS = [
  {
    name: "godeye_project_memory",
    description:
      "What God Eye remembers about this project: current status, decisions already made, rules to follow, approaches that failed before, open problems, and recent session summaries. Read this before making architectural choices.",
    inputSchema: { type: "object", properties: { path: pathArg } },
  },
  {
    name: "godeye_search",
    description:
      "Search everything said in past AI coding sessions (all tools, all projects unless a path is given). Use it to find how or when something was done before.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, path: pathArg },
      required: ["query"],
    },
  },
  {
    name: "godeye_recent_sessions",
    description: "The latest sessions in this project with their plain-language summaries.",
    inputSchema: { type: "object", properties: { path: pathArg } },
  },
];

type Args = { path?: string; query?: string };

async function callTool(name: string, args: Args): Promise<string> {
  const cwd = args.path ?? process.cwd();
  if (name === "godeye_project_memory") {
    const { context } = await api<{ context: string }>(`/api/context?cwd=${encodeURIComponent(cwd)}`);
    return context || "God Eye has no memory for this project yet.";
  }
  if (name === "godeye_search") {
    const query = encodeURIComponent(args.query ?? "");
    const scope = args.path ? `&cwd=${encodeURIComponent(args.path)}` : "";
    const hits = await api<{ projectName?: string; sessionTitle: string; snippet: string; ts: number }[]>(
      `/api/search?q=${query}${scope}`,
    );
    if (hits.length === 0) return "No matches.";
    return hits
      .slice(0, 15)
      .map(
        (h) =>
          `- ${new Date(h.ts).toISOString().slice(0, 10)} · ${h.projectName ?? ""} · ${h.sessionTitle}: ${h.snippet.replace(/\[\[|\]\]/g, "")}`,
      )
      .join("\n");
  }
  if (name === "godeye_recent_sessions") {
    const sessions = await api<
      {
        title: string;
        updatedAt: number;
        summary?: { title: string; texts: Record<string, { did: string[]; left: string[] }> };
      }[]
    >(`/api/sessions/recent?cwd=${encodeURIComponent(cwd)}`);
    if (sessions.length === 0) return "No sessions recorded for this project.";
    return sessions
      .map((s) => {
        const text = s.summary?.texts.en ?? Object.values(s.summary?.texts ?? {})[0];
        const did = text
          ? ` Done: ${text.did.join("; ")}.${text.left.length ? ` Open: ${text.left.join("; ")}.` : ""}`
          : "";
        return `- ${new Date(s.updatedAt).toISOString().slice(0, 10)} · ${s.summary?.title || s.title}.${did}`;
      })
      .join("\n");
  }
  throw new Error(`Unknown tool ${name}`);
}

type Request = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };

async function handle(req: Request): Promise<unknown> {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: (req.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "godeye", version: APP_VERSION },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      try {
        const text = await callTool(name, (req.params?.arguments ?? {}) as Args);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `God Eye is not reachable: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${req.method}`), { code: -32601 });
  }
}

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

if (import.meta.main) {
  let buffer = "";
  for await (const chunk of Bun.stdin.stream()) {
    buffer += new TextDecoder().decode(chunk);
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      let req: Request;
      try {
        req = JSON.parse(line);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      if (req.id === undefined) continue; // notification
      handle(req).then(
        (result) => send({ jsonrpc: "2.0", id: req.id, result }),
        (err: Error & { code?: number }) =>
          send({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? -32603, message: err.message } }),
      );
    }
  }
}

export { handle };
