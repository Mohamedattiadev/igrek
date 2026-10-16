import { join } from "node:path";
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
} else {
  console.log("Usage: bun src/cli.ts create-admin <username> | reset-password <username>");
  process.exit(command ? 1 : 0);
}
