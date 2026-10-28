import { aadFor, openDirect, sealDirect } from "@igrek/core";

/**
 * Direct messages in the browser (plan.md 20.1), the same as Igrek on a computer
 * (apps/server/src/sync/direct.ts): the two people have a hub room named by a hash of their ids,
 * and every message in it is sealed for their devices alone. This browser's device key is one of
 * them, so a teammate on a computer and one in a browser can write to each other.
 */

export interface DirectMessage {
  id: string;
  peer: string;
  mine: boolean;
  text: string;
  at: number;
  quoteId?: string;
}

interface RoomEvent {
  seq: number;
  kind: string;
  author: string;
  nonce: string;
  data: string;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** The hub's name for this device: the start of its sign-in token's hash, as the hub keeps it. */
export function deviceIdOf(token: string): Promise<string> {
  return sha256(token).then((h) => h.slice(0, 16));
}

/** The hub room of two people: the same on both sides, telling the hub nothing. */
function roomOf(me: string, peer: string): Promise<string> {
  return sha256(`igrek-dm:${[me, peer].sort().join(":")}`);
}

export interface DirectDevice {
  id: string;
  publicKey: string;
  privateKey: CryptoKey;
}

export class MemberDirect {
  private rooms = new Map<string, string>();
  readonly talks = new Map<string, DirectMessage[]>();

  /** The rooms with every teammate; the caller subscribes to them on the hub. */
  async roomsFor(me: string, peers: string[]): Promise<string[]> {
    const keys: string[] = [];
    for (const peer of peers) {
      if (!peer || peer === me) continue;
      const key = await roomOf(me, peer);
      this.rooms.set(key, peer);
      keys.push(key);
    }
    return keys;
  }

  isRoom(key: string): boolean {
    return this.rooms.has(key);
  }

  peerOf(key: string): string | undefined {
    return this.rooms.get(key);
  }

  /** A message sealed for both people's devices, ready for the hub; undefined when no other device could read it. */
  async seal(
    args: { me: string; peer: string; device: DirectDevice; text: string; quoteId?: string },
    devices: { deviceId: string; publicKey: string }[],
  ): Promise<{ message: DirectMessage; op: Record<string, unknown> } | undefined> {
    if (!devices.some((d) => d.deviceId !== args.device.id)) return undefined;
    const room = await roomOf(args.me, args.peer);
    const message: DirectMessage = {
      id: crypto.randomUUID(),
      peer: args.peer,
      mine: true,
      text: args.text.slice(0, 8000),
      at: Date.now(),
      ...(args.quoteId ? { quoteId: args.quoteId } : {}),
    };
    const value = {
      id: message.id,
      text: message.text,
      at: message.at,
      ...(message.quoteId ? { quoteId: message.quoteId } : {}),
    };
    const box = await sealDirect(args.device.privateKey, args.device.publicKey, devices, aadFor(room, "dm"), value);
    return { message, op: { op: "pub", project: room, kind: "dm", id: `dm-${message.id}`, epoch: 0, ...box } };
  }

  add(message: DirectMessage): boolean {
    const list = this.talks.get(message.peer) ?? [];
    if (list.some((m) => m.id === message.id)) return false;
    list.push(message);
    list.sort((a, b) => a.at - b.at);
    this.talks.set(message.peer, list.slice(-500));
    return true;
  }

  /** A room's messages, opened with this device's key; one not sealed for it is skipped. */
  async open(room: string, events: RoomEvent[], me: string, device: DirectDevice): Promise<DirectMessage[]> {
    const peer = this.rooms.get(room);
    if (!peer) return [];
    const added: DirectMessage[] = [];
    for (const e of events) {
      // Only the two may write in their room; anything else the hub lets in is dropped.
      if (e.kind !== "dm" || ![peer, me].includes(e.author)) continue;
      try {
        const v = await openDirect<{ id?: string; text?: string; at?: number; quoteId?: string }>(
          device.privateKey,
          device.id,
          aadFor(room, "dm"),
          e.nonce,
          e.data,
        );
        if (!v.id) continue;
        const message: DirectMessage = {
          id: v.id,
          peer,
          mine: e.author === me,
          text: String(v.text ?? "").slice(0, 8000),
          at: Number(v.at ?? Date.now()),
          ...(v.quoteId ? { quoteId: String(v.quoteId) } : {}),
        };
        if (this.add(message)) added.push(message);
      } catch {
        // Sealed for devices this browser was not yet among, or changed on the way.
      }
    }
    return added;
  }
}
