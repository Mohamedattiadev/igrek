import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hub } from "../../../hub/src/hub";
import { totp } from "../../../hub/src/security";
import { createHubServer } from "../../../hub/src/server";
import { Bus } from "../bus";
import { migrate } from "../db";
import { Sync } from "./client";
import { encodeInvite } from "./crypto";

const dir = mkdtempSync(join(tmpdir(), "igrek-keys-"));
const hub = new Hub(join(dir, "hub.db"));
const handler = createHubServer(hub);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const hubUrl = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

function device(name: string) {
  const db = new Database(":memory:");
  migrate(db);
  return { db, sync: new Sync(db, new Bus(), join(dir, `${name}.json`), () => name) };
}

async function until(check: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

describe("device keys", () => {
  const admin = device("admin");
  const ayse = device("ayse");
  const ali = device("ali");

  test("an invite without the key: the device waits until an admin approves it", async () => {
    await hub.createUser({ username: "boss", password: "boss-password-1", role: "admin", mustChange: false });
    const first = await admin.sync.connect({ hub: hubUrl, username: "boss", password: "boss-password-1" });
    expect(first.recoveryKey).toMatch(/^igrek-recovery:/);
    await hub.createUser({ username: "ayse", password: "temp-password-1", role: "member" });
    const invite = encodeInvite({ hub: hubUrl, username: "ayse", password: "temp-password-1" });
    expect(invite).not.toContain(admin.sync.teamKey() ?? "nope");
    const joined = await ayse.sync.connect({ invite, newPassword: "ayse-password-1" });
    expect(joined.status.waitingForKey).toBe(true);

    const { requests } = await admin.sync.keyRequests();
    const pending = requests.find((r) => r.username === "ayse");
    expect(pending?.missing).toEqual([0]);
    await admin.sync.approveDevice(pending?.deviceId ?? "");
    await until(() => !ayse.sync.status().waitingForKey);
    expect(ayse.sync.teamKey()).toBe(admin.sync.teamKey());
  });

  test("replacing the key: remaining devices get it, a removed member doesn't", async () => {
    await hub.createUser({ username: "ali", password: "temp-password-2", role: "member" });
    await ali.sync.connect({
      invite: encodeInvite({ hub: hubUrl, username: "ali", password: "temp-password-2" }),
      newPassword: "ali-password-22",
    });
    const aliDevice = (await admin.sync.keyRequests()).requests.find((r) => r.username === "ali")?.deviceId ?? "";
    await admin.sync.approveDevice(aliDevice);
    await until(() => !ali.sync.status().waitingForKey);

    // Ali leaves: the admin disables him, then replaces the key.
    const aliUser = hub.users().find((u) => u.username === "ali");
    hub.updateUser(aliUser?.id ?? "", { disabled: true });
    const recovery = await admin.sync.rotateKey();
    expect(admin.sync.status().keyEpoch).toBe(1);
    expect(recovery).toMatch(/^igrek-recovery:/);
    await until(() => ayse.sync.status().keyEpoch === 1);
    // Disabling signed Ali's device out, so the new key went only to the admin and Ayşe.
    expect(hub.db.query("SELECT 1 FROM devices WHERE substr(token_hash, 1, 16) = ?").get(aliDevice)).toBeNull();
    expect((hub.db.query("SELECT COUNT(*) AS n FROM key_wraps WHERE epoch = 1").get() as { n: number }).n).toBe(2);
    expect(hub.keyEpoch()).toBe(1);
  });

  test("updates made with the new key are readable by remaining members", async () => {
    const now = Date.now();
    admin.db
      .query(
        "INSERT INTO projects (id, name, path, identity, created_at, share) VALUES ('p', 'Shop', '/a/shop', 'github.com/x/shop', ?, 'summary')",
      )
      .run(now);
    admin.db
      .query(
        "INSERT INTO memory_items (id, project_id, section, text, created_at, updated_at) VALUES ('m1', 'p', 'decision', 'Use Postgres', ?, ?)",
      )
      .run(now, now);
    await admin.sync.flush();
    await until(() => !!ayse.db.query("SELECT 1 FROM memory_items WHERE id = 'm1'").get());
    const epochs = hub.db.query("SELECT DISTINCT epoch FROM events").all() as { epoch: number }[];
    expect(epochs.map((e) => e.epoch)).toEqual([1]);
  });

  test("two-factor sign-in", async () => {
    const boss = hub.users().find((u) => u.username === "boss");
    const { secret } = hub.startTwoFactor(boss?.id ?? "");
    expect(hub.confirmTwoFactor(boss?.id ?? "", totp(secret))).toBe(true);
    const other = device("boss-laptop");
    const asked = await other.sync.connect({
      hub: hubUrl,
      username: "boss",
      password: "boss-password-1",
      recovery: await admin.sync.recoveryKey(),
    });
    expect(asked.needs2fa).toBe(true);
    const done = await other.sync.connect({
      hub: hubUrl,
      username: "boss",
      password: "boss-password-1",
      code: totp(secret),
      // Saved before the rename to Igrek: the old prefix still gives every key.
      recovery: ((await admin.sync.recoveryKey()) ?? "").replace("igrek-recovery:", "godeye-recovery:"),
    });
    expect(done.status.configured).toBe(true);
    // With the recovery key it has every key, old and new.
    expect(done.status.waitingForKey).toBe(false);
    expect(done.status.keyEpoch).toBe(1);
  });

  test("a project with an access list is only for the people on it", async () => {
    const ayseUser = hub.users().find((u) => u.username === "ayse");
    const boss = hub.users().find((u) => u.username === "boss");
    const project = (
      hub.db.query("SELECT DISTINCT project FROM events WHERE kind = 'memory'").get() as { project: string }
    ).project;
    hub.setAccess(project, boss?.id ?? "", "owner");
    expect(hub.roleIn(ayseUser as never, project)).toBeUndefined();
    hub.setAccess(project, ayseUser?.id ?? "", "viewer");
    expect(hub.roleIn(ayseUser as never, project)).toBe("viewer");
  });
});
