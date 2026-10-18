import { readFileSync } from "node:fs";
import { userInfo } from "node:os";

/**
 * Variables Claude Code sets for its own child processes. If Igrek was started
 * from inside a Claude session they leak into new sessions and, among other
 * things, switch transcript saving off — so they're removed before spawning.
 */
const SESSION_MARKERS =
  /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_CODE_(ENTRYPOINT|CHILD_SESSION|SESSION_.*|SESSION|MESSAGING_.*|EXECPATH|SSE_PORT|PARENT_.*))$/;

export function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !SESSION_MARKERS.test(key)) env[key] = value;
  }
  return { ...env, ...extra };
}

let cachedShell: string | undefined;

/** The user's real login shell (from /etc/passwd), not whatever $SHELL Igrek inherited. */
export function loginShell(): string {
  if (cachedShell) return cachedShell;
  try {
    const name = userInfo().username;
    const line = readFileSync("/etc/passwd", "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}:`));
    const shell = line?.split(":")[6]?.trim();
    if (shell && !shell.endsWith("nologin") && !shell.endsWith("false")) cachedShell = shell;
  } catch {
    // Not a classic Unix system; fall back below.
  }
  cachedShell ??= process.env.SHELL || "/bin/bash";
  return cachedShell;
}
