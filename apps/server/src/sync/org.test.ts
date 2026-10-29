import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeCard, type OrgStructure } from "@igrek/core";
import { Hub } from "../../../hub/src/hub";
import { createHubServer } from "../../../hub/src/server";
import { MemberClient, type MemberStore } from "../../../web/src/member/client";
import { Bus } from "../bus";
import { migrate } from "../db";
import { Org } from "../org";
import { Telegram } from "../telegram";
import { Sync } from "./client";

// The company (plan.md 20.2-20.7) across a real hub: the general manager's Igrek (which runs the
// coordinator bot), Kerim's Igrek, and Ayse in the hub's web page, all on one encrypted stream.
const dir = mkdtempSync(join(tmpdir(), "igrek-org-"));
const hub = new Hub(join(dir, "hub.db"));
const handler = createHubServer(hub);
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler.fetch, websocket: handler.websocket });
const hubUrl = `http://127.0.0.1:${server.port}`;
afterAll(() => server.stop(true));

function memoryStore(): MemberStore {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => data.get(k) as T | undefined,
    set: async (k, v) => void data.set(k, v),
    delete: async (k) => void data.delete(k),
  };
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(50);
  }
}

/** An Igrek on a computer with the company attached, as index.ts wires it. */
function igrek(name: string): { sync: Sync; org: Org; db: Database; bus: Bus } {
  const db = new Database(":memory:");
  migrate(db);
  const bus = new Bus();
  const sync = new Sync(db, bus, join(dir, `${name}.json`), () => name);
  const org = new Org({
    db,
    bus,
    me: () => sync.memberList().find((m) => m.id === sync.identity().id),
    people: () => sync.memberList(),
    hub: (path, init) => sync.hub(path, init),
    publish: (kind, id, value) => sync.publishOrg(kind, id, value),
  });
  sync.org = org;
  return { sync, org, db, bus };
}

