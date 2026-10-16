/**
 * End-to-end encryption for team sync (plan.md 4.2). Uses WebCrypto only, so the
 * same code runs in God Eye and, later, in a browser for web-only members.
 * The team key never leaves members' devices; the hub only ever sees:
 *  - project ids as HMAC(teamKey, identity) — it can't tell which repo is which,
 *  - AES-256-GCM ciphertext with a random nonce, bound to project and kind.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function generateTeamKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export interface TeamKey {
  aes: CryptoKey;
  hmac: CryptoKey;
}

export async function importTeamKey(encoded: string): Promise<TeamKey> {
  const raw = fromBase64Url(encoded);
  if (raw.length !== 32) throw new Error("Team key must be 32 bytes");
  // Separate keys per purpose, derived from the one team secret.
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const derive = (
    info: string,
    algorithm: Parameters<typeof crypto.subtle.deriveKey>[2],
    usages: Parameters<typeof crypto.subtle.deriveKey>[4],
  ) =>
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: encoder.encode("godeye-v1"), info: encoder.encode(info) },
      base,
      algorithm,
      false,
      usages,
    );
  return {
    aes: await derive("encryption", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
    hmac: await derive("identifiers", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
  };
}

async function hmacHex(key: TeamKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", key.hmac, encoder.encode(text));
  return Buffer.from(signature).toString("hex");
}

/** Opaque project id the hub can route by but not read. Same repo → same id for every member. */
export function projectKey(key: TeamKey, identity: string): Promise<string> {
  return hmacHex(key, `project:${identity}`);
}

/** Lets the hub tell a member their key is wrong, without learning the key. */
export function keyCheck(key: TeamKey): Promise<string> {
  return hmacHex(key, "godeye-key-check");
}

export async function encrypt(key: TeamKey, aad: string, value: unknown): Promise<{ nonce: string; data: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(aad) },
    key.aes,
    encoder.encode(JSON.stringify(value)),
  );
  return { nonce: toBase64Url(nonce), data: toBase64Url(new Uint8Array(data)) };
}

/** Throws if the data was tampered with, moved to another project/kind, or made with another key. */
export async function decrypt<T>(key: TeamKey, aad: string, nonce: string, data: string): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(nonce), additionalData: encoder.encode(aad) },
    key.aes,
    fromBase64Url(data),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

export interface Invite {
  hub: string;
  username: string;
  password: string;
  key: string;
}

const INVITE_PREFIX = "godeye-invite:";

/** One string an admin sends to a new member (WhatsApp, email…) to join with everything set up. */
export function encodeInvite(invite: Invite): string {
  return INVITE_PREFIX + Buffer.from(JSON.stringify({ v: 1, ...invite })).toString("base64url");
}

export function decodeInvite(code: string): Invite {
  const trimmed = code.trim();
  if (!trimmed.startsWith(INVITE_PREFIX)) throw new Error("This doesn't look like a God Eye invite");
  const parsed = JSON.parse(
    Buffer.from(trimmed.slice(INVITE_PREFIX.length), "base64url").toString("utf8"),
  ) as Invite & { v: number };
  if (!parsed.hub || !parsed.username || !parsed.key) throw new Error("The invite is incomplete");
  return { hub: parsed.hub, username: parsed.username, password: parsed.password, key: parsed.key };
}
