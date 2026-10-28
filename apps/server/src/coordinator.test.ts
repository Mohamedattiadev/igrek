import { describe, expect, test } from "bun:test";
import {
  answerFromCards,
  changeCard,
  dueIn,
  emptyOrg,
  foldOrg,
  followUps,
  morningReport,
  newCard,
  type OrgStructure,
  pickAssignee,
  understand,
} from "@igrek/core";

// A Wednesday morning, 10:00 local time.
const WED = new Date(2026, 9, 28, 10, 0).getTime();
const HOUR = 3_600_000;

const structure: OrgStructure = {
  generalManagers: ["gm"],
  teams: [
    {
      id: "be",
      name: "Backend",
      description: "API, ödeme, veritabanı, payment",
      leadId: "lead",
      members: ["lead", "kerim", "ali"],
      projects: [],
    },
    {
      id: "fe",
      name: "Frontend",
      description: "arayüz, buton, tasarım, mobile, css",
      leadId: "zeynep",
      members: ["zeynep", "can"],
      projects: [],
    },
    { id: "qa", name: "QA", description: "test, hata, regression", leadId: "ayse", members: ["ayse"], projects: [] },
  ],
};
const people = [
  { id: "gm", username: "hoca", displayName: "Hoca" },
  { id: "lead", username: "lead", displayName: "Murat" },
  { id: "kerim", username: "kerim", displayName: "Kerim" },
  { id: "ali", username: "ali", displayName: "Ali" },
  { id: "zeynep", username: "zeynep", displayName: "Zeynep" },
  { id: "can", username: "can", displayName: "Can" },
  { id: "ayse", username: "ayse", displayName: "Ayşe" },
];
const ctx = { structure, people, botHandle: "asistan", now: WED };

describe("understanding the manager", () => {
  test("a day, tomorrow, a date", () => {
    expect(new Date(dueIn("Cuma'ya bitsin", WED) ?? 0).getDay()).toBe(5);
    expect(new Date(dueIn("by friday", WED) ?? 0).getDate()).toBe(30);
    expect(new Date(dueIn("yarın", WED) ?? 0).getDate()).toBe(29);
    expect(new Date(dueIn("tomorrow please", WED) ?? 0).getHours()).toBe(18);
    expect(new Date(dueIn("15.11'e kadar", WED) ?? 0).getMonth()).toBe(10);
    expect(dueIn("ödeme sayfası", WED)).toBeUndefined();
  });

  test("a task with a team by what it is responsible for, and a named person", () => {
    const a = understand("@asistan Cuma'ya ödeme sayfası bitsin", ctx);
    expect(a).toMatchObject({ kind: "task", team: "be" });
    if (a.kind !== "task") throw new Error("not a task");
    expect(a.title.toLowerCase()).toContain("ödeme sayfası");
    expect(new Date(a.due ?? 0).getDay()).toBe(5);
    const b = understand("ödeme sayfası Cuma'ya bitsin, Kerim baksın", ctx);
    expect(b).toMatchObject({ kind: "task", person: "kerim", team: "be" });
    expect(understand("ACİL: login hatası, @ali", ctx)).toMatchObject({
      kind: "task",
      person: "ali",
      priority: "urgent",
    });
    expect(understand("the payment API is down, urgent", ctx)).toMatchObject({
      kind: "task",
      team: "be",
      priority: "urgent",
    });
  });

  test("when it cannot tell whose it is, one question", () => {
    const a = understand("rapor ekranını güncelleyin", ctx);
    expect(a.kind).toBe("ask");
    if (a.kind === "ask") expect(a.draft.options.length).toBeGreaterThan(1);
  });

  test("a question is answered, not turned into a card", () => {
    expect(understand("QA bu hafta neyi test etti?", ctx)).toMatchObject({ kind: "question", team: "qa" });
    expect(understand("what did backend finish last week?", ctx)).toMatchObject({ kind: "question", team: "be" });
  });
});

