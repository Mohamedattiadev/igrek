import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PORT } from "@igrek/core";
import { defaultDataDir, envValue } from "./names";
import { PACKAGED, resourcePath } from "./packaged";

export interface Config {
  host: string;
  port: number;
  /** Port reachable from the host (differs from `port` when Docker remaps it). */
  publicPort: number;
  dataDir: string;
  /** Host headers we answer to. Anything else is rejected (DNS rebinding protection). */
  allowedHosts: Set<string>;
  /** Origins allowed to call the API and open the WebSocket. */
  allowedOrigins: Set<string>;
  webDist: string;
}

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const value = (name: string) => envValue(env, name);
  const port = Number(value("PORT") ?? DEFAULT_PORT);
  const dataDir = value("HOME") ?? defaultDataDir(undefined, true);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, ...splitList(value("ALLOWED_HOSTS"))];
  const origins = [...hosts.map((host) => `http://${host}`), ...splitList(value("ALLOWED_ORIGINS"))];

  return {
    // Inside Docker this is 0.0.0.0, but compose only publishes the port on 127.0.0.1.
    host: value("HOST") ?? "127.0.0.1",
    port,
    publicPort: Number(value("PUBLIC_PORT") ?? port),
    dataDir,
    allowedHosts: new Set(hosts),
    allowedOrigins: new Set(origins),
    webDist: value("WEB_DIST") ?? (PACKAGED ? resourcePath("web") : join(import.meta.dir, "../../web/dist")),
  };
}
