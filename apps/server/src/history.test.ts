import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  aboutFuture,
  emptyOrg,
  foldOrg,
  newCard,
  orgItems,
  periodOf,
  search,
  type TimelineItem,
  upcoming,
} from "@igrek/core";
import { migrate } from "./db";
import { projectHistory } from "./history";

const NOW = Date.UTC(2026, 9, 28, 10);
const DAY = 86_400_000;

describe("asking the history (plan.md 20.9)", () => {
  const items: TimelineItem[] = [
    {
      id: "1",
      at: NOW - 40 * DAY,
      kind: "session",
      who: "kerim",
      text: "Sunucu çöktü: disk doldu, eski logları sildim ve logrotate kurdum",
    },
    { id: "2", at: NOW - 35 * DAY, kind: "message", who: "ali", text: "Sunucu yeniden ayakta" },
    { id: "3", at: NOW - 3 * DAY, kind: "card", who: "ayse", text: "Ödeme modülü (done)" },
    { id: "4", at: NOW - 2 * DAY, kind: "decision", who: "gm", text: "Ödeme Stripe ile yapılacak" },
  ];

  test("'who fixed last month's server problem?' finds the work, with its date", () => {
    const found = search(items, "Geçen ayki sunucu sorununu kim çözmüştü?", NOW);
    expect(found[0]?.item.id).toBe("1");
    expect(found.every((f) => f.item.at < NOW - 25 * DAY)).toBe(true);
  });

  test("'when did the payment module finish?'", () => {
    expect(search(items, "ödeme modülü ne zaman bitti", NOW)[0]?.item.id).toBe("3");
  });

  test("periods and questions about what is coming", () => {
    expect(periodOf("last week", NOW)?.from).toBe(NOW - 14 * DAY);
    expect(aboutFuture("gelecek hafta ne var?")).toBe(true);
    expect(aboutFuture("Kerim geçen ay neler yaptı?")).toBe(false);
    const state = emptyOrg();
    const c = newCard({ title: "Release", assignee: "kerim", due: NOW + 3 * DAY }, "gm", NOW);
    foldOrg(state, "org-card", c as never, { author: "gm", at: NOW });
    state.availability.ali = {
      from: 540,
      to: 1080,
      days: [1, 2, 3, 4, 5],
      leave: [{ from: NOW + DAY, to: NOW + 5 * DAY }],
      tz: 0,
    };
    expect(upcoming(state, "gelecek hafta ne var?", NOW).map((i) => i.text)).toEqual(["Release"]);
    expect(upcoming(state, "kimin izni var?", NOW).map((i) => i.who)).toEqual(["ali"]);
    expect(orgItems(state).map((i) => i.text)).toEqual(["Release (created)"]);
  });

  test("this computer's part: no private session ever", () => {
    const db = new Database(":memory:");
    migrate(db);
    db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'shop', '/s', 1)").run();
    db.query(
      "INSERT INTO sessions (id, project_id, tool, title, started_at, updated_at, private) VALUES ('a','p','claude','open work',1,2,0), ('b','p','claude','private work',1,3,1)",
    ).run();
    const out = projectHistory(db, [{ id: "p", key: "k" }], "me");
    expect(out.map((i) => i.text)).toEqual(["open work"]);
  });

  test("an edited and then deleted message keeps what it said, for the timeline", async () => {
    const { Chat } = await import("./team-chat");
    const { Bus } = await import("./bus");
    const db = new Database(":memory:");
    migrate(db);
    db.query("INSERT INTO projects (id, name, path, created_at) VALUES ('p', 'shop', '/s', 1)").run();
    const chat = new Chat(db, new Bus());
    const id = chat.post({ projectId: "p", channel: "p:general", text: "deploy at 5", author: "me", mentions: [] });
    chat.edit(id, "deploy at 6");
    chat.remove(id);
    const item = projectHistory(db, [{ id: "p", key: "k" }], "me").find((i) => i.id === `message:${id}`);
    expect(item?.text).toBe("");
    expect(item?.previous?.map((p) => p.text)).toEqual(["deploy at 5", "deploy at 6"]);
  });
});

describe("by meaning too (plan.md 20.9)", () => {
  test("a question finds what means the same in other words, with a stand-in model", async () => {
    const { HistorySearch, fuse } = await import("./history-search");
    // A tiny model: texts about money point one way, about servers another.
    const vector = (t: string) => {
      const money = /ödeme|fatura|para|payment|invoice/i.test(t) ? 1 : 0;
      const server = /sunucu|server|disk|log/i.test(t) ? 1 : 0;
      const n = Math.hypot(money, server) || 1;
      return new Float32Array([money / n, server / n]);
    };
    const ask = new HistorySearch({
      status: () => ({}) as never,
      ready: () => true,
      embed: async (texts) => texts.map(vector),
    });
    const items: TimelineItem[] = [
      { id: "a", at: NOW - DAY, kind: "session", who: "k", text: "disk doldu, logları temizledim" },
      { id: "b", at: NOW - DAY, kind: "card", who: "a", text: "fatura PDF'i" },
    ];
    const found = await ask.find(items, "sunucu neden durdu?", NOW);
    expect(found[0]?.id).toBe("a");
    expect(fuse([[items[0] as TimelineItem], [items[1] as TimelineItem, items[0] as TimelineItem]])[0]?.id).toBe("a");
  });
});
