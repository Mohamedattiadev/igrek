import { Database } from "bun:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ipAllowed, newTotpSecret, otpauthUri, verifyTotp } from "./security";

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
  twoFactor: boolean;
  language?: string;
  avatar?: string;
}

export interface HubAlert {
  kind: "failed-logins" | "new-location";
  user: string;
  ip?: string;
  count?: number;
  at: number;
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
  /** Which team key encrypted it (keys are replaced when a member leaves). */
  epoch: number;
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
  // Security policies, 2FA, profiles, device keys (the team key wrapped per device), project access.
  `ALTER TABLE users ADD COLUMN totp_secret TEXT;
   ALTER TABLE users ADD COLUMN language TEXT;
   ALTER TABLE users ADD COLUMN avatar TEXT;
   ALTER TABLE devices ADD COLUMN public_key TEXT;
   ALTER TABLE events ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE key_wraps (
     device_hash TEXT NOT NULL REFERENCES devices(token_hash) ON DELETE CASCADE,
     epoch INTEGER NOT NULL,
     from_public TEXT NOT NULL,
     nonce TEXT NOT NULL,
     wrapped TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (device_hash, epoch)
   );
   CREATE TABLE project_access (
     project TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL,
     PRIMARY KEY (project, user_id)
   );
   CREATE INDEX audit_at ON audit(at);`,
];

export interface Policies {
  minPassword: number;
  require2fa: boolean;
  /** Days a device stays signed in without being used; 0 = until signed out. */
  sessionDays: number;
  /** Allowed client addresses ("10.0.0.0/8, 1.2.3.4"); empty = anywhere. */
  ipAllow: string;
  /** Events older than this many days are removed; 0 = keep forever. */
  retentionDays: number;
}

const DEFAULT_POLICIES: Policies = {
  minPassword: 10,
  require2fa: false,
  sessionDays: 0,
  ipAllow: "",
  retentionDays: 0,
};

