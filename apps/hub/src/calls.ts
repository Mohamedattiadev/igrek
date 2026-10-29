import type { Database } from "bun:sqlite";
import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * The hub's part in meetings (plan.md 20.8): it only puts people in touch. A call's room is a hash
 * of the meeting's own key; what passes through it (offers, answers, network candidates) is
 * encrypted with that key in the browsers, and sound and picture then go directly between them,
 * encrypted by WebRTC. A guest gets a one-time link that opens that one room and nothing else.
 */

const ROOM = /^[0-9a-f]{64}$/;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export interface CallSocket {
  send: (text: string) => void;
  data: { user: { id: string; displayName: string }; device: string; rooms?: Set<string>; guestRoom?: string };
}

export class Calls {
  private rooms = new Map<string, Set<CallSocket>>();

  constructor(private readonly db: Database) {}

  /** A one-time link for an outsider, to this room, for a while (one day at most). */
  guestLink(room: string, by: string, hours = 24): string {
    if (!ROOM.test(room)) throw new Error("Unknown room");
    const token = randomBytes(24).toString("base64url");
    this.db
      .query("INSERT INTO guest_links (token_hash, room, expires, created_by) VALUES (?, ?, ?, ?)")
      .run(sha(token), room, Date.now() + Math.min(24, Math.max(1, hours)) * 3_600_000, by);
    this.db.query("DELETE FROM guest_links WHERE expires < ?").run(Date.now());
    return token;
  }

  /** The room a guest's link opens, while it is valid. */
  guestRoom(token: string | null): string | undefined {
    if (!token) return undefined;
    const row = this.db.query("SELECT room, expires FROM guest_links WHERE token_hash = ?").get(sha(token)) as {
      room: string;
      expires: number;
    } | null;
    return row && row.expires > Date.now() ? row.room : undefined;
  }

  /** "join", "signal", "leave": true when it was one of them. */
  handle(ws: CallSocket, msg: Record<string, unknown>): boolean {
    const room = String(msg.room ?? "");
    if (!["join", "signal", "leave"].includes(String(msg.op)) || !ROOM.test(room)) return false;
    // A guest only ever reaches the room of their link.
    if (ws.data.guestRoom && ws.data.guestRoom !== room) return true;
    if (msg.op === "join") this.join(ws, room, String(msg.name ?? "").slice(0, 60));
    else if (msg.op === "leave") this.leave(ws, room);
    else this.signal(ws, room, msg);
    return true;
  }

  private join(ws: CallSocket, room: string, name: string): void {
    const inRoom = this.rooms.get(room) ?? new Set<CallSocket>();
    const peers = [...inRoom].map((p) => ({ device: p.data.device, user: p.data.user.id }));
    inRoom.add(ws);
    this.rooms.set(room, inRoom);
    ws.data.rooms = (ws.data.rooms ?? new Set()).add(room);
    ws.send(JSON.stringify({ op: "peers", room, peers }));
    const joined = JSON.stringify({ op: "joined", room, device: ws.data.device, user: ws.data.user.id, name });
    for (const p of inRoom) if (p !== ws) p.send(joined);
  }

  leave(ws: CallSocket, room: string): void {
    const inRoom = this.rooms.get(room);
    if (!inRoom?.delete(ws)) return;
    ws.data.rooms?.delete(room);
    if (!inRoom.size) this.rooms.delete(room);
    const left = JSON.stringify({ op: "left", room, device: ws.data.device });
    for (const p of inRoom) p.send(left);
  }

  /** Passed on as it is (it is encrypted with the meeting's key), to one device or the whole room. */
  private signal(ws: CallSocket, room: string, msg: Record<string, unknown>): void {
    const inRoom = this.rooms.get(room);
    if (!inRoom?.has(ws)) return;
    const data = String(msg.data ?? "").slice(0, 64_000);
    const text = JSON.stringify({ op: "signal", room, from: ws.data.device, user: ws.data.user.id, data });
    for (const p of inRoom) if (p !== ws && (!msg.to || p.data.device === msg.to)) p.send(text);
  }

  /** Who is in a room now (by hub id): for telling a late invitee the call has started. */
  people(room: string): string[] {
    return [...new Set([...(this.rooms.get(room) ?? [])].map((p) => p.data.user.id))];
  }

  /** A socket closed: out of every room it was in. */
  gone(ws: CallSocket): void {
    for (const room of [...(ws.data.rooms ?? [])]) this.leave(ws, room);
  }
}

/** A LiveKit router for calls of more than five (plan.md 20.8), when the hub's owner runs one. */
export interface SfuConfig {
  url: string;
  key: string;
  secret: string;
}

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/**
 * A LiveKit access token (a JWT signed with the router's secret) for one person in one call's room.
 * The router passes sound and picture on; it cannot read them, as they are encrypted with the
 * meeting's own key in the browsers (LiveKit's end-to-end encryption).
 */
export function sfuToken(config: SfuConfig, room: string, who: { id: string; name: string }, now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: config.key,
      sub: `${who.id}:${randomBytes(3).toString("hex")}`,
      name: who.name,
      nbf: Math.floor(now / 1000) - 10,
      exp: Math.floor(now / 1000) + 6 * 3600,
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    }),
  );
  const signature = createHmac("sha256", config.secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** The router's settings from the hub's environment (HUB_SFU_URL, HUB_SFU_KEY, HUB_SFU_SECRET), if set. */
export function sfuFromEnv(env: Record<string, string | undefined> = process.env): SfuConfig | undefined {
  const { HUB_SFU_URL: url, HUB_SFU_KEY: key, HUB_SFU_SECRET: secret } = env;
  return url && key && secret ? { url, key, secret } : undefined;
}
