import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CallSocket, Calls } from "./calls";
import { Hub } from "./hub";

function socket(device: string, guestRoom?: string): CallSocket & { got: Record<string, unknown>[] } {
  const got: Record<string, unknown>[] = [];
  return {
    got,
    send: (t) => got.push(JSON.parse(t)),
    data: { user: { id: `u-${device}`, displayName: device }, device, ...(guestRoom ? { guestRoom } : {}) },
  };
}

describe("meeting rooms on the hub (plan.md 20.8)", () => {
  const hub = new Hub(join(mkdtempSync(join(tmpdir(), "igrek-calls-")), "hub.db"));
  const calls = new Calls(hub.db);
  const room = "a".repeat(64);

  test("whoever joins hears who is there; signals go to one device or the room, never back", () => {
    const a = socket("a");
    const b = socket("b");
    calls.handle(a, { op: "join", room, name: "Ayse" });
    calls.handle(b, { op: "join", room, name: "Kerim" });
    expect(b.got[0]).toEqual({ op: "peers", room, peers: [{ device: "a", user: "u-a" }] });
    expect(a.got.at(-1)).toMatchObject({ op: "joined", device: "b", name: "Kerim" });
    calls.handle(b, { op: "signal", room, to: "a", data: "sealed" });
    expect(a.got.at(-1)).toEqual({ op: "signal", room, from: "b", user: "u-b", data: "sealed" });
    expect(b.got.some((m) => m.op === "signal")).toBe(false);
    calls.gone(b);
    expect(a.got.at(-1)).toEqual({ op: "left", room, device: "b" });
  });

  test("a guest's link opens its one room for a while, and only that room", async () => {
    const user = await hub.createUser({
      username: "hoca",
      password: "hoca-password-1",
      role: "admin",
      mustChange: false,
    });
    const token = calls.guestLink(room, user.id, 1);
    expect(calls.guestRoom(token)).toBe(room);
    expect(calls.guestRoom("not-a-token")).toBeUndefined();
    const guest = socket("guest:1", room);
    const other = "b".repeat(64);
    calls.handle(guest, { op: "join", room: other });
    expect(guest.got).toEqual([]);
    calls.handle(guest, { op: "join", room });
    expect(guest.got[0]).toMatchObject({ op: "peers", room });
    hub.db.query("UPDATE guest_links SET expires = 0").run();
    expect(calls.guestRoom(token)).toBeUndefined();
  });
});