export type ProjectRole = "owner" | "manager" | "member" | "viewer";
export const PROJECT_ROLES: ProjectRole[] = ["owner", "manager", "member", "viewer"];

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
    totp_secret?: string | null;
    language?: string | null;
    avatar?: string | null;
  }): HubUser {
    return {
      twoFactor: !!row.totp_secret,
      language: row.language ?? undefined,
      avatar: row.avatar ?? undefined,
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
    this.checkPassword(input.password);
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
    this.checkPassword(password);
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
    code?: string,
  ): Promise<{ token: string; user: HubUser } | { needs2fa: true } | undefined> {
    const row = this.db.query("SELECT * FROM users WHERE username = ?").get(username.trim()) as
      | (Parameters<Hub["toUser"]>[0] & { password_hash: string })
      | undefined;
    const ok = await Bun.password.verify(
      password,
      row?.password_hash ?? "$argon2id$v=19$m=65536,t=2,p=1$c29tZXNhbHQ$9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ",
    );
    if (!row || !ok || row.disabled) {
      this.audit(row?.id, "login-failed", username, ip);
      this.onFailedLogin(row?.id, username, ip);
      return undefined;
    }
    if (ip && !ipAllowed(ip, this.policies().ipAllow)) {
      this.audit(row.id, "login-blocked-ip", deviceName, ip);
      return undefined;
    }
    // Password was right; with 2FA on, the code is the second half.
    if (row.totp_secret) {
      if (!code) return { needs2fa: true };
      if (!verifyTotp(row.totp_secret, code)) {
        this.audit(row.id, "login-failed-2fa", deviceName, ip);
        this.onFailedLogin(row.id, username, ip);
        return undefined;
      }
    }
    const knownIp = ip
      ? !!this.db.query("SELECT 1 FROM audit WHERE user_id = ? AND action = 'login' AND ip = ? LIMIT 1").get(row.id, ip)
      : true;
    const firstLogin = !this.db.query("SELECT 1 FROM audit WHERE user_id = ? AND action = 'login' LIMIT 1").get(row.id);
    const token = randomBytes(32).toString("base64url");
    this.db
      .query("INSERT INTO devices (token_hash, user_id, name, created_at, last_seen, ip) VALUES (?, ?, ?, ?, ?, ?)")
      .run(hashToken(token), row.id, deviceName.slice(0, 60) || "device", Date.now(), Date.now(), ip ?? null);
    this.audit(row.id, "login", deviceName, ip);
    if (!knownIp && !firstLogin) {
      this.audit(row.id, "new-location", `${row.username} from ${ip}`, ip);
      this.alert({ kind: "new-location", user: row.username, ip, at: Date.now() });
    }
    return { token, user: this.toUser(row) };
  }

  // ---- alerts --------------------------------------------------------------------

  private alertListeners = new Set<(alert: HubAlert) => void>();

  onAlert(listener: (alert: HubAlert) => void): () => void {
    this.alertListeners.add(listener);
    return () => this.alertListeners.delete(listener);
  }

  private alert(alert: HubAlert): void {
    for (const l of this.alertListeners) l(alert);
  }

  /** Five failed attempts in 15 minutes on one account (or from one address) is worth telling the admins. */
  private onFailedLogin(userId: string | undefined, username: string, ip?: string): void {
    const since = Date.now() - 15 * 60_000;
    const failures = (
      this.db
        .query(
          "SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'login-failed%' AND at > ? AND (detail = ? OR (? IS NOT NULL AND ip = ?))",
        )
        .get(since, username, ip ?? null, ip ?? null) as { n: number }
    ).n;
    if (failures === 5 || failures === 20) {
      this.audit(userId, "suspicious-logins", `${failures} failed attempts for ${username}`, ip);
      this.alert({ kind: "failed-logins", user: username, ip, count: failures, at: Date.now() });
    }
  }

  // ---- policies & 2FA ----------------------------------------------------------------

  policies(): Policies {
    const row = this.db.query("SELECT value FROM meta WHERE key = 'policies'").get() as { value: string } | undefined;
    return { ...DEFAULT_POLICIES, ...(row ? (JSON.parse(row.value) as Partial<Policies>) : {}) };
  }

  setPolicies(patch: Partial<Policies>): Policies {
    const next = { ...this.policies() };
    if (typeof patch.minPassword === "number")
      next.minPassword = Math.min(64, Math.max(8, Math.round(patch.minPassword)));
    if (typeof patch.require2fa === "boolean") next.require2fa = patch.require2fa;
    if (typeof patch.sessionDays === "number")
      next.sessionDays = Math.min(365, Math.max(0, Math.round(patch.sessionDays)));
    if (typeof patch.ipAllow === "string") next.ipAllow = patch.ipAllow.slice(0, 500);
    if (typeof patch.retentionDays === "number")
      next.retentionDays = Math.min(3650, Math.max(0, Math.round(patch.retentionDays)));
    this.db
      .query(
        "INSERT INTO meta (key, value) VALUES ('policies', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(JSON.stringify(next));
    return next;
  }

  private checkPassword(password: string): void {
    const min = this.policies().minPassword;
    if (password.length < min) throw new Error(`Password must be at least ${min} characters`);
  }

  /** Step one: a secret to scan; it only takes effect once a code from it is confirmed. */
  startTwoFactor(id: string): { secret: string; uri: string } {
    const user = this.user(id);
    if (!user) throw new Error("User not found");
    const secret = newTotpSecret();
    this.db
      .query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(`totp_pending_${id}`, secret);
    return { secret, uri: otpauthUri(secret, user.username) };
  }

  confirmTwoFactor(id: string, code: string): boolean {
    const pending = this.db.query("SELECT value FROM meta WHERE key = ?").get(`totp_pending_${id}`) as
      | { value: string }
      | undefined;
    if (!pending || !verifyTotp(pending.value, code)) return false;
    this.db.query("UPDATE users SET totp_secret = ? WHERE id = ?").run(pending.value, id);
    this.db.query("DELETE FROM meta WHERE key = ?").run(`totp_pending_${id}`);
    return true;
  }

  /** The user turns it off with a valid code; an admin can clear it for someone who lost their phone. */
  disableTwoFactor(id: string, code?: string, byAdmin = false): boolean {
    const row = this.db.query("SELECT totp_secret FROM users WHERE id = ?").get(id) as
      | { totp_secret: string | null }
      | undefined;
    if (!row?.totp_secret) return true;
    if (!byAdmin && !verifyTotp(row.totp_secret, code ?? "")) return false;
    this.db.query("UPDATE users SET totp_secret = NULL WHERE id = ?").run(id);
    return true;
  }

  updateProfile(
    id: string,
    patch: { displayName?: unknown; language?: unknown; avatar?: unknown },
  ): HubUser | undefined {
    if (typeof patch.displayName === "string" && patch.displayName.trim())
      this.db.query("UPDATE users SET display_name = ? WHERE id = ?").run(patch.displayName.trim().slice(0, 40), id);
    if (typeof patch.language === "string" && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(patch.language))
      this.db.query("UPDATE users SET language = ? WHERE id = ?").run(patch.language, id);
    // A small picture (data URL, ≤ 48 KB) or a colour like "#3b82f6".
    if (
      typeof patch.avatar === "string" &&
      (/^#[0-9a-f]{6}$/i.test(patch.avatar) ||
        (/^data:image\/(png|jpeg|webp);base64,/.test(patch.avatar) && patch.avatar.length < 48_000))
    )
      this.db.query("UPDATE users SET avatar = ? WHERE id = ?").run(patch.avatar, id);
    return this.user(id);
  }

  signOutEverywhere(userId: string, keepDevice?: string): number {
    return this.db.query("DELETE FROM devices WHERE user_id = ? AND token_hash != ?").run(userId, keepDevice ?? "")
      .changes;
  }

  authenticate(token: string | undefined, ip?: string): { user: HubUser; deviceHash: string } | undefined {
    if (!token) return undefined;
    const hash = hashToken(token);
    const row = this.db.query("SELECT user_id, last_seen FROM devices WHERE token_hash = ?").get(hash) as
      | { user_id: string; last_seen: number }
      | undefined;
    const user = row ? this.user(row.user_id) : undefined;
    if (!user || user.disabled || !row) return undefined;
    const policy = this.policies();
    if (policy.sessionDays && Date.now() - row.last_seen > policy.sessionDays * 86_400_000) {
      this.logout(hash);
      return undefined;
    }
    if (ip && !ipAllowed(ip, policy.ipAllow)) return undefined;
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
  keyCheck(epoch = this.keyEpoch()): string | undefined {
    const key = epoch === 0 ? "key_check" : `key_check_${epoch}`;
    return (this.db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  }

  // ---- device keys: the team key, wrapped for each device ---------------------------------

  /** Which team key is current. Replaced (epoch + 1) when a member is removed. */
  keyEpoch(): number {
    return Number(
      (this.db.query("SELECT value FROM meta WHERE key = 'key_epoch'").get() as { value: string } | undefined)?.value ??
        0,
    );
  }

  setDeviceKey(deviceHash: string, publicKey: string): void {
    if (!/^[A-Za-z0-9_-]{40,200}$/.test(publicKey)) throw new Error("Invalid public key");
    this.db.query("UPDATE devices SET public_key = ? WHERE token_hash = ?").run(publicKey, deviceHash);
  }

  /** A new key; only an admin's app makes one, and then wraps it for every remaining device. */
  rotateKey(epoch: number, check: string): boolean {
    if (epoch !== this.keyEpoch() + 1 || !/^[0-9a-f]{64}$/.test(check)) return false;
    this.db.transaction(() => {
      this.db
        .query(
          "INSERT INTO meta (key, value) VALUES ('key_epoch', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(epoch));
      this.db
        .query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(`key_check_${epoch}`, check);
    })();
    return true;
  }

  wrapsFor(deviceHash: string): { epoch: number; fromPublic: string; nonce: string; wrapped: string }[] {
    return (
      this.db
        .query("SELECT epoch, from_public, nonce, wrapped FROM key_wraps WHERE device_hash = ? ORDER BY epoch")
        .all(deviceHash) as {
        epoch: number;
        from_public: string;
        nonce: string;
        wrapped: string;
      }[]
    ).map((r) => ({ epoch: r.epoch, fromPublic: r.from_public, nonce: r.nonce, wrapped: r.wrapped }));
  }

  putWrap(deviceId: string, epoch: number, fromPublic: string, nonce: string, wrapped: string): boolean {
    if (
      !/^[0-9a-f]{16}$/.test(deviceId) ||
      epoch < 0 ||
      epoch > this.keyEpoch() ||
      wrapped.length > 2000 ||
      nonce.length > 64
    )
      return false;
    const device = this.db.query("SELECT token_hash FROM devices WHERE substr(token_hash, 1, 16) = ?").get(deviceId) as
      | { token_hash: string }
      | undefined;
    if (!device) return false;
    this.db
      .query(
        "INSERT INTO key_wraps (device_hash, epoch, from_public, nonce, wrapped, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(device_hash, epoch) DO UPDATE SET from_public = excluded.from_public, nonce = excluded.nonce, wrapped = excluded.wrapped, at = excluded.at",
      )
      .run(device.token_hash, epoch, fromPublic, nonce, wrapped, Date.now());
    return true;
  }

  /** Devices that have a public key but not yet the current team key (waiting for an admin's approval). */
  keyRequests(): {
    deviceId: string;
    userId: string;
    username: string;
    displayName: string;
    name: string;
    publicKey: string;
    createdAt: number;
    missing: number[];
  }[] {
    const epoch = this.keyEpoch();
    const rows = this.db
      .query(
        `SELECT d.token_hash, d.user_id, d.name, d.public_key, d.created_at, u.username, u.display_name FROM devices d JOIN users u ON u.id = d.user_id
         WHERE d.public_key IS NOT NULL AND u.disabled = 0
           AND NOT EXISTS (SELECT 1 FROM key_wraps w WHERE w.device_hash = d.token_hash AND w.epoch = ?)`,
      )
      .all(epoch) as {
      token_hash: string;
      user_id: string;
      name: string;
      public_key: string;
      created_at: number;
      username: string;
      display_name: string;
    }[];
    return rows.map((r) => {
      const have = new Set(
        (
          this.db.query("SELECT epoch FROM key_wraps WHERE device_hash = ?").all(r.token_hash) as { epoch: number }[]
        ).map((x) => x.epoch),
      );
      return {
        deviceId: r.token_hash.slice(0, 16),
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        name: r.name,
        publicKey: r.public_key,
        createdAt: r.created_at,
        missing: Array.from({ length: epoch + 1 }, (_, i) => i).filter((e) => !have.has(e)),
      };
    });
  }

  /** Devices that should receive a newly made key (everyone active with a public key). */
  activeDeviceKeys(): { deviceId: string; publicKey: string }[] {
    return (
      this.db
        .query(
          "SELECT d.token_hash, d.public_key FROM devices d JOIN users u ON u.id = d.user_id WHERE d.public_key IS NOT NULL AND u.disabled = 0",
        )
        .all() as { token_hash: string; public_key: string }[]
    ).map((r) => ({ deviceId: r.token_hash.slice(0, 16), publicKey: r.public_key }));
  }

  // ---- project access (plan.md 4.3) ----------------------------------------------------------

  access(project?: string): { project: string; userId: string; role: ProjectRole }[] {
    return (
      (project
        ? this.db.query("SELECT * FROM project_access WHERE project = ?").all(project)
        : this.db.query("SELECT * FROM project_access").all()) as {
        project: string;
        user_id: string;
        role: ProjectRole;
      }[]
    ).map((r) => ({ project: r.project, userId: r.user_id, role: r.role }));
  }

  setAccess(project: string, userId: string, role: ProjectRole | null): void {
    if (!/^[0-9a-f]{64}$/.test(project)) throw new Error("Unknown project");
    if (role === null)
      this.db.query("DELETE FROM project_access WHERE project = ? AND user_id = ?").run(project, userId);
    else if (PROJECT_ROLES.includes(role))
      this.db
        .query(
          "INSERT INTO project_access (project, user_id, role) VALUES (?, ?, ?) ON CONFLICT(project, user_id) DO UPDATE SET role = excluded.role",
        )
        .run(project, userId, role);
  }

  /** A project with no access list is open to the whole team; with one, only those people (admins always). */
  roleIn(user: HubUser, project: string): ProjectRole | undefined {
    if (user.role === "admin") return "owner";
    const rows = this.db.query("SELECT user_id, role FROM project_access WHERE project = ?").all(project) as {
      user_id: string;
      role: ProjectRole;
    }[];
    if (!rows.length) return user.role === "viewer" ? "viewer" : "member";
    const mine = rows.find((r) => r.user_id === user.id)?.role;
    return mine && user.role === "viewer" ? "viewer" : mine;
  }

  // ---- retention & backups ----------------------------------------------------------------

  /** Removes events older than the retention setting (the project index is kept). */
  prune(now = Date.now()): number {
    const days = this.policies().retentionDays;
    if (!days) return 0;
    return this.db.query("DELETE FROM events WHERE at < ? AND kind != 'project'").run(now - days * 86_400_000).changes;
  }

  /** A consistent copy of the whole database (events stay encrypted; passwords are argon2 hashes). */
  backup(path: string): void {
    this.db.run(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
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
        "INSERT OR IGNORE INTO events (project, kind, author, device, id, at, nonce, data, epoch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.project,
        event.kind,
        event.author,
        event.device,
        event.id,
        event.at,
        event.nonce,
        event.data,
        event.epoch,
      );
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
