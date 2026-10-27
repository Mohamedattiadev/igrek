import { expect, test } from "bun:test";
import { openDb } from "./db";
import { ServerWeek } from "./server-week";
import type { Servers } from "./servers";

test("each server gets one report a week; danger and unknown keys make it an alarm in the inbox", async () => {
  const { sqlite } = openDb(":memory:");
  sqlite
    .query(
      "INSERT INTO servers (id, name, target, tag, created_at) VALUES ('s1', 'prod', 'root@1.2.3.4', 'prod', 1), ('s2', 'down', 'root@5.6.7.8', 'other', 1)",
    )
    .run();
  let now = Date.parse("2026-10-27T09:00:00Z");
  const asked: string[] = [];
  const servers = {
    list: () => [
      { id: "s1", name: "prod" },
      { id: "s2", name: "down" },
    ],
    inspect: async (id: string, _command: string, reason: string) => {
      asked.push(`${id}:${reason}`);
      if (id === "s2") throw new Error("no route to host");
      return reason.includes("security")
        ? { code: 0, output: "DISK:40\nMINER:4242/www-data/398.0/xmrig;\nSSHD:permitrootlogin no;" }
        : {
            code: 0,
            output:
              "ACCEPTED:2026-10-26T09:00:00+0300~root~85.10.1.2~publickey~SHA256:aaa;2026-10-26T10:00:00+0300~root~9.9.9.9~publickey~SHA256:zzz;\nKEYS:SHA256:aaa~ati@laptop~root;\nFAILEDN:12\nJOURNAL:yes",
          };
    },
  } as unknown as Servers;
  const week = new ServerWeek(sqlite, servers, () => now);
  expect(await week.tick()).toBe(1);
  expect(week.last("s1")).toMatchObject({ high: 1, top: ["miner"], logins: 2, unknownKeys: 1, failed: 12 });
  // The unreachable server is not reported; it is tried again next time.
  expect(week.last("s2")).toBeUndefined();
  const [notice] = week.notices();
  expect(notice).toMatchObject({ kind: "serverAlarm", projectName: "prod", link: "/servers/s1?tab=security" });
  // Not again within the week; again after it.
  asked.length = 0;
  now += 3 * 86_400_000;
  await week.tick();
  expect(asked.filter((a) => a.startsWith("s1"))).toEqual([]);
  now += 5 * 86_400_000;
  await week.tick();
  expect(asked.filter((a) => a.startsWith("s1")).length).toBe(2);
});
