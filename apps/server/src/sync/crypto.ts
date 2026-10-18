/**
 * End-to-end encryption for team sync (plan.md 4.2). The cipher itself lives in @igrek/core
 * (e2e.ts) so browsers of web members use the very same code; here are the parts only a
 * computer needs: a device key kept as JWK, and invite codes.
 */

import { generateDeviceKey as makeDeviceKey } from "@igrek/core";

export {
  decrypt,
  encrypt,
  generateTeamKey,
  importTeamKey,
  keyCheck,
  projectKey,
  type TeamKey,
  unwrapTeamKey,
  wrapTeamKey,
} from "@igrek/core";

export interface DeviceKey {
  /** Raw P-256 public key, base64url (what the hub stores). */
  publicKey: string;
  privateJwk: JsonWebKey;
}

/** On a computer the private half is kept as a JWK in God Eye's own (locked-down) config file. */
export async function generateDeviceKey(): Promise<DeviceKey> {
  const key = await makeDeviceKey(true);
  return { publicKey: key.publicKey, privateJwk: key.privateJwk as JsonWebKey };
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
