import { dirname, join } from "node:path";
import { envValue } from "./names";

/**
 * The desktop app (apps/desktop) ships the server as one file made by `bun build --compile`.
 * Inside it the server's own source files live in Bun's virtual folder, not on disk, so the files
 * it reads or hands to other programs come from a folder the app ships beside it, and its helper
 * scripts run as the same file with a role as the first argument (see desktop.ts).
 */
export const PACKAGED = /[\\/]\$bunfs|~BUN/.test(import.meta.dir);

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
  return { command: launcher ?? process.execPath, args: [name] };
}