describe("the company across a hub", () => {
  const gm = igrek("gm");
  const kerim = igrek("kerim");
  const browser = new MemberClient(memoryStore(), hubUrl);
  const ids: Record<string, string> = {};
  let teams: OrgStructure["teams"] = [];

  test("the general manager makes teams; a team's project is only for its people", async () => {
    const boss = await hub.createUser({
      username: "hoca",
      password: "hoca-password-1",
      role: "admin",
      mustChange: false,
    });
    hub.updateUser(boss.id, { generalManager: true, displayName: "Hoca" });
    await gm.sync.connect({ hub: hubUrl, username: "hoca", password: "hoca-password-1" });
    await until(() => gm.sync.status().connected);
    for (const name of ["kerim", "ali", "ayse"]) {
      const u = await hub.createUser({
        username: name,
        password: `${name}-password-1`,
        role: "member",
        mustChange: false,
      });
      ids[name] = u.id;
    }
    ids.hoca = boss.id;
    const backend = await gm.sync.hub<{ id: string }>("/api/org/teams", {
      method: "POST",
      body: JSON.stringify({ name: "Backend", description: "API, ödeme, payment, database", leadId: ids.kerim }),
    });
    const qa = await gm.sync.hub<{ id: string }>("/api/org/teams", {
      method: "POST",
      body: JSON.stringify({ name: "QA", description: "test, hata" }),
    });
    await gm.sync.hub(`/api/org/teams/${qa.id}/members/${ids.ayse}`, { method: "PUT" });
    await gm.sync.hub(`/api/org/teams/${backend.id}/members/${ids.ali}`, { method: "PUT" });
    const secret = "a".repeat(64);
    await gm.sync.hub(`/api/org/teams/${backend.id}/projects/${secret}`, { method: "PUT" });
    teams = (await gm.sync.hub<OrgStructure>("/api/org")).teams;
    expect(teams.map((t) => t.name).sort()).toEqual(["Backend", "QA"]);
    const user = (id: string) =>
      hub.user(id) ??
      (() => {
        throw new Error("no user");
      })();
    expect(hub.roleIn(user(ids.kerim as string), secret)).toBe("manager");
    expect(hub.roleIn(user(ids.ali as string), secret)).toBe("member");
    expect(hub.roleIn(user(ids.ayse as string), secret)).toBeUndefined();
    expect(hub.roleIn(user(ids.hoca as string), secret)).toBe("owner");
    // Out of the team, out of its project.
    await gm.sync.hub(`/api/org/teams/${backend.id}/members/${ids.ali}`, { method: "DELETE" });
    expect(hub.roleIn(user(ids.ali as string), secret)).toBeUndefined();
    await gm.sync.hub(`/api/org/teams/${backend.id}/members/${ids.ali}`, { method: "PUT" });
    // A member cannot make teams.
    await kerim.sync.connect({ hub: hubUrl, username: "kerim", password: "kerim-password-1" });
    await expect(
      kerim.sync.hub("/api/org/teams", { method: "POST", body: JSON.stringify({ name: "X" }) }),
    ).rejects.toThrow();
  }, 30_000);

  test("Kerim's Igrek and Ayse's browser join with the team key", async () => {
    await browser.signIn("ayse", "ayse-password-1");
    for (const r of (await gm.sync.keyRequests()).requests) await gm.sync.approveDevice(r.deviceId).catch(() => 0);
    await browser.resume();
    await until(() => kerim.sync.status().connected && browser.state.phase === "ready");
    await until(() => browser.structure.teams.length === 2 && kerim.org.structure.teams.length === 2);
    await Bun.sleep(3200); // past the replay, so what comes is news
  }, 40_000);

  test("(a) the manager writes to the bot; it gives the card to Kerim and tells everyone", async () => {
    await gm.org.act("org-bot", { name: "Asistan", handle: "asistan", host: ids.hoca, reportHour: -1, enabled: true });
    await until(() => browser.org.bot.enabled && kerim.org.state.bot.enabled);
    // Ali already holds one, so Kerim (the lead, who counts half) is still the least busy.
    await gm.org.act("org-card", {
      id: "busy-ali",
      title: "Older work",
      assignee: ids.ali,
      status: "doing",
      priority: "normal",
      origin: "manual",
      requestedBy: ids.hoca,
      history: [],
    });
    await gm.org.post({ channel: `bot:${ids.hoca}`, text: "@asistan Cuma'ya ödeme sayfası bitsin" });
    await until(() => Object.values(kerim.org.state.cards).some((c) => c.title.toLowerCase().includes("ödeme")));
    const card = Object.values(kerim.org.state.cards).find((c) => c.title.toLowerCase().includes("ödeme"));
    expect(card).toMatchObject({ assignee: ids.kerim, origin: "bot", requestedBy: ids.hoca });
    expect(new Date(card?.due ?? 0).getDay()).toBe(5);
    await until(() => !!browser.org.cards[card?.id ?? ""]);
    // The manager hears to whom and why; Kerim hears of his new card.
    await until(() =>
      Object.values(browser.org.posts).some((p) => p.channel === `bot:${ids.hoca}` && p.say?.key === "gave"),
    );
    await until(() =>
      Object.values(kerim.org.state.posts).some((p) => p.channel === `bot:${ids.kerim}` && p.say?.key === "forYou"),
    );
    // Kerim finishes it; the bot tells the manager.
    if (!card) throw new Error("no card");
    await kerim.org.act(
      "org-card",
      changeCard(card, { status: "done" }, ids.kerim as string, "done") as unknown as Record<string, unknown>,
    );
    await until(() => gm.org.state.cards[card.id]?.status === "done");
    await gm.org.tick();
    await until(() => Object.values(browser.org.posts).some((p) => p.say?.key === "done" && p.card === card.id));
    expect(gm.org.state.cards[card.id]?.told?.done).toBeGreaterThan(0);
  }, 40_000);

  test("a member cannot give work through the bot; the bot says so", async () => {
    await browser.orgPost({ channel: "general", text: "@asistan ali yarın raporu yazsın" });
    await until(() => Object.values(gm.org.state.posts).some((p) => p.say?.key === "notAllowed"));
  }, 20_000);

  test("announcements: everyone sees them, the writer sees who read them; @qa reaches its team", async () => {
    const posted = (await gm.org.post({ channel: "general", text: "Cuma toplantı yok", announce: true })) as {
      id: string;
    };
    await until(() => !!browser.org.posts[posted.id]);
    await browser.orgAct("org-read", { id: posted.id, at: Date.now() });
    await until(() => !!gm.org.state.reads[posted.id]?.[ids.ayse as string]);
    const tagged = (await kerim.org.post({
      channel: `team:${teams.find((t) => t.name === "QA")?.id}`,
      text: "@qa ödeme testleri hazır mı?",
    })) as { id: string };
    await until(() => !!browser.org.posts[tagged.id]);
    const qaId = teams.find((t) => t.name === "QA")?.id ?? "";
    expect(browser.org.posts[tagged.id]?.teamMentions).toEqual([qaId]);
  }, 20_000);

  test("a request from QA to Backend: accepted there, done, back to QA", async () => {
    const qa = teams.find((t) => t.name === "QA")?.id ?? "";
    const be = teams.find((t) => t.name === "Backend")?.id ?? "";
    const asked = await browser.orgAct("org-card", {
      title: "Ödemede hata",
      team: be,
      fromTeam: qa,
      status: "open",
      priority: "high",
      origin: "manual",
      requestedBy: ids.ayse,
      updatedAt: Date.now(),
      history: [],
    });
    const id = String(asked.id);
    await until(() => !!kerim.org.state.cards[id]);
    const card = kerim.org.state.cards[id];
    if (!card) throw new Error("no card");
    await kerim.org.act(
      "org-card",
      changeCard(card, { status: "accepted", assignee: ids.ali }, ids.kerim as string, "accepted") as unknown as Record<
        string,
        unknown
      >,
    );
    await until(() => browser.org.cards[id]?.status === "accepted");
    const accepted = browser.org.cards[id];
    if (!accepted) throw new Error("no card");
    await kerim.org.act(
      "org-card",
      changeCard(accepted, { status: "done" }, ids.kerim as string, "done") as unknown as Record<string, unknown>,
    );
    await until(() => browser.org.cards[id]?.status === "done");
    expect(browser.org.cards[id]?.history.map((h) => h.what)).toEqual(["accepted", "done"]);
  }, 20_000);

  test("offline: written while the hub is unreachable, sent when it is back, nothing lost", async () => {
    const socket = kerim.sync as unknown as { close: () => void; open: () => void };
    socket.close();
    await kerim.org.act("org-post", { channel: "general", text: "written offline", mentions: [], teamMentions: [] });
    expect(kerim.org.waiting()).toBe(1);
    socket.open();
    await until(() => kerim.sync.status().connected);
    await kerim.sync.flush();
    await until(() => Object.values(browser.org.posts).some((p) => p.text === "written offline"));
    expect(kerim.org.waiting()).toBe(0);
  }, 30_000);

  test("a call's messages go from Igrek's page through its hub connection and back as events", async () => {
    const room = "c".repeat(64);
    const heard: { op: string; device?: string; data?: string }[] = [];
    kerim.bus.subscribe((m) => {
      if (m.type === "call") heard.push(m);
    });
    expect(gm.sync.call({ op: "join", room, name: "Hoca" })).toBe(true);
    expect(kerim.sync.call({ op: "join", room, name: "Kerim" })).toBe(true);
    await until(() => heard.some((m) => m.op === "peers"));
    gm.sync.call({ op: "signal", room, data: "sealed offer" });
    await until(() => heard.some((m) => m.op === "signal" && m.data === "sealed offer"));
    gm.sync.call({ op: "leave", room });
    await until(() => heard.some((m) => m.op === "left"));
  }, 20_000);

  test("'30 minutes with Kerim this week': the bot finds a free time and invites him (plan.md 20.11)", async () => {
    await gm.org.post({ channel: `bot:${ids.hoca}`, text: "@asistan Kerim'le bu hafta 30 dakika konuşalım" });
    await until(() => Object.values(kerim.org.state.meetings).some((m) => m.attendees.includes(ids.kerim as string)));
    const m = Object.values(kerim.org.state.meetings).find((x) => x.attendees.includes(ids.kerim as string));
    expect(m).toMatchObject({ minutes: 30, by: ids.hoca });
    expect(m?.start).toBeGreaterThan(Date.now());
    await until(() =>
      Object.values(kerim.org.state.posts).some((p) => p.channel === `bot:${ids.kerim}` && p.say?.key === "meetInvite"),
    );
    await until(() => Object.values(browser.org.posts).some((p) => p.say?.key === "meetBooked"));
  }, 20_000);

  test("from the phone: '@asistan ...' on Telegram reaches the bot, and its answer goes back (plan.md 20.11)", async () => {
    const sent: string[] = [];
    const fake = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      if (body.text) sent.push(body.text);
      return new Response(JSON.stringify({ ok: true, result: {} }));
    }) as unknown as typeof fetch;
    const phone = new Telegram(
      mkdtempSync(join(dir, "tg-")),
      {} as never,
      {
        send: () => undefined,
        answer: () => undefined,
        listen: () => () => undefined,
        events: () => [],
        threadName: () => "",
      },
      () => [],
      fake,
    );
    Object.assign(phone as unknown as { token: string; saved: { chatId: number } }, {
      token: "x",
      saved: { chatId: 42 },
    });
    phone.toCompany = (text) => gm.org.fromPhone(text);
    gm.org.onTell = (text) => phone.tell(text);
    gm.org.language = () => "tr";
    await phone.handle({
      update_id: 1,
      message: { chat: { id: 42 }, text: "@asistan yarın Ali fatura ekranını bitirsin" },
    });
    await until(() =>
      Object.values(kerim.org.state.cards).some((c) => c.title.toLowerCase().includes("fatura ekranını")),
    );
    const card = Object.values(kerim.org.state.cards).find((c) => c.title.toLowerCase().includes("fatura ekranını"));
    expect(card?.assignee).toBe(ids.ali);
    await until(() => sent.some((t) => t.includes("Fatura ekranını") || t.includes("fatura ekranını")));
    // Anything else still goes to the chief.
    expect(await gm.org.fromPhone("hello chief")).toBe(false);
  }, 20_000);

  test("'who fixed last month's server problem?' to the bot: answered from the history, with the date", async () => {
    const at = Date.now() - 40 * 86_400_000;
    gm.org.history = async () => [
      { id: "s1", at, kind: "session", who: ids.kerim as string, text: "Sunucu çöktü: disk doldu, logları temizledim" },
    ];
    await gm.org.post({ channel: `bot:${ids.hoca}`, text: "@asistan geçen ayki sunucu sorununu kim çözmüştü?" });
    await until(() => Object.values(gm.org.state.posts).some((p) => p.say?.key === "answerHistory"));
    const said = Object.values(gm.org.state.posts).find((p) => p.say?.key === "answerHistory");
    expect(String(said?.say?.vars?.list)).toContain(new Date(at).toISOString().slice(0, 10));
    expect(String(said?.say?.vars?.list)).toContain("disk doldu");
  }, 20_000);

  test("a card for a team bot: its Igrek starts the job, and the card follows the run (plan.md 20.3)", async () => {
    const started: string[] = [];
    // Kerim's Igrek reconnected in an earlier test: past its replay, cards are news again.
    await until(() => (kerim.org as never as { live: boolean }).live);
    kerim.org.teamBots = {
      list: () => [{ handle: "john", name: "John" }],
      start: async (handle, card) => {
        started.push(`${handle}:${card.title}`);
        return "run-1";
      },
    };
    await kerim.org.announceBots();
    await until(() => (browser.org.bots[ids.kerim as string] ?? []).some((b) => b.handle === "john"));
    const asked = (await gm.org.act("org-card", {
      title: "Sepete kupon",
      assignee: "bot:john",
      status: "accepted",
      priority: "normal",
      origin: "manual",
      requestedBy: ids.hoca,
      history: [],
    })) as { id: string };
    await until(() => kerim.org.state.cards[asked.id]?.status === "doing");
    expect(started).toEqual(["john:Sepete kupon"]);
    await kerim.org.runChanged("run-1", "ready");
    await until(() => browser.org.cards[asked.id]?.status === "review");
  }, 20_000);

  test("(b) a note from the preview, fixed: whoever left it gets a picture of the page now", async () => {
    gm.org.shoot = async () => "data:image/jpeg;base64,/9j/4AAQ";
    const note = (await gm.org.act("org-card", {
      title: "Öde butonu küçük",
      origin: "preview",
      note: { url: "http://localhost:5173/checkout" },
      assignee: ids.kerim,
      status: "accepted",
      priority: "normal",
      requestedBy: ids.hoca,
      history: [],
    })) as { id: string };
    await until(() => !!kerim.org.state.cards[note.id]);
    const card = kerim.org.state.cards[note.id];
    if (!card) throw new Error("no card");
    await kerim.org.act(
      "org-card",
      changeCard(card, { status: "done" }, ids.kerim as string, "done") as unknown as Record<string, unknown>,
    );
    await until(() => gm.org.state.cards[note.id]?.status === "done");
    await gm.org.tick();
    await until(() =>
      Object.values(browser.org.posts).some((p) => p.card === note.id && p.image?.startsWith("data:image/jpeg")),
    );
  }, 20_000);
});
