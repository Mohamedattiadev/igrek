import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bridges, noticeText } from "./bridges";
import { openDb } from "./db";
import { Sealer } from "./seal";

// A tiny SMTP server that accepts one mail and keeps it.
const mails: string[] = [];
const smtp = Bun.listen<{ data: boolean; buf: string }>({
  hostname: "127.0.0.1",
  port: 0,
  socket: {
    open(s) {
      s.data = { data: false, buf: "" };
      s.write("220 fake ESMTP\r\n");
    },
    data(s, chunk) {
      s.data.buf += chunk.toString();
      let i = s.data.buf.indexOf("\r\n");
      while (i >= 0) {
        const line = s.data.buf.slice(0, i);
        s.data.buf = s.data.buf.slice(i + 2);
        if (s.data.data) {
          if (line === ".") {
            s.data.data = false;
            s.write("250 queued\r\n");
          } else mails[mails.length - 1] += `${line}\n`;
        } else if (/^EHLO|^HELO/i.test(line)) s.write("250-fake\r\n250 OK\r\n");
        else if (/^DATA/i.test(line)) {
          s.data.data = true;
          mails.push("");
          s.write("354 go\r\n");
        } else if (/^QUIT/i.test(line)) s.write("221 bye\r\n");
        else s.write("250 OK\r\n");
        i = s.data.buf.indexOf("\r\n");
      }
    },
  },
});
afterAll(() => smtp.stop(true));

describe("notification bridges", () => {
  test("Telegram and Discord get a short scrubbed notice; secrets are stored encrypted; events are filtered", async () => {
    const { sqlite } = openDb(":memory:");
    const calls: { url: string; body: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const bridges = new Bridges(
      sqlite,
      new Sealer(mkdtempSync(join(tmpdir(), "godeye-br-"))),
      fetcher,
      "http://localhost:7777",
    );
    await expect(bridges.add({ kind: "telegram", secrets: { token: "nope", chatId: "1" } })).rejects.toThrow();
    const tg = await bridges.add({
      kind: "telegram",
      secrets: { token: "123456:ABCDEFGHIJKLMNOPQRSTUVWX", chatId: "998877" },
    });
    await bridges.add({
      kind: "discord",
      events: ["down"],
      secrets: { webhook: "https://discord.com/api/webhooks/1/abc-DEF" },
    });
    expect(JSON.stringify(sqlite.query("SELECT * FROM bridges").all())).not.toContain("ABCDEFGHIJ");
    expect(tg.target).toBe("chat 998877");
    expect(await bridges.send({ event: "approval", title: "rm -rf build", link: "/inbox" })).toBe(1);
    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWX/sendMessage");
    expect(JSON.parse(calls[0]?.body ?? "{}").text).toBe("God Eye · rm -rf build\nhttp://localhost:7777/inbox");
    expect(await bridges.send({ event: "down", title: "shop.com" })).toBe(2);
    expect(calls[2]?.url).toContain("discord.com");
    const key = ["sk", "live", "Q".repeat(24)].join("_");
    expect(noticeText({ event: "appError", title: `Error with ${key}` })).not.toContain(key);
  });

  test("e-mail goes through your own SMTP server", async () => {
    const { sqlite } = openDb(":memory:");
    const bridges = new Bridges(sqlite, new Sealer(mkdtempSync(join(tmpdir(), "godeye-br-"))));
    const mail = await bridges.add({
      kind: "email",
      secrets: { host: "127.0.0.1", port: smtp.port, from: "godeye@me.test", to: "me@me.test" },
    });
    const tested = await bridges.test(mail.id, "tr");
    expect(tested.lastError).toBeUndefined();
    expect(mails.at(-1)).toContain("Deneme bildirimi");
    expect(mails.at(-1)).toContain("To: me@me.test");
  });
});
