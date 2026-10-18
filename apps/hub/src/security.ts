import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Two-factor codes (RFC 6238 TOTP, the kind every authenticator app reads). */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32(randomBytes(20));
}

export function totp(secret: string, at = Date.now(), step = 30): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", fromBase32(secret)).update(msg).digest();
  const offset = (mac[mac.length - 1] as number) & 15;
  const code = ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

/** Accepts the current code and one step either side (phone clocks drift). */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return [-1, 0, 1].some((d) => {
    const expected = totp(secret, at + d * 30_000);
    return timingSafeEqual(Buffer.from(expected), Buffer.from(clean));
  });
}

export function otpauthUri(secret: string, account: string, issuer = "Igrek"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** "10.0.0.0/8, 192.168.1.5" — an empty list allows everyone. IPv4 ranges, exact IPv6. */
export function ipAllowed(ip: string, rules: string): boolean {
  const list = rules
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (!list.length) return true;
  const v4 = (s: string) => {
    const parts = s
      .replace(/^::ffff:/, "")
      .split(".")
      .map(Number);
    return parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)
      ? parts.reduce((a, n) => (a << 8) + n, 0) >>> 0
      : undefined;
  };
  const addr = v4(ip);
  return list.some((rule) => {
    const [base, bits] = rule.split("/");
    if (addr === undefined || bits === undefined) return rule === ip || rule === ip.replace(/^::ffff:/, "");
    const net = v4(base ?? "");
    const n = Number(bits);
    if (net === undefined || !(n >= 0 && n <= 32)) return false;
    const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
    return (addr & mask) === (net & mask);
  });
}
