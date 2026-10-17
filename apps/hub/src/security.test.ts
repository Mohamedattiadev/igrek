import { describe, expect, test } from "bun:test";
import { base32, fromBase32, ipAllowed, totp, verifyTotp } from "./security";

describe("security helpers", () => {
  test("TOTP matches the RFC 6238 test vector", () => {
    // Secret "12345678901234567890", T = 59 s → 94287082 (8 digits); 6 digits → 287082.
    const secret = base32(new TextEncoder().encode("12345678901234567890"));
    expect(fromBase32(secret).toString()).toBe("12345678901234567890");
    expect(totp(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "287082", 59_000 + 90_000)).toBe(false);
    expect(verifyTotp(secret, "abc", 59_000)).toBe(false);
  });

  test("IP rules", () => {
    expect(ipAllowed("1.2.3.4", "")).toBe(true);
    expect(ipAllowed("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipAllowed("11.1.2.3", "10.0.0.0/8, 192.168.1.5")).toBe(false);
    expect(ipAllowed("::ffff:192.168.1.5", "192.168.1.5")).toBe(true);
  });
});

describe("backups", () => {
  test("sealed backups open only with the key", async () => {
    const { open, seal } = await import("./backup");
    const { randomBytes } = await import("node:crypto");
    const key = randomBytes(32);
    const sealed = seal(Buffer.from("hello"), key);
    expect(open(sealed, key).toString()).toBe("hello");
    expect(() => open(sealed, randomBytes(32))).toThrow();
    sealed[20] = (sealed[20] ?? 0) ^ 1;
    expect(() => open(sealed, key)).toThrow();
  });

  test("S3 signature matches the AWS example shape", async () => {
    const { s3Put } = await import("./backup");
    let seen: Request | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
      seen = new Request(input as string, init);
      return new Response("", { status: 200 });
    }) as typeof fetch;
    await s3Put(
      { endpoint: "https://s3.example.com", bucket: "b", region: "us-east-1", accessKey: "AK", secretKey: "SK" },
      "x/y.geb",
      Buffer.from("data"),
      new Date("2026-10-17T00:00:00Z"),
    );
    globalThis.fetch = original;
    expect(seen?.url).toBe("https://s3.example.com/b/x/y.geb");
    expect(seen?.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AK\/20261017\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });
});
