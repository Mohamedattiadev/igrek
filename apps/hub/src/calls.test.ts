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
    expect(calls.people(room).sort()).toEqual(["u-a", "u-b"]);
    calls.gone(b);
    expect(a.got.at(-1)).toEqual({ op: "left", room, device: "b" });
    expect(calls.people(room)).toEqual(["u-a"]);
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

describe("big calls through the team's router", () => {
  test("a LiveKit token for one room, signed with the router's secret", async () => {
    const { sfuFromEnv, sfuToken } = await import("./calls");
    expect(sfuFromEnv({})).toBeUndefined();
    const config = sfuFromEnv({ HUB_SFU_URL: "wss://sfu.example", HUB_SFU_KEY: "k", HUB_SFU_SECRET: "s" });
    if (!config) throw new Error("no config");
    const token = sfuToken(config, "a".repeat(64), { id: "u1", name: "Ayse" }, 1_800_000_000_000);
    const [header, payload, signature] = token.split(".");
    const { createHmac } = await import("node:crypto");
    expect(signature).toBe(createHmac("sha256", "s").update(`${header}.${payload}`).digest("base64url"));
    const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
    expect(claims).toMatchObject({ iss: "k", name: "Ayse", video: { room: "a".repeat(64), roomJoin: true } });
    expect(claims.sub).toMatch(/^u1:/);
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(6 * 3600 + 10);
  });
});
