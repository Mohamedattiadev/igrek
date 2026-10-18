import { describe, expect, test } from "bun:test";
import { decrypt, encrypt, generateDeviceKey, importTeamKey, unwrapTeamKey, wrapTeamKey } from "@godeye/core";
import fixture from "../fixtures/e2e-v1.json";

// Ciphertext made by the previous, Node-only implementation (throwaway keys made for this test):
// every team's history must stay readable after the cipher moved to plain WebCrypto.
describe("end-to-end encryption, browser-safe version", () => {
  test("reads what the old implementation wrote: small, gzipped, and wrapped team keys", async () => {
    const key = await importTeamKey(fixture.teamKey);
    expect(await decrypt(key, fixture.small.aad, fixture.small.nonce, fixture.small.data)).toEqual(fixture.small.value);
    expect(await decrypt(key, fixture.big.aad, fixture.big.nonce, fixture.big.data)).toEqual(fixture.big.value);
    const w = fixture.wrap;
    expect(await unwrapTeamKey(w.devicePrivate as JsonWebKey, w.fromPublic, 0, w.nonce, w.wrapped)).toBe(
      fixture.teamKey,
    );
  });

  test("a browser-style device key (private half not extractable) receives the team key", async () => {
    const admin = await generateDeviceKey(true);
    const browser = await generateDeviceKey(false);
    expect(browser.privateJwk).toBeUndefined();
    await expect(crypto.subtle.exportKey("jwk", browser.privateKey)).rejects.toThrow();
    const wrap = await wrapTeamKey(admin.privateJwk as JsonWebKey, browser.publicKey, 3, fixture.teamKey);
    expect(await unwrapTeamKey(browser.privateKey, admin.publicKey, 3, wrap.nonce, wrap.wrapped)).toBe(fixture.teamKey);
    // And what it writes, the old reader reads (round-trip through the new code, large payload gzipped).
    const key = await importTeamKey(fixture.teamKey);
    const sealed = await encrypt(key, "p1:comment", fixture.big.value);
    expect(await decrypt(key, "p1:comment", sealed.nonce, sealed.data)).toEqual(fixture.big.value);
    await expect(decrypt(key, "p2:comment", sealed.nonce, sealed.data)).rejects.toThrow();
  });
});
