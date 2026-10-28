import type { ChatAttachment } from "@igrek/core";

/**
 * Files, pictures and voice messages in the browser, in the same parts as Igrek on a computer
 * (apps/server/src/chat-files.ts): 256 KB of the file per event, plain base64, named by the
 * file's SHA-256. A file only shows once every part is here and the whole matches that hash.
 */

/** Bigger files belong in the project's repository or a shared drive, not in the chat. */
const MAX_FILE = 10 * 1024 * 1024;
const PART = 256 * 1024;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** A file name that is safe to show and to offer for download (the same rule as on a computer). */
function cleanName(name: string): string {
  const safe = [...name.replace(/[\\/]/g, "_")].map((ch) => (ch.charCodeAt(0) < 32 ? "_" : ch)).join("");
  return safe.trim().slice(0, 120) || "file";
}

/** A picked or recorded file, described and cut into parts for the hub. */
export async function prepareFile(
  file: Blob & { name?: string },
): Promise<{ attachment: ChatAttachment; parts: string[] }> {
  if (file.size > MAX_FILE) throw new Error("Files up to 10 MB can be sent in the chat");
  if (!file.size) throw new Error("The file is empty");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += PART) parts.push(toBase64(bytes.subarray(at, at + PART)));
  return {
    attachment: {
      hash: await sha256Hex(bytes),
      name: cleanName(file.name ?? "file"),
      size: bytes.length,
      type: file.type.split(";")[0]?.trim().toLowerCase() || "application/octet-stream",
    },
    parts,
  };
}

/** Teammates' files as their parts arrive; whole and checked ones are kept by hash. */
export class FileParts {
  private waiting = new Map<string, string[]>();
  readonly done = new Map<string, Uint8Array<ArrayBuffer>>();

  /** Keeps my own file at once, so it shows in my message without the trip through the hub. */
  keep(hash: string, parts: string[]): void {
    this.done.set(hash, joined(parts));
  }

  /** One part; true when it made a file whole (its hash checked). */
  async receive(value: Record<string, unknown>): Promise<boolean> {
    const hash = String(value.hash ?? "");
    const n = Number(value.n);
    const i = Number(value.i);
    if (!/^[0-9a-f]{64}$/.test(hash) || !(n >= 1 && n <= MAX_FILE / PART + 1) || !(i >= 0 && i < n)) return false;
    if (this.done.has(hash)) return false;
    const parts = this.waiting.get(hash) ?? new Array<string>(n);
    parts[i] = String(value.data ?? "");
    this.waiting.set(hash, parts);
    if (parts.filter((p) => p !== undefined).length < n) return false;
    this.waiting.delete(hash);
    const bytes = joined(parts);
    if (bytes.length > MAX_FILE || (await sha256Hex(bytes)) !== hash) return false;
    this.done.set(hash, bytes);
    return true;
  }
}

function joined(parts: string[]): Uint8Array<ArrayBuffer> {
  const pieces = parts.map(fromBase64);
  const out = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of pieces) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
