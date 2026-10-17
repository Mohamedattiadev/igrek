import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupKey, open, runBackup, s3FromEnv } from "./backup";
import { Hub } from "./hub";

/**
 * Admin tasks on the VPS. The first admin is only ever created here (never
 * over the network), so nobody can claim an empty hub.
 *
 *   bun src/cli.ts create-admin mohamed
 *   bun src/cli.ts reset-password mohamed
 */
const [command, username] = process.argv.slice(2);
const hub = new Hub(join(process.env.HUB_DATA ?? "/data", "hub.db"));

async function askPassword(): Promise<string> {
  if (process.env.HUB_PASSWORD) return process.env.HUB_PASSWORD;
  const answer = prompt("Password (min 10 characters):") ?? "";
  return answer.trim();
}

if (command === "create-admin" && username) {
  const user = await hub.createUser({ username, password: await askPassword(), role: "admin", mustChange: false });
  hub.audit(user.id, "admin-created-cli");
  console.log(`Admin "${user.username}" created. Sign in from God Eye → Team.`);
} else if (command === "reset-password" && username) {
  const user = hub.users().find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    console.error("No such user");
    process.exit(1);
  }
  await hub.setPassword(user.id, await askPassword(), true);
  console.log("Password changed; all their devices were signed out.");
} else if (command === "backup") {
  const key = backupKey(process.env.HUB_BACKUP_KEY);
  if (!key) {
    console.error("Set HUB_BACKUP_KEY first (openssl rand -base64 32) and keep it somewhere safe.");
    process.exit(1);
  }
  console.log(
    await runBackup(hub, username ?? join(process.env.HUB_DATA ?? "/data", "backups"), key, s3FromEnv(process.env)),
  );
} else if (command === "restore" && username) {
  // Stop the hub first. The current database is kept next to it.
  const key = backupKey(process.env.HUB_BACKUP_KEY);
  if (!key) {
    console.error("Set HUB_BACKUP_KEY to the key the backup was made with.");
    process.exit(1);
  }
  const target = join(process.env.HUB_DATA ?? "/data", "hub.db");
  const data = open(readFileSync(username), key);
  hub.db.close();
  // Move the old database and its WAL files aside together, or SQLite would replay the old WAL onto the restored file.
  const stamp = Date.now();
  for (const suffix of ["", "-wal", "-shm"])
    if (existsSync(`${target}${suffix}`))
      renameSync(`${target}${suffix}`, `${target}.before-restore-${stamp}${suffix}`);
  writeFileSync(target, data, { mode: 0o600 });
  console.log(`Restored ${username} → ${target}. Start the hub again.`);
} else {
  console.log(
    "Usage: bun src/cli.ts create-admin <username> | reset-password <username> | backup [folder] | restore <file.geb>",
  );
  process.exit(command ? 1 : 0);
}
