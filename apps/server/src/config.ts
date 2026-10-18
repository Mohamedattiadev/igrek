import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PORT } from "@igrek/core";

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
  const port = Number(env.GODEYE_PORT ?? DEFAULT_PORT);
  const dataDir = env.GODEYE_HOME ?? join(homedir(), ".godeye");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, ...splitList(env.GODEYE_ALLOWED_HOSTS)];
  const origins = [...hosts.map((host) => `http://${host}`), ...splitList(env.GODEYE_ALLOWED_ORIGINS)];

  return {
    // Inside Docker this is 0.0.0.0, but compose only publishes the port on 127.0.0.1.
    host: env.GODEYE_HOST ?? "127.0.0.1",
    port,
    publicPort: Number(env.GODEYE_PUBLIC_PORT ?? port),
    dataDir,
    allowedHosts: new Set(hosts),
    allowedOrigins: new Set(origins),
    webDist: env.GODEYE_WEB_DIST ?? join(import.meta.dir, "../../web/dist"),
  };
}
