import { describe, expect, test } from "bun:test";
import {
  decodeInvite,
  decrypt,
  encodeInvite,
  encrypt,
  generateTeamKey,
  importTeamKey,
  keyCheck,
  projectKey,
} from "./crypto";
import { scrub, scrubDeep } from "./scrub";

describe("team encryption", () => {
  test("round-trips, and fails for another key, project or kind", async () => {
    const key = await importTeamKey(generateTeamKey());
    const other = await importTeamKey(generateTeamKey());
    const sealed = await encrypt(key, "p1:session", { title: "Login page" });
    expect(await decrypt(key, "p1:session", sealed.nonce, sealed.data)).toEqual({ title: "Login page" });
    await expect(decrypt(other, "p1:session", sealed.nonce, sealed.data)).rejects.toThrow();
    await expect(decrypt(key, "p2:session", sealed.nonce, sealed.data)).rejects.toThrow();
    await expect(decrypt(key, "p1:memory", sealed.nonce, sealed.data)).rejects.toThrow();
    expect(sealed.data).not.toContain("Login");
  });

  test("project ids are stable per team and reveal nothing", async () => {
    const encoded = generateTeamKey();
    const a = await importTeamKey(encoded);
    const b = await importTeamKey(encoded);
    const id = await projectKey(a, "github.com/me/poultrycare");
    expect(id).toBe(await projectKey(b, "github.com/me/poultrycare"));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toBe(await projectKey(await importTeamKey(generateTeamKey()), "github.com/me/poultrycare"));
    expect(await keyCheck(a)).toBe(await keyCheck(b));
  });

  test("invite codes carry everything a member needs", () => {
    const code = encodeInvite({
      hub: "https://hub.example.com",
      username: "kerim",
      password: "temp-pass-123",
      key: "abc",
    });
    expect(code.startsWith("igrek-invite:")).toBe(true);
    expect(decodeInvite(code)).toEqual({
      hub: "https://hub.example.com",
      username: "kerim",
      password: "temp-pass-123",
      key: "abc",
    });
    // An invite sent before the rename to Igrek still works.
    expect(decodeInvite(code.replace("igrek-invite:", "godeye-invite:")).username).toBe("kerim");
    expect(() => decodeInvite("hello")).toThrow();
  });
});

describe("secret scrubbing", () => {
  test("masks API keys, tokens, private keys and .env secrets", () => {
    const text = [
      "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456",
      "gh token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "STRIPE_SECRET_KEY=sk_live_51Habcdefghijklmnopqrstuv",
      'DATABASE_URL="postgres://admin:hunter22@db.example.com/app"',
      "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----",
      "aws AKIAIOSFODNN7EXAMPLE",
      "PORT=3000",
    ].join("\n");
    const out = scrub(text);
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(out).not.toContain("ghp_abcdefghijklmnop");
    expect(out).not.toContain("hunter22");
    expect(out).not.toContain("AAAA");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain("[private key removed]");
    expect(out).toContain("PORT=3000");
  });

  test("works inside nested data", () => {
    expect(scrubDeep({ a: ["API_TOKEN=supersecretvalue123"], n: 3 })).toEqual({ a: ["API_TOKEN=supe••••e123"], n: 3 });
  });
});

describe("direct messages", () => {
  test("only the devices it was sealed for can open it; another key holder, or a changed copy, cannot", async () => {
    const { openDirect, sealDirect } = await import("@igrek/core");
    const { generateDeviceKey } = await import("./crypto");
    const [ati, atiLaptop, kerim, admin] = await Promise.all([1, 2, 3, 4].map(() => generateDeviceKey()));
    if (!ati || !atiLaptop || !kerim || !admin) throw new Error("no keys");
    const devices = [
      { deviceId: "kerim-pc", publicKey: kerim.publicKey },
      { deviceId: "ati-laptop", publicKey: atiLaptop.publicKey },
    ];
    const sealed = await sealDirect(ati.privateJwk, ati.publicKey, devices, "dm-room:dm", { text: "only for you" });
    expect(sealed.data).not.toContain("only for you");
    expect(await openDirect(kerim.privateJwk, "kerim-pc", "dm-room:dm", sealed.nonce, sealed.data)).toEqual({
      text: "only for you",
    });
    // My other computer reads my own message too.
    expect(await openDirect(atiLaptop.privateJwk, "ati-laptop", "dm-room:dm", sealed.nonce, sealed.data)).toEqual({
      text: "only for you",
    });
    await expect(openDirect(admin.privateJwk, "admin-pc", "dm-room:dm", sealed.nonce, sealed.data)).rejects.toThrow();
    // Someone else's key under Kerim's device name does not open it either.
    await expect(openDirect(admin.privateJwk, "kerim-pc", "dm-room:dm", sealed.nonce, sealed.data)).rejects.toThrow();
    await expect(
      openDirect(kerim.privateJwk, "kerim-pc", "other-room:dm", sealed.nonce, sealed.data),
    ).rejects.toThrow();
  });
});
