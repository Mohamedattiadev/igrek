/**
 * End-to-end encryption for team sync (plan.md 4.2), in plain WebCrypto so the same code runs in
 * God Eye (Bun) and in a browser for web members (plan.md 4.3). The hub only ever sees:
 *  - project ids as HMAC(teamKey, identity): it cannot tell which repository is which,
 *  - AES-256-GCM ciphertext with a random nonce, bound to project and kind.
 * The byte format is fixed: changing it would cut every existing team off from its history.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function streamed(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
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
  const derive = (info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]) =>
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
  return hex(await crypto.subtle.sign("HMAC", key.hmac, encoder.encode(text)));
}

/** Opaque project id the hub can route by but not read. Same repo → same id for every member. */
export function projectKey(key: TeamKey, identity: string): Promise<string> {
  return hmacHex(key, `project:${identity}`);
}

/** Lets the hub tell a member their key is wrong, without learning the key. */
export function keyCheck(key: TeamKey): Promise<string> {
  return hmacHex(key, "godeye-key-check");
}

/** The chain position is sealed into the encryption, so the hub can't renumber or relink events. */
export function aadFor(project: string, kind: string, n?: number | null, prev?: string | null): string {
  return n ? `${project}:${kind}:${n}:${prev ?? ""}` : `${project}:${kind}`;
}

/** Bigger payloads (conversation batches) are gzipped before encryption: smaller on the hub and on the wire. */
const COMPRESS_FROM = 1024;

export async function encrypt(key: TeamKey, aad: string, value: unknown): Promise<{ nonce: string; data: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const json = encoder.encode(JSON.stringify(value));
  const plain = json.length >= COMPRESS_FROM ? await streamed(json, new CompressionStream("gzip")) : json;
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(aad) },
    key.aes,
    plain,
  );
  return { nonce: toBase64Url(nonce), data: toBase64Url(new Uint8Array(data)) };
}

/** Throws if the data was tampered with, moved to another project/kind, or made with another key. */
export async function decrypt<T>(key: TeamKey, aad: string, nonce: string, data: string): Promise<T> {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(nonce), additionalData: encoder.encode(aad) },
      key.aes,
      fromBase64Url(data),
    ),
  );
  // JSON never starts with 0x1f 0x8b, so the gzip header tells the two apart.
  const json = plain[0] === 0x1f && plain[1] === 0x8b ? await streamed(plain, new DecompressionStream("gzip")) : plain;
  return JSON.parse(decoder.decode(json)) as T;
}

// ---- device keys: the team key travels wrapped for one device at a time --------------------

/** A device's ECDH private key: a JWK on computers, a non-extractable CryptoKey in browsers. */
export type DevicePrivate = JsonWebKey | CryptoKey;

const isCryptoKey = (k: DevicePrivate): k is CryptoKey => typeof (k as CryptoKey).algorithm === "object";

/**
 * A key pair for this device. In a browser the private half can be made non-extractable, so a
 * script that later runs on the page can use it but never copy it out.
 */
export async function generateDeviceKey(
  extractable = true,
): Promise<{ publicKey: string; privateKey: CryptoKey; privateJwk?: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, extractable, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    publicKey: toBase64Url(raw),
    privateKey: pair.privateKey,
    ...(extractable ? { privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) } : {}),
  };
}

/** Both sides get the same AES key from (my private, your public); the hub has neither private key. */
async function wrapKeyFor(mine: DevicePrivate, otherPublic: string, epoch: number): Promise<CryptoKey> {
  const priv = isCryptoKey(mine)
    ? mine
    : await crypto.subtle.importKey("jwk", mine, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
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
  fromPrivate: DevicePrivate,
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
  myPrivate: DevicePrivate,
  fromPublic: string,
  epoch: number,
  nonce: string,
  wrapped: string,
): Promise<string> {
  const key = await wrapKeyFor(myPrivate, fromPublic, epoch);
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(nonce) }, key, fromBase64Url(wrapped));
  return toBase64Url(new Uint8Array(raw));
}
