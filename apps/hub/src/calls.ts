import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";

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

  /** A socket closed: out of every room it was in. */
  gone(ws: CallSocket): void {
    for (const room of [...(ws.data.rooms ?? [])]) this.leave(ws, room);
  }
}
