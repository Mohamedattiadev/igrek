import { existsSync, readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

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
  // Windows has no /etc/passwd and no bash by default; PowerShell ships with every Windows 10 and later.
  cachedShell ??= process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
  return cachedShell;
}

/** Where Chrome, Chromium or Edge usually sits on each system (Edge is Chromium too, and ships with Windows). */
function browserPlaces(platform: NodeJS.Platform, env: Record<string, string | undefined>): string[] {
  if (platform === "darwin")
    return ["Google Chrome.app/Contents/MacOS/Google Chrome", "Chromium.app/Contents/MacOS/Chromium"].flatMap((app) => [
      join("/Applications", app),
      join(homedir(), "Applications", app),
    ]);
  if (platform === "win32")
    return [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]
      .filter((dir): dir is string => !!dir)
      .flatMap((dir) => [
        join(dir, "Google", "Chrome", "Application", "chrome.exe"),
        join(dir, "Chromium", "Application", "chrome.exe"),
        join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
      ]);
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ];
}

/**
 * A Chromium-based browser for screenshots and live previews: IGREK_BROWSER when it is set, then
 * the usual places on Linux, macOS and Windows. Says what to do when there is none.
 */
export function findBrowser(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  const chosen = env.IGREK_BROWSER;
  if (chosen) {
    if (exists(chosen)) return chosen;
    throw new Error(`IGREK_BROWSER points to ${chosen}, which does not exist`);
  }
  const found = browserPlaces(platform, env).find((path) => exists(path));
  if (found) return found;
  throw new Error(
    "Screenshots need Google Chrome, Chromium or Microsoft Edge. Install one, or set IGREK_BROWSER to the browser's path.",
  );
}

/**
 * How to run a line of shell script (flow steps are written for sh). Linux and macOS have sh; on
 * Windows the bash that comes with Git for Windows runs it, and without it the error says so
 * instead of cmd.exe misreading sh syntax.
 */
export function shellCommand(
  script: string,
  platform: NodeJS.Platform = process.platform,
  which: (bin: string) => string | null = Bun.which,
): string[] {
  if (platform !== "win32") return ["sh", "-c", script];
  const bash = which("bash");
  if (!bash)
    throw new Error("Shell steps need bash on Windows: install Git for Windows (git-scm.com), which brings it.");
  return [bash, "-c", script];
}