describe("the coordinator's scenarios (plan.md 20.7)", () => {
  test("(a) Friday's payment page goes to the least busy backend person; reminders; done reaches the manager", () => {
    const state = emptyOrg();
    // Ali already holds two cards; Kerim none.
    for (const title of ["one", "two"]) {
      const c = newCard({ title, assignee: "ali", team: "be" }, "lead", WED - 3 * HOUR);
      foldOrg(state, "org-card", c as never, { author: "lead", at: c.at });
    }
    const asked = understand("@asistan Cuma'ya ödeme sayfası", ctx);
    if (asked.kind !== "task") throw new Error("not a task");
    const pick = pickAssignee(structure, state, asked);
    expect(pick.assignee).toBe("kerim");
    expect(pick.say?.key).toBe("reasonLoad");
    const card = newCard(
      {
        title: asked.title,
        team: asked.team,
        assignee: pick.assignee,
        due: asked.due,
        origin: "bot",
        requestedBy: "gm",
      },
      "gm",
      WED,
    );
    foldOrg(state, "org-card", card as never, { author: "gm", at: WED });
    // Wednesday 10:00 to Friday 18:00: past half-way on Thursday afternoon, not started yet.
    const thursday = WED + 30 * HOUR;
    const ups = followUps(structure, state, thursday);
    const mine = ups.filter((u) => u.card === card.id);
    expect(mine.map((u) => u.stage)).toEqual(["nudge"]);
    expect(mine[0]?.to).toEqual(["kerim"]);
    // Friday afternoon, due in hours: Kerim and his lead.
    const nudged = { ...state.cards[card.id], told: { nudge: thursday } };
    foldOrg(state, "org-card", { ...nudged, updatedAt: thursday } as never, { author: "gm", at: thursday });
    const soon = followUps(structure, state, WED + 52 * HOUR).find((u) => u.card === card.id);
    expect(soon).toMatchObject({ stage: "soon", to: ["kerim", "lead"] });
    // Done: the one who asked hears of it, once.
    const done = changeCard(state.cards[card.id] as never, { status: "done" }, "kerim", "done", WED + 54 * HOUR);
    foldOrg(state, "org-card", done as never, { author: "kerim", at: WED + 54 * HOUR });
    expect(followUps(structure, state, WED + 55 * HOUR).find((u) => u.card === card.id)).toMatchObject({
      stage: "done",
      to: ["gm"],
    });
  });

  test("late goes to the lead, then the general manager", () => {
    const state = emptyOrg();
    const card = newCard({ title: "Fix login", assignee: "kerim", team: "be", due: WED - HOUR }, "gm", WED - 48 * HOUR);
    foldOrg(state, "org-card", card as never, { author: "gm", at: card.at });
    expect(followUps(structure, state, WED)).toEqual([
      {
        card: card.id,
        stage: "late",
        to: ["lead", "gm"],
        say: { key: "late", vars: { title: "Fix login", who: "kerim" } },
      },
    ]);
  });

  test("(b) a note from the preview becomes a Frontend card", () => {
    const asked = understand("ödeme butonu mobilde çok küçük", ctx);
    expect(asked).toMatchObject({ kind: "task", team: "fe" });
  });

  test("(c) QA's bug goes to whoever in Backend is free, not to someone away", () => {
    const state = emptyOrg();
    state.availability.kerim = {
      from: 540,
      to: 1080,
      days: [1, 2, 3, 4, 5],
      leave: [{ from: WED - HOUR, to: WED + 72 * HOUR }],
      tz: 0,
    };
    const c = newCard({ title: "busy", assignee: "lead", team: "be" }, "lead", WED);
    foldOrg(state, "org-card", c as never, { author: "lead", at: WED });
    expect(pickAssignee(structure, state, { team: "be" }, WED).assignee).toBe("ali");
  });

  test("(d) 'what finished last week?' from the history, and the morning report", () => {
    const state = emptyOrg();
    const old = newCard(
      { title: "Old work", assignee: "ayse", team: "qa", status: "done" },
      "ayse",
      WED - 20 * 86_400_000,
    );
    const fresh = newCard(
      { title: "Checkout tests", assignee: "ayse", team: "qa", status: "done" },
      "ayse",
      WED - 2 * 86_400_000,
    );
    const late = newCard({ title: "Release notes", assignee: "can", due: WED - HOUR }, "gm", WED - 3 * 86_400_000);
    for (const card of [old, fresh, late]) foldOrg(state, "org-card", card as never, { author: card.by, at: card.at });
    const q = understand("QA geçen hafta ne bitirdi?", ctx);
    if (q.kind !== "question") throw new Error("not a question");
    expect(answerFromCards(structure, state, q, WED).map((c) => c.title)).toEqual(["Checkout tests"]);
    expect(morningReport(state, WED).vars).toMatchObject({ late: 1, lateList: "Release notes" });
  });
});

describe("cards changed on two computers while apart", () => {
  test("the newer wins and the other side's change is kept as a conflict, nothing lost", () => {
    const state = emptyOrg();
    const card = newCard({ title: "Deploy", assignee: "kerim" }, "gm", WED);
    foldOrg(state, "org-card", card as never, { author: "gm", at: WED });
    const a = changeCard(card, { title: "Deploy on Friday" }, "kerim", "renamed", WED + 1000);
    const b = changeCard(card, { status: "doing" }, "ali", "started", WED + 2000);
    foldOrg(state, "org-card", a as never, { author: "kerim", at: WED + 1000 });
    foldOrg(state, "org-card", b as never, { author: "ali", at: WED + 2000 });
    const merged = state.cards[card.id];
    expect(merged?.status).toBe("doing");
    expect(merged?.conflict?.fields.title).toBe("Deploy on Friday");
    expect(merged?.history.map((h) => h.what)).toEqual(["created", "renamed", "started"]);
    // Folded the other way round, both computers end up the same.
    const other = emptyOrg();
    foldOrg(other, "org-card", card as never, { author: "gm", at: WED });
    foldOrg(other, "org-card", b as never, { author: "ali", at: WED + 2000 });
    foldOrg(other, "org-card", a as never, { author: "kerim", at: WED + 1000 });
    expect(other.cards[card.id]?.status).toBe("doing");
    expect(other.cards[card.id]?.conflict?.fields.title).toBe("Deploy on Friday");
  });
});

describe("the bot's words on a phone", () => {
  test("told in the reader's language, with the reason filled in", async () => {
    const { botText } = await import("./org");
    expect(botText({ key: "forYou", vars: { title: "Fatura", due: 0 } }, "tr")).toBe(
      'Sana yeni bir kart: "Fatura", son tarih -.',
    );
    expect(
      botText(
        { key: "gave", vars: { title: "Pay", who: "Kerim", team: "Backend", due: 0, why: "reasonLoad", count: 1 } },
        "en",
      ),
    ).toContain("least work in Backend right now (1 open)");
  });
});
