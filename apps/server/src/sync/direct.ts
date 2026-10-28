import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { aadFor, type ChatMessage, openDirect, sealDirect } from "@igrek/core";
import type { Bus } from "../bus";
import type { DeviceKey } from "./crypto";

/** What direct messages need from the team sync: who I am, this device, the hub. */
export interface DirectDeps {
  db: Database;
  bus: Bus;
  me: () => { id: string; name: string } | undefined;
  nameOf: (userId: string) => string;
  device: () => (DeviceKey & { id: string }) | undefined;
  /** A user's devices' public keys, from the hub. */
  keysOf: (userId: string) => Promise<{ deviceId: string; publicKey: string }[]>;
  /** Sends an op to the hub; false while offline. */
  send: (message: unknown) => boolean;
  cursor: (key: string) => number;
  setCursor: (key: string, seq: number) => void;
}

interface DirectEvent {
  seq: number;
  kind: string;
  author: string;
  nonce: string;
  data: string;
}

type Row = {
  id: string;
  peer: string;
  mine: number;
  author_name: string | null;
  text: string;
  at: number;
  read: number;
  quote_of: string | null;
};

/** The channel id the chat page uses for a direct conversation. */
const directChannel = (peer: string) => `dm:${peer}`;

/**
 * Direct messages between two teammates (plan.md 19.9). The two have a room on the hub named by a
 * hash of their ids; every message in it is sealed for their devices alone (sealDirect), so the
 * hub, an admin and anyone else holding the team key see nothing but who wrote when.
 */
export class DirectMessages {
  private rooms = new Map<string, string>();

  constructor(private readonly deps: DirectDeps) {}

  /** The hub room of me and a teammate: the same on both sides, telling the hub nothing. */
  room(peer: string): string {
    const me = this.deps.me()?.id ?? "";
    return createHash("sha256")
      .update(`igrek-dm:${[me, peer].sort().join(":")}`)
      .digest("hex");
  }

  /** Listens in the rooms with every teammate, from where it stopped. */
  subscribe(peers: string[]): void {
    const me = this.deps.me()?.id;
    const keys = peers
      .filter((p) => p && p !== me)
      .map((p) => {
        const key = this.room(p);
        this.rooms.set(key, p);
        return key;
      });
    if (keys.length)
      this.deps.send({
        op: "sub",
        projects: keys,
        since: Object.fromEntries(keys.map((k) => [k, this.deps.cursor(k)])),
      });
  }

  isRoom(key: string): boolean {
    return this.rooms.has(key);
  }

  /** Every person I have talked with directly, with the last message and how many are unread. */
  conversations(): { peer: string; name: string; last: number; unread: number }[] {
    return (
      this.deps.db
        .query(
          `SELECT peer, MAX(at) AS last, SUM(CASE WHEN read = 0 THEN 1 ELSE 0 END) AS unread,
             (SELECT author_name FROM direct_messages d2 WHERE d2.peer = d.peer AND d2.mine = 0 ORDER BY at DESC LIMIT 1) AS name
           FROM direct_messages d GROUP BY peer ORDER BY last DESC`,
        )
        .all() as { peer: string; last: number; unread: number; name: string | null }[]
    ).map((r) => ({ peer: r.peer, name: r.name ?? "", last: r.last, unread: r.unread }));
  }

