import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Hub } from "./hub";
import { createHubServer } from "./server";

const dataDir = process.env.HUB_DATA ?? "/data";
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
process.umask(0o077);

const hub = new Hub(join(dataDir, "hub.db"));
const handler = createHubServer(hub, { trustProxy: process.env.HUB_TRUST_PROXY === "1" });
const server = Bun.serve({
  hostname: process.env.HUB_HOST ?? "0.0.0.0",
  port: Number(process.env.HUB_PORT ?? 7700),
  fetch: handler.fetch,
  websocket: handler.websocket,
});

if (hub.users().length === 0) {
  console.log("No users yet. Create the first admin with:  bun src/cli.ts create-admin <username>");
}
console.log(`God Eye Hub on :${server.port} (data: ${dataDir})`);
