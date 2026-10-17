import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Hub } from "./hub";

/**
 * Hub backups (plan.md 4.3b / 4.5): a copy of the database, encrypted with a
 * backup key only the admin holds, kept in a folder and optionally uploaded to
 * any S3-compatible storage (AWS, Cloudflare R2, MinIO, Backblaze).
 * Events inside are already end-to-end encrypted; this also protects users,
 * password hashes and device lists.
 */

const MAGIC = Buffer.from("GEB1");

export function backupKey(text: string | undefined): Buffer | undefined {
  if (!text) return undefined;
  const key = Buffer.from(text, "base64");
  if (key.length !== 32) throw new Error("HUB_BACKUP_KEY must be 32 bytes in base64 (openssl rand -base64 32)");
  return key;
}

export function seal(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()]);
}

export function open(sealed: Buffer, key: Buffer): Buffer {
  if (!sealed.subarray(0, 4).equals(MAGIC)) throw new Error("Not a God Eye hub backup");
  const iv = sealed.subarray(4, 16);
  const tag = sealed.subarray(sealed.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(16, sealed.length - 16)), decipher.final()]);
}

interface S3 {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export function s3FromEnv(env: Record<string, string | undefined>): S3 | undefined {
  const { HUB_S3_ENDPOINT, HUB_S3_BUCKET, HUB_S3_ACCESS_KEY, HUB_S3_SECRET_KEY } = env;
  if (!HUB_S3_ENDPOINT || !HUB_S3_BUCKET || !HUB_S3_ACCESS_KEY || !HUB_S3_SECRET_KEY) return undefined;
  return {
    endpoint: HUB_S3_ENDPOINT.replace(/\/+$/, ""),
    bucket: HUB_S3_BUCKET,
    region: env.HUB_S3_REGION ?? "auto",
    accessKey: HUB_S3_ACCESS_KEY,
    secretKey: HUB_S3_SECRET_KEY,
  };
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** One PUT with AWS Signature V4 (path-style URL, which every S3-compatible service accepts). */
export async function s3Put(s3: S3, key: string, body: Buffer, now = new Date()): Promise<void> {
  const url = new URL(`${s3.endpoint}/${s3.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signed = Object.keys(headers).sort();
  const canonical = [
    "PUT",
    url.pathname,
    "",
    ...signed.map((h) => `${h}:${headers[h]}`),
    "",
    signed.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${day}/${s3.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${s3.secretKey}`, day), s3.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKey}/${scope}, SignedHeaders=${signed.join(";")}, Signature=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

/** Makes one backup now; keeps the newest `keep` files in the folder. Returns the file path. */
export async function runBackup(hub: Hub, dir: string, key: Buffer, s3?: S3, keep = 14): Promise<string> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const raw = join(dir, `.hub-${stamp}.db`);
  hub.backup(raw);
  const file = join(dir, `hub-${stamp}.geb`);
  writeFileSync(file, seal(readFileSync(raw), key), { mode: 0o600 });
  rmSync(raw, { force: true });
  const old = readdirSync(dir)
    .filter((n) => /^hub-.+\.geb$/.test(n))
    .sort()
    .reverse()
    .slice(keep);
  for (const n of old) rmSync(join(dir, n), { force: true });
  if (s3) await s3Put(s3, `god-eye-hub/${file.split("/").pop()}`, readFileSync(file));
  hub.audit(undefined, "backup", file.split("/").pop());
  return file;
}
