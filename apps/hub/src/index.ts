import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backupKey, runBackup, s3FromEnv } from "./backup";
import { Hub } from "./hub";
import { mailFromEnv, smtpSender } from "./mail";
import { createHubServer } from "./server";

const dataDir = process.env.HUB_DATA ?? "/data";
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
process.umask(0o077);

const hub = new Hub(join(dataDir, "hub.db"));
const mail = mailFromEnv();
const handler = createHubServer(hub, {
  trustProxy: process.env.HUB_TRUST_PROXY === "1",
  mail: mail ? smtpSender(mail) : undefined,
  mailFrom: mail?.from,
  webDir: process.env.HUB_WEB_DIR,
});
const server = Bun.serve({
  hostname: process.env.HUB_HOST ?? "0.0.0.0",
  port: Number(process.env.HUB_PORT ?? 7700),
  fetch: handler.fetch,
  websocket: handler.websocket,
});

// Retention and backups, once a day (and an hour after start).
const key = backupKey(process.env.HUB_BACKUP_KEY);
const s3 = s3FromEnv(process.env);
const daily = async () => {
  const removed = hub.prune();
  if (removed) console.log(`Removed ${removed} events older than the retention setting`);
  if (key) {
    try {
      console.log(`Backup: ${await runBackup(hub, process.env.HUB_BACKUP_DIR ?? join(dataDir, "backups"), key, s3)}`);
    } catch (err) {
      console.error(`Backup failed: ${(err as Error).message}`);
      hub.audit(undefined, "backup-failed", (err as Error).message.slice(0, 200));
    }
  }
};
setTimeout(() => void daily(), 60 * 60_000);
setInterval(() => void daily(), 24 * 60 * 60_000);
if (!key) console.log("Backups are off. Set HUB_BACKUP_KEY (openssl rand -base64 32) to turn them on.");

if (hub.users().length === 0) {
  console.log("No users yet. Create the first admin with:  bun src/cli.ts create-admin <username>");
}
console.log(`God Eye Hub on :${server.port} (data: ${dataDir})`);
