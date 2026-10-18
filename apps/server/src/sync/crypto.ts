/**
 * End-to-end encryption for team sync (plan.md 4.2). Uses WebCrypto only, so the
 * same code runs in God Eye and, later, in a browser for web-only members.
 * The team key never leaves members' devices; the hub only ever sees:
 *  - project ids as HMAC(teamKey, identity) — it can't tell which repo is which,
 *  - AES-256-GCM ciphertext with a random nonce, bound to project and kind.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
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

/** Bigger payloads (conversation batches) are gzipped before encryption: smaller on the hub and on the wire. */
const COMPRESS_FROM = 1024;

export async function encrypt(key: TeamKey, aad: string, value: unknown): Promise<{ nonce: string; data: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const json = encoder.encode(JSON.stringify(value));
  const plain = json.length >= COMPRESS_FROM ? Bun.gzipSync(json) : json;
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(aad) },
    key.aes,
    plain,
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
  const bytes = new Uint8Array(plain);
  // JSON never starts with 0x1f 0x8b, so the gzip header tells the two apart.
  const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? Bun.gunzipSync(bytes) : bytes;
  return JSON.parse(decoder.decode(json)) as T;
}

// ---- device keys: the team key travels wrapped for one device at a time --------------------

export interface DeviceKey {
  /** Raw P-256 public key, base64url (what the hub stores). */
  publicKey: string;
  privateJwk: JsonWebKey;
}

export async function generateDeviceKey(): Promise<DeviceKey> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: toBase64Url(raw), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

/** Both sides get the same AES key from (my private, your public); the hub has neither private key. */
async function wrapKeyFor(privateJwk: JsonWebKey, otherPublic: string, epoch: number): Promise<CryptoKey> {
  const priv = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ]);
  const pub = await crypto.subtle.importKey(
    "raw",
    fromBase64Url(otherPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("godeye-wrap-v1"), info: encoder.encode(`epoch:${epoch}`) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapTeamKey(
  fromPrivate: JsonWebKey,
  toPublic: string,
  epoch: number,
  teamKey: string,
): Promise<{ nonce: string; wrapped: string }> {
  const key = await wrapKeyFor(fromPrivate, toPublic, epoch);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, fromBase64Url(teamKey));
  return { nonce: toBase64Url(nonce), wrapped: toBase64Url(new Uint8Array(wrapped)) };
}

export async function unwrapTeamKey(
  myPrivate: JsonWebKey,
  fromPublic: string,
  epoch: number,
  nonce: string,
  wrapped: string,
): Promise<string> {
  const key = await wrapKeyFor(myPrivate, fromPublic, epoch);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(nonce) }, key, fromBase64Url(wrapped));
  return toBase64Url(new Uint8Array(raw));
}

export interface Invite {
  hub: string;
  username: string;
  password: string;
  /** Older invites carried the team key; new ones don't (an admin approves the new device instead). */
  key?: string;
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
  if (!parsed.hub || !parsed.username) throw new Error("The invite is incomplete");
  return { hub: parsed.hub, username: parsed.username, password: parsed.password, key: parsed.key };
}
