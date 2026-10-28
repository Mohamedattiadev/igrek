import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatAttachment } from "@igrek/core";

/** Bigger files belong in the project's repository or a shared drive, not in the chat. */
export const MAX_FILE = 10 * 1024 * 1024;
/** One hub event carries at most this much of a file (the hub takes 512 KB per event). */
const PART = 256 * 1024;

/** Shown in the page as they are (pictures, voice messages); anything else is only downloaded. */
const INLINE = /^(image\/(png|jpeg|gif|webp)|audio\/(webm|ogg|mpeg|mp4|wav|x-wav))$/;

const sha = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** A file name that is safe to show and to offer for download. */
function cleanName(name: string): string {
  const safe = [...name.replace(/[\\/]/g, "_")].map((ch) => (ch.charCodeAt(0) < 32 ? "_" : ch)).join("");
  return safe.trim().slice(0, 120) || "file";
}

/**
 * Files, pictures and voice messages in the team chat (plan.md 19.9). Kept on this computer by their
 * SHA-256, so the same file is stored once; they travel to teammates in encrypted parts through the
 * hub, and a teammate's copy is only kept when every part arrived and the whole matches its hash.
 */
export class ChatFiles {
  constructor(private readonly dir: string) {}

  private file(hash: string): string {
    return join(this.dir, hash);
  }

  has(hash: string): boolean {
    return /^[0-9a-f]{64}$/.test(hash) && existsSync(this.file(hash));
  }

  read(hash: string): Uint8Array | undefined {
    return this.has(hash) ? readFileSync(this.file(hash)) : undefined;
  }

  save(bytes: Uint8Array, name: string, type: string): ChatAttachment {
    if (bytes.length > MAX_FILE) throw new Error("Files up to 10 MB can be sent in the chat");
    if (!bytes.length) throw new Error("The file is empty");
    mkdirSync(this.dir, { recursive: true });
    const hash = sha(bytes);
    if (!this.has(hash)) writeFileSync(this.file(hash), bytes);
    return {
      hash,
      name: cleanName(name),
      size: bytes.length,
      type: type.split(";")[0]?.trim().toLowerCase() || "application/octet-stream",
    };
  }

  /** The file in parts for the hub, each base64. */
  parts(hash: string): string[] {
    const bytes = this.read(hash);
    if (!bytes) return [];
    const out: string[] = [];
    for (let at = 0; at < bytes.length; at += PART)
      out.push(Buffer.from(bytes.subarray(at, at + PART)).toString("base64"));
    return out;
  }

  /** One part from a teammate; once all are here and they make up the file its hash names, it is kept. */
  receivePart(part: { hash: string; i: number; n: number; data: string }): boolean {
    const n = Number(part.n);
    const i = Number(part.i);
    if (!/^[0-9a-f]{64}$/.test(part.hash) || !(n >= 1 && n <= MAX_FILE / PART + 1) || !(i >= 0 && i < n)) return false;
    if (this.has(part.hash)) return true;
    const folder = join(this.dir, "parts", part.hash);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, String(i)), String(part.data));
    if (readdirSync(folder).length < n) return false;
    const bytes = Buffer.concat(
      Array.from({ length: n }, (_, k) => Buffer.from(readFileSync(join(folder, String(k)), "utf8"), "base64")),
    );
    rmSync(folder, { recursive: true, force: true });
    if (bytes.length > MAX_FILE || sha(bytes) !== part.hash) return false;
    writeFileSync(this.file(part.hash), bytes);
    return true;
  }

  /** How the page may show it: a picture or a voice message inline; anything else only as a download. */
  static inline(type: string): boolean {
    return INLINE.test(type);
  }
}
