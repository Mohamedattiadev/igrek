/**
 * A real Igrek server for the API smoke test and the browser tests, started the way people start it
 * (`bun apps/server/src/index.ts`) but sealed off: its own empty HOME and data folder, a free port, and
 * only PATH passed through. With no ~/.claude or ~/.codex and no API keys in the environment it cannot
 * read the user's chats or call any model, so the tests cost nothing and change nothing on the machine.
 * The AI command-line tools are also left off PATH, so nothing can start one by accident.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";

const ROOT = resolve(import.meta.dir, "..");

export interface TestServer {
  url: string;
  port: number;
  home: string;
  /** Fetch with the session cookie, like the web app does. */
  call: (path: string, init?: RequestInit) => Promise<Response>;
  /** What the server printed, for a failing test's message. */
  output: () => string;
  stop: () => Promise<void>;
}

const AGENT_CLIS = ["claude", "codex", "gemini", "opencode"];

/** PATH without the folders that hold an AI command-line tool, and with the stand-in first when asked for. */
function sealedPath(stubDir?: string): string {
  const dirs = (process.env.PATH ?? "")
    .split(":")
    .filter((dir) => dir && !AGENT_CLIS.some((name) => existsSync(join(dir, name))));
  return [...(stubDir ? [stubDir] : []), ...dirs].join(":");
}

/** A "claude" that only waits: a chat can be opened and typed into, and nothing ever answers. */
function stubAgent(home: string): string {
  const dir = join(home, "stub-bin");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "claude"), "#!/bin/sh\nexec cat >/dev/null\n");
  chmodSync(join(dir, "claude"), 0o755);
  return dir;
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (typeof address === "object" && address ? done(address.port) : fail(new Error("no port"))));
    });
  });
}

async function collect(proc: Subprocess<"ignore", "pipe", "pipe">, into: string[]): Promise<void> {
  const decoder = new TextDecoder();
  const read = async (stream: ReadableStream<Uint8Array>) => {
    for await (const chunk of stream) into.push(decoder.decode(chunk));
  };
  await Promise.all([read(proc.stdout), read(proc.stderr)]);
}

async function waitUntilUp(url: string, proc: Subprocess, log: string[]): Promise<void> {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (proc.exitCode !== null) throw new Error(`server exited (${proc.exitCode}):\n${log.join("")}`);
    const ok = await fetch(`${url}/api/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return;
    await Bun.sleep(200);
  }
  throw new Error(`server did not answer within 30 s:\n${log.join("")}`);
}

/** Starts the server; `webDist` serves a built web app (the browser tests), otherwise the API alone. */
export async function startTestServer(
  options: { webDist?: string; seed?: (home: string) => void; stubAgent?: boolean } = {},
): Promise<TestServer> {
  const home = mkdtempSync(join(tmpdir(), "igrek-e2e-"));
  options.seed?.(home);
  const port = await freePort();
  const url = `http://localhost:${port}`;
  const log: string[] = [];
  const proc = Bun.spawn([process.execPath, join(ROOT, "apps/server/src/index.ts")], {
    cwd: ROOT,
    env: {
      PATH: sealedPath(options.stubAgent ? stubAgent(home) : undefined),
      HOME: home,
      LANG: "C.UTF-8",
      IGREK_HOME: join(home, ".igrek"),
      IGREK_PORT: String(port),
      IGREK_WEB_DIST: options.webDist ?? join(home, "no-web"),
      OPENUI_TELEMETRY_DISABLED: "1",
      DO_NOT_TRACK: "1",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const reading = collect(proc, log);
  await waitUntilUp(url, proc, log);
  // The bootstrap call hands out the session cookie, as it does for the browser.
  const session = await fetch(`${url}/api/session`);
  const cookie = (session.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return {
    url,
    port,
    home,
    call: (path, init = {}) =>
      fetch(`${url}${path}`, { ...init, headers: { cookie, ...(init.headers as Record<string, string>) } }),
    output: () => log.join(""),
    stop: async () => {
      proc.kill();
      await proc.exited;
      await reading.catch(() => undefined);
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** The chat seeded by `seedProject`. */
export const SESSION = "e2e-session-1";

/** A small git project with one Claude Code chat in it, where Claude Code would have left it. */
export function seedProject(home: string): void {
  const project = join(home, "demo-shop");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "demo-shop", version: "1.0.0" }));
  writeFileSync(join(project, "src/index.ts"), "export const answer = 42;\n");
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: project });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "first");
  const transcripts = join(home, ".claude/projects", project.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(transcripts, { recursive: true });
  const at = (min: number) => new Date(Date.now() - (10 - min) * 60_000).toISOString();
  const base = { sessionId: SESSION, cwd: project, gitBranch: "main" };
  const lines = [
    { ...base, type: "user", uuid: "u1", timestamp: at(0), message: { role: "user", content: "Add a cart page" } },
    {
      ...base,
      type: "assistant",
      uuid: "a1",
      timestamp: at(1),
      message: {
        id: "m1",
        model: "claude-sonnet-5",
        content: [{ type: "text", text: "Added the cart page." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  ];
  writeFileSync(join(transcripts, `${SESSION}.jsonl`), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

/** Waits for the indexer to turn the seeded chat into a project and returns its id. */
export async function seededProjectId(server: TestServer): Promise<string | undefined> {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const list = (await (await server.call("/api/projects")).json()) as { id: string; name: string }[];
    const found = list.find((p) => p.name === "demo-shop")?.id;
    if (found) return found;
    await Bun.sleep(250);
  }
  return undefined;
}

/** Every GET route the server registers, read from its source: "/api/projects", "/api/chats/:id", ... */
export function getRoutes(dir = join(ROOT, "apps/server/src")): string[] {
  const found = new Set<string>();
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
        for (const m of readFileSync(path, "utf8").matchAll(/\.get\(\s*"(\/api\/[^"]+)"/g)) if (m[1]) found.add(m[1]);
    }
  };
  walk(dir);
  return [...found].sort();
}
