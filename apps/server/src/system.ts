import type { ToolCheck } from "@igrek/core";

const TOOLS: { id: ToolCheck["id"]; bin: string; args: string[]; required: boolean }[] = [
  { id: "git", bin: "git", args: ["--version"], required: true },
  { id: "claude", bin: "claude", args: ["--version"], required: false },
  { id: "codex", bin: "codex", args: ["--version"], required: false },
  { id: "gemini", bin: "gemini", args: ["--version"], required: false },
  { id: "pi", bin: "pi", args: ["--version"], required: false },
  { id: "ssh", bin: "ssh", args: ["-V"], required: false },
  { id: "docker", bin: "docker", args: ["--version"], required: false },
  // Claude Code's sandbox for auto mode (Linux): limits files and network for shell commands.
  { id: "bwrap", bin: "bwrap", args: ["--version"], required: false },
  { id: "socat", bin: "socat", args: ["-V"], required: false },
];

/** Both tools the auto-mode sandbox needs on Linux (macOS has its own built in). */
export function sandboxAvailable(): boolean {
  if (process.platform === "darwin") return true;
  return process.platform === "linux" && !!Bun.which("bwrap") && !!Bun.which("socat");
}

async function check(tool: (typeof TOOLS)[number]): Promise<ToolCheck> {
  const path = Bun.which(tool.bin);
  if (!path) return { id: tool.id, found: false, required: tool.required };
  try {
    const proc = Bun.spawn([path, ...tool.args], { stdout: "pipe", stderr: "pipe" });
    const timeout = setTimeout(() => proc.kill(), 3000);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    clearTimeout(timeout);
    // `ssh -V` prints to stderr; everything else to stdout.
    const version = (out || err).trim().split("\n")[0];
    return { id: tool.id, found: true, version, required: tool.required };
  } catch {
    return { id: tool.id, found: true, required: tool.required };
  }
}

let cache: { at: number; tools: ToolCheck[] } | undefined;

export async function checkTools(): Promise<ToolCheck[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.tools;
  const tools = await Promise.all(TOOLS.map(check));
  cache = { at: Date.now(), tools };
  return tools;
}
