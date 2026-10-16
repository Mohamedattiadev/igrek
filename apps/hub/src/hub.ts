import { Database } from "bun:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * God Eye Hub (plan.md Faz 4): logins, roles, and an append-only log of
 * end-to-end encrypted events that it stores and relays. It never sees
 * plaintext: project ids are HMACs, payloads are AES-GCM ciphertext made on
 * the members' own computers with a team key the hub never receives.
 */

export type Role = "admin" | "member" | "viewer";
export const ROLES: Role[] = ["admin", "member", "viewer"];

export interface HubUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  createdAt: number;
  mustChangePassword: boolean;
}

export interface StoredEvent {
  seq: number;
  project: string;
  kind: string;
  author: string;
  device: string;
  id: string;
  at: number;
  nonce: string;
  data: string;
}

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL UNIQUE COLLATE NOCASE,
     display_name TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL,
     disabled INTEGER NOT NULL DEFAULT 0,
     must_change_password INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE devices (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     ip TEXT
   );
   CREATE TABLE events (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     project TEXT NOT NULL,
     kind TEXT NOT NULL,
     author TEXT NOT NULL,
     device TEXT NOT NULL,
     id TEXT NOT NULL UNIQUE,
     at INTEGER NOT NULL,
     nonce TEXT NOT NULL,
     data TEXT NOT NULL
   );
   CREATE INDEX events_project ON events(project, seq);
   CREATE TABLE audit (
     at INTEGER NOT NULL,
     user_id TEXT,
     action TEXT NOT NULL,
     detail TEXT,
     ip TEXT
   );
   CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class Hub {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    const current = (this.db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
    for (let v = current; v < MIGRATIONS.length; v++) {
      this.db.transaction(() => {
        this.db.run(MIGRATIONS[v] as string);
        this.db.run(`PRAGMA user_version = ${v + 1}`);
      })();
    }
  }

  // ---- users -----------------------------------------------------------------

  private toUser(row: {
    id: string;
    username: string;
    display_name: string;
    role: Role;
    disabled: number;
    must_change_password: number;
    created_at: number;
  }): HubUser {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      disabled: !!row.disabled,
      createdAt: row.created_at,
      mustChangePassword: !!row.must_change_password,
    };
  }

  users(): HubUser[] {
    return (this.db.query("SELECT * FROM users ORDER BY created_at").all() as Parameters<Hub["toUser"]>[0][]).map((r) =>
      this.toUser(r),
    );
  }

  user(id: string): HubUser | undefined {
    const row = this.db.query("SELECT * FROM users WHERE id = ?").get(id) as Parameters<Hub["toUser"]>[0] | undefined;
    return row ? this.toUser(row) : undefined;
  }

  async createUser(input: {
    username: string;
    password: string;
    displayName?: string;
    role: Role;
    mustChange?: boolean;
  }): Promise<HubUser> {
    const username = input.username.trim();
    if (!/^[a-zA-Z0-9._-]{2,32}$/.test(username)) throw new Error("Username: 2-32 letters, numbers, . _ -");
    if (input.password.length < 10) throw new Error("Password must be at least 10 characters");
    if (!ROLES.includes(input.role)) throw new Error("Unknown role");
    const id = randomBytes(8).toString("hex");
    const hash = await Bun.password.hash(input.password, { algorithm: "argon2id" });
    this.db
      .query(
        "INSERT INTO users (id, username, display_name, password_hash, role, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        username,
        (input.displayName ?? username).trim().slice(0, 40) || username,
        hash,
        input.role,
        input.mustChange === false ? 0 : 1,
        Date.now(),
      );
    return this.user(id) as HubUser;
  }

  /** A new password signs every other device out (`keepDevice` is the one making the change). */
  async setPassword(id: string, password: string, mustChange: boolean, keepDevice?: string): Promise<void> {
    if (password.length < 10) throw new Error("Password must be at least 10 characters");
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    this.db
      .query("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?")
      .run(hash, mustChange ? 1 : 0, id);
    this.db.query("DELETE FROM devices WHERE user_id = ? AND token_hash != ?").run(id, keepDevice ?? "");
  }

  updateUser(id: string, patch: { role?: unknown; disabled?: unknown; displayName?: unknown }): void {
    if (typeof patch.role === "string" && ROLES.includes(patch.role as Role)) {
      this.db.query("UPDATE users SET role = ? WHERE id = ?").run(patch.role, id);
    }
    if (typeof patch.disabled === "boolean") {
      this.db.query("UPDATE users SET disabled = ? WHERE id = ?").run(patch.disabled ? 1 : 0, id);
      if (patch.disabled) this.db.query("DELETE FROM devices WHERE user_id = ?").run(id);
    }
    if (typeof patch.displayName === "string" && patch.displayName.trim()) {
      this.db.query("UPDATE users SET display_name = ? WHERE id = ?").run(patch.displayName.trim().slice(0, 40), id);
    }
  }

  deleteUser(id: string): void {
    this.db.query("DELETE FROM users WHERE id = ?").run(id);
  }

  adminCount(): number {
    return (
      this.db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }
    ).n;
  }

  // ---- login & devices ---------------------------------------------------------------

  /** Returns a device token, or undefined. Runs the hash check even for unknown users (no timing hint). */
  async login(
    username: string,
    password: string,
    deviceName: string,
    ip?: string,
  ): Promise<{ token: string; user: HubUser } | undefined> {
    const row = this.db.query("SELECT * FROM users WHERE username = ?").get(username.trim()) as
      | (Parameters<Hub["toUser"]>[0] & { password_hash: string })
      | undefined;
    const ok = await Bun.password.verify(
      password,
      row?.password_hash ?? "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ",
    );
    if (!row || !ok || row.disabled) {
      this.audit(row?.id, "login-failed", username, ip);
      return undefined;
    }
    const token = randomBytes(32).toString("base64url");
    this.db
      .query("INSERT INTO devices (token_hash, user_id, name, created_at, last_seen, ip) VALUES (?, ?, ?, ?, ?, ?)")
      .run(hashToken(token), row.id, deviceName.slice(0, 60) || "device", Date.now(), Date.now(), ip ?? null);
    this.audit(row.id, "login", deviceName, ip);
    return { token, user: this.toUser(row) };
  }

  authenticate(token: string | undefined): { user: HubUser; deviceHash: string } | undefined {
    if (!token) return undefined;
    const hash = hashToken(token);
    const row = this.db.query("SELECT user_id FROM devices WHERE token_hash = ?").get(hash) as
      | { user_id: string }
      | undefined;
    const user = row ? this.user(row.user_id) : undefined;
    if (!user || user.disabled) return undefined;
    this.db.query("UPDATE devices SET last_seen = ? WHERE token_hash = ?").run(Date.now(), hash);
    return { user, deviceHash: hash };
  }

  devices(
    userId?: string,
  ): { id: string; userId: string; name: string; createdAt: number; lastSeen: number; ip?: string }[] {
    const rows = (
      userId
        ? this.db.query("SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC").all(userId)
        : this.db.query("SELECT * FROM devices ORDER BY last_seen DESC").all()
    ) as {
      token_hash: string;
      user_id: string;
      name: string;
      created_at: number;
      last_seen: number;
      ip: string | null;
    }[];
    return rows.map((r) => ({
      id: r.token_hash.slice(0, 16),
      userId: r.user_id,
      name: r.name,
      createdAt: r.created_at,
      lastSeen: r.last_seen,
      ip: r.ip ?? undefined,
    }));
  }

  revokeDevice(idPrefix: string, userId?: string): void {
    if (!/^[0-9a-f]{16}$/.test(idPrefix)) return;
    if (userId)
      this.db.query("DELETE FROM devices WHERE substr(token_hash, 1, 16) = ? AND user_id = ?").run(idPrefix, userId);
    else this.db.query("DELETE FROM devices WHERE substr(token_hash, 1, 16) = ?").run(idPrefix);
  }

  logout(deviceHash: string): void {
    this.db.query("DELETE FROM devices WHERE token_hash = ?").run(deviceHash);
  }

  // ---- team key check ----------------------------------------------------------------

  /**
   * A value derived from the team key (never the key itself), so a member with
   * a wrong key gets told right away instead of silently failing to decrypt.
   */
  keyCheck(): string | undefined {
    return (this.db.query("SELECT value FROM meta WHERE key = 'key_check'").get() as { value: string } | undefined)
      ?.value;
  }

  setKeyCheck(value: string): boolean {
    if (this.keyCheck()) return false;
    this.db.query("INSERT INTO meta (key, value) VALUES ('key_check', ?)").run(value);
    return true;
  }

  // ---- events --------------------------------------------------------------------

  /** Appends an event; duplicates (same id) are ignored so clients can safely retry. */
  append(event: Omit<StoredEvent, "seq">): StoredEvent | undefined {
    const result = this.db
      .query(
        "INSERT OR IGNORE INTO events (project, kind, author, device, id, at, nonce, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(event.project, event.kind, event.author, event.device, event.id, event.at, event.nonce, event.data);
    if (result.changes === 0) return undefined;
    return { ...event, seq: Number(result.lastInsertRowid) };
  }

  since(project: string, seq: number, limit = 500): StoredEvent[] {
    return this.db
      .query("SELECT * FROM events WHERE project = ? AND seq > ? ORDER BY seq LIMIT ?")
      .all(project, seq, limit) as StoredEvent[];
  }

  stats(): { users: number; events: number; bytes: number } {
    const users = (this.db.query("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    const ev = this.db.query("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS b FROM events").get() as {
      n: number;
      b: number;
    };
    return { users, events: ev.n, bytes: ev.b };
  }

  audit(userId: string | undefined, action: string, detail?: string, ip?: string): void {
    this.db
      .query("INSERT INTO audit (at, user_id, action, detail, ip) VALUES (?, ?, ?, ?, ?)")
      .run(Date.now(), userId ?? null, action, detail ?? null, ip ?? null);
  }

  auditLog(limit = 200): { at: number; userId?: string; action: string; detail?: string; ip?: string }[] {
    return (
      this.db.query("SELECT * FROM audit ORDER BY at DESC LIMIT ?").all(limit) as {
        at: number;
        user_id: string | null;
        action: string;
        detail: string | null;
        ip: string | null;
      }[]
    ).map((r) => ({
      at: r.at,
      userId: r.user_id ?? undefined,
      action: r.action,
      detail: r.detail ?? undefined,
      ip: r.ip ?? undefined,
    }));
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
