import type { Database } from "bun:sqlite";
import { BRIDGE_EVENTS, type Bridge, type BridgeEvent, type BridgeKind, scrub } from "@igrek/core";
import nodemailer from "nodemailer";
import type { Sealer } from "./seal";

/** What each kind needs; the values are stored encrypted. */
interface Secrets {
  telegram: { token: string; chatId: string };
  discord: { webhook: string };
  email: { host: string; port: number; user: string; password: string; from: string; to: string };
}

type Stored = Omit<Bridge, "id">;

export interface Notice {
  event: BridgeEvent;
  title: string;
  detail?: string;
  /** Path in God Eye, added as a link when an address is known. */
  link?: string;
}

/** One short line, never code or secrets: the scrubber runs over it before it leaves. */
export function noticeText(n: Notice, base?: string): string {
  const text = `God Eye · ${n.title}${n.detail ? `\n${n.detail}` : ""}${n.link && base ? `\n${base}${n.link}` : ""}`;
  return scrub(text).slice(0, 1500);
}

/**
 * Notification bridges (plan.md 13.3), all free: your own Telegram bot, a Discord webhook, or
 * e-mail through your own SMTP server. Only short notices go out (a site is down, an approval
 * waits, a team run needs you), passed through the secret scrubber; tokens and passwords are
 * encrypted with the local key and never shown again.
 */
export class Bridges {
  private secrets = new Map<string, unknown>();

  constructor(
    private readonly db: Database,
    private readonly sealer: Sealer,
    private readonly fetcher: typeof fetch = fetch,
    private readonly base?: string,
  ) {}

  async load(): Promise<void> {
    for (const r of this.db.query("SELECT id, secret FROM bridges").all() as { id: string; secret: string }[])
      this.secrets.set(r.id, JSON.parse(await this.sealer.open(r.secret, `bridge:${r.id}`)));
  }

  list(): Bridge[] {
    return (
      this.db.query("SELECT id, data FROM bridges ORDER BY created_at").all() as { id: string; data: string }[]
    ).map((r) => ({
      ...(JSON.parse(r.data) as Stored),
      id: r.id,
    }));
  }

  private save(id: string, data: Stored): void {
    this.db.query("UPDATE bridges SET data = ? WHERE id = ?").run(JSON.stringify(data), id);
  }

  async add(input: {
    kind: BridgeKind;
    name?: string;
    events?: BridgeEvent[];
    secrets: Record<string, unknown>;
  }): Promise<Bridge> {
    const s = input.secrets ?? {};
    let secrets: Secrets[BridgeKind];
    let target: string;
    if (input.kind === "telegram") {
      const token = String(s.token ?? "").trim();
      const chatId = String(s.chatId ?? "").trim();
      if (!/^\d+:[\w-]{20,}$/.test(token)) throw new Error("That doesn't look like a bot token (123456:ABC…)");
      if (!/^-?\d{3,20}$/.test(chatId)) throw new Error("The chat id is a number");
      secrets = { token, chatId };
      target = `chat ${chatId}`;
    } else if (input.kind === "discord") {
      const webhook = String(s.webhook ?? "").trim();
      if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook))
        throw new Error("Paste the webhook URL from the channel's settings");
      secrets = { webhook };
      target = "Discord webhook";
    } else if (input.kind === "email") {
      const port = Number(s.port) || 587;
      const to = String(s.to ?? "").trim();
      const host = String(s.host ?? "").trim();
      if (!/^[\w.-]+$/.test(host)) throw new Error("Give the SMTP server's host name");
      if (!/^[^@\s]+@[^@\s]+$/.test(to)) throw new Error("Give the address to send to");
      secrets = {
        host,
        port,
        user: String(s.user ?? ""),
        password: String(s.password ?? ""),
        from: String(s.from ?? s.user ?? to),
        to,
      };
      target = to;
    } else throw new Error("Unknown kind");
    const id = crypto.randomUUID().slice(0, 12);
    const events = (input.events ?? BRIDGE_EVENTS.filter((e) => e !== "up")).filter((e) => BRIDGE_EVENTS.includes(e));
    const data: Stored = {
      kind: input.kind,
      name: (input.name?.trim() || target).slice(0, 60),
      events,
      enabled: true,
      target,
    };
    this.db
      .query("INSERT INTO bridges (id, data, secret, created_at) VALUES (?, ?, ?, ?)")
      .run(id, JSON.stringify(data), await this.sealer.seal(JSON.stringify(secrets), `bridge:${id}`), Date.now());
    this.secrets.set(id, secrets);
    return { ...data, id };
  }

  update(id: string, patch: { enabled?: boolean; events?: BridgeEvent[] }): void {
    const b = this.list().find((x) => x.id === id);
    if (!b) throw new Error("Not found");
    const { id: _id, ...data } = b;
    this.save(id, {
      ...data,
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.events ? { events: patch.events.filter((e) => BRIDGE_EVENTS.includes(e)) } : {}),
    });
  }

  remove(id: string): void {
    this.db.query("DELETE FROM bridges WHERE id = ?").run(id);
    this.secrets.delete(id);
  }

  private async deliver(b: Bridge, text: string): Promise<void> {
    const s = this.secrets.get(b.id);
    if (!s) throw new Error("Its settings could not be read");
    if (b.kind === "telegram") {
      const { token, chatId } = s as Secrets["telegram"];
      const res = await this.fetcher(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok)
        throw new Error(
          `Telegram: ${((await res.json().catch(() => ({}))) as { description?: string }).description ?? res.status}`,
        );
    } else if (b.kind === "discord") {
      const res = await this.fetcher((s as Secrets["discord"]).webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Discord: ${res.status}`);
    } else {
      const e = s as Secrets["email"];
      const transport = nodemailer.createTransport({
        host: e.host,
        port: e.port,
        secure: e.port === 465,
        ...(e.user ? { auth: { user: e.user, pass: e.password } } : {}),
        connectionTimeout: 15_000,
      });
      await transport.sendMail({ from: e.from, to: e.to, subject: text.split("\n")[0]?.slice(0, 120), text });
    }
  }

  /** Sends to every enabled bridge that wants this kind of notice; a failing one doesn't stop the others. */
  async send(n: Notice): Promise<number> {
    const text = noticeText(n, this.base);
    let sent = 0;
    for (const b of this.list()) {
      if (!b.enabled || !b.events.includes(n.event)) continue;
      const { id, ...data } = b;
      try {
        await this.deliver(b, text);
        this.save(id, { ...data, lastSentAt: Date.now(), lastError: undefined });
        sent++;
      } catch (err) {
        this.save(id, { ...data, lastError: (err as Error).message.slice(0, 200) });
      }
    }
    return sent;
  }

  async test(id: string, language: "tr" | "en" | string): Promise<Bridge> {
    const b = this.list().find((x) => x.id === id);
    if (!b) throw new Error("Not found");
    const { id: _id, ...data } = b;
    try {
      await this.deliver(
        b,
        noticeText({
          event: "run",
          title: language === "tr" ? "Deneme bildirimi: köprü çalışıyor." : "Test notice: the bridge works.",
        }),
      );
      this.save(id, { ...data, lastSentAt: Date.now(), lastError: undefined });
    } catch (err) {
      this.save(id, { ...data, lastError: (err as Error).message.slice(0, 200) });
    }
    return this.list().find((x) => x.id === id) as Bridge;
  }
}