  /** The talk with one person, oldest first, as chat messages so the page can show them alike. */
  messages(peer: string): ChatMessage[] {
    const rows = this.deps.db
      .query(
        "SELECT id, peer, mine, author_name, text, at, read, quote_of FROM direct_messages WHERE peer = ? ORDER BY at DESC LIMIT 300",
      )
      .all(peer) as Row[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows.reverse().map((r) => {
      const q = r.quote_of ? byId.get(r.quote_of) : undefined;
      return {
        id: r.id,
        channelId: directChannel(peer),
        mine: r.mine === 1,
        bot: false,
        text: r.text,
        at: r.at,
        replies: 0,
        reactions: [],
        ...(r.author_name && !r.mine ? { author: r.author_name, authorId: peer } : {}),
        ...(r.read ? {} : { unread: true }),
        ...(r.quote_of
          ? {
              quote: q
                ? {
                    id: q.id,
                    mine: q.mine === 1,
                    text: q.text.slice(0, 200),
                    ...(q.author_name ? { author: q.author_name } : {}),
                  }
                : { id: r.quote_of, mine: false, text: "", missing: true },
            }
          : {}),
      };
    });
  }

  markRead(peer: string): void {
    const { changes } = this.deps.db.query("UPDATE direct_messages SET read = 1 WHERE peer = ? AND read = 0").run(peer);
    if (changes) this.deps.bus.publish({ type: "chat-changed", channelId: directChannel(peer) });
  }

  /** Written here; it goes out with the next flush. */
  post(peer: string, text: string, quoteId?: string): string {
    const id = crypto.randomUUID();
    this.deps.db
      .query(
        `INSERT INTO direct_messages (id, peer, mine, author_name, text, at, read, sent, quote_of)
         VALUES (?, ?, 1, ?, ?, ?, 1, 0, ?)`,
      )
      .run(id, peer, this.deps.me()?.name ?? null, text.slice(0, 8000), Date.now(), quoteId ?? null);
    this.deps.bus.publish({ type: "chat-changed", channelId: directChannel(peer) });
    return id;
  }

  /** Seals what is waiting for its two people's devices and hands it to the hub. */
  async flush(): Promise<void> {
    const me = this.deps.me();
    const device = this.deps.device();
    if (!me || !device) return;
    const waiting = this.deps.db
      .query(
        "SELECT id, peer, text, at, quote_of FROM direct_messages WHERE mine = 1 AND sent = 0 ORDER BY at LIMIT 50",
      )
      .all() as { id: string; peer: string; text: string; at: number; quote_of: string | null }[];
    const sealed: { id: string; text: string; op: Record<string, unknown> }[] = [];
    for (const m of waiting) {
      const devices = [...(await this.deps.keysOf(m.peer)), ...(await this.deps.keysOf(me.id))];
      if (!devices.some((d) => d.deviceId !== device.id)) continue; // nobody else could ever read it yet
      const room = this.room(m.peer);
      const value = { id: m.id, text: m.text, at: m.at, ...(m.quote_of ? { quoteId: m.quote_of } : {}) };
      const box = await sealDirect(device.privateJwk, device.publicKey, devices, aadFor(room, "dm"), value);
      sealed.push({
        id: m.id,
        text: m.text,
        op: { op: "pub", project: room, kind: "dm", id: `dm-${m.id}`, epoch: 0, ...box },
      });
    }
    // Only what is still waiting, unchanged, after the keys were fetched and the sealing done.
    const still = new Set(
      (
        this.deps.db
          .query("SELECT id, text FROM direct_messages WHERE sent = 0 AND id IN (SELECT value FROM json_each(?))")
          .all(JSON.stringify(sealed.map((m) => m.id))) as { id: string; text: string }[]
      ).map((r) => `${r.id}\n${r.text}`),
    );
    for (const m of sealed)
      if (still.has(`${m.id}\n${m.text}`) && this.deps.send(m.op))
        this.deps.db.query("UPDATE direct_messages SET sent = 1 WHERE id = ?").run(m.id);
  }

  /** Messages in a room: opened with this device's key; one not sealed for it is skipped. */
  async apply(room: string, events: DirectEvent[]): Promise<void> {
    const peer = this.rooms.get(room);
    const me = this.deps.me();
    const device = this.deps.device();
    if (!peer || !me || !device) return;
    for (const e of events) {
      try {
        const value = await openDirect<{ id?: string; text?: string; at?: number; quoteId?: string }>(
          device.privateJwk,
          device.id,
          aadFor(room, "dm"),
          e.nonce,
          e.data,
        );
        // Only the two may write in their room; anything else the hub lets in is dropped.
        if (e.kind !== "dm" || ![peer, me.id].includes(e.author) || !value.id) continue;
        const mine = e.author === me.id;
        this.deps.db
          .query(
            `INSERT OR IGNORE INTO direct_messages (id, peer, mine, author_name, text, at, read, sent, quote_of)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .run(
            value.id,
            peer,
            mine ? 1 : 0,
            mine ? me.name : this.deps.nameOf(peer),
            String(value.text ?? "").slice(0, 8000),
            Number(value.at ?? Date.now()),
            mine ? 1 : 0,
            value.quoteId ?? null,
          );
      } catch {
        // Sealed for devices this one was not yet among, or changed on the way: it cannot be read here.
      } finally {
        this.deps.setCursor(room, Math.max(this.deps.cursor(room), e.seq));
      }
    }
    this.deps.bus.publish({ type: "chat-changed", channelId: directChannel(peer) });
  }

  /** Names of incoming messages follow the teammate's current name, like everywhere else. */
  rename(peer: string, name: string): void {
    this.deps.db.query("UPDATE direct_messages SET author_name = ? WHERE peer = ? AND mine = 0").run(name, peer);
  }
}
