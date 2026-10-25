import { dirname, join } from "node:path";
import { envValue } from "./names";

/**
 * The desktop app (apps/desktop) ships the server as one JavaScript bundle that Bun runs
 * (apps/desktop/scripts/sidecar.ts marks it with IGREK_BUNDLE); a file made by `bun build --compile`
 * counts too. Either way the server's own source files are not on disk, so the files it reads or
 * hands to other programs come from a folder the app ships beside it, and its helper scripts run as
 * the same bundle with a role as the first argument (see desktop.ts).
 */
const COMPILED = /[\\/]\$bunfs|~BUN/.test(import.meta.dir);
export const PACKAGED = COMPILED || process.env.IGREK_BUNDLE === "1";

/** A file the desktop app ships beside the server (its web app, cheat sheets, preview helpers). */
export function resourcePath(...parts: string[]): string {
  return join(envValue(process.env, "RESOURCES") ?? dirname(process.execPath), ...parts);
}

/**
 * How to start one of the server's own scripts as a separate process. `lasting` is for commands
 * written into the user's settings, which must still work after Igrek restarts: the desktop app's
 * own launcher stays put, while the server file may run from a folder that changes (an AppImage).
 */
export function ownScript(name: "mcp" | "embed-worker", lasting = false): { command: string; args: string[] } {
  // This file sits beside the scripts it names.
  if (!PACKAGED) return { command: process.execPath, args: [join(import.meta.dir, `${name}.ts`)] };
  const launcher = lasting ? envValue(process.env, "LAUNCHER") : undefined;
  if (launcher) return { command: launcher, args: [name] };
  // A bundle is a script for Bun (argv[1]); a compiled file is its own program.
  return { command: process.execPath, args: COMPILED ? [name] : [process.argv[1] ?? "", name] };
}
