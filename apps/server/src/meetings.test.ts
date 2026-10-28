import { describe, expect, test } from "bun:test";
import {
  emptyOrg,
  foldOrg,
  freeSlots,
  fromIcs,
  meetingNotices,
  mergeMeeting,
  newMeetingKey,
  type OrgMeeting,
  occurrences,
  roomOfMeeting,
  toIcs,
} from "@igrek/core";

// Monday 27 Oct 2026, 09:00 UTC; everyone in UTC (tz 0) for the arithmetic to be plain.
const MON = Date.UTC(2026, 9, 26, 9, 0);
const HOUR = 3_600_000;
const work = { from: 9 * 60, to: 18 * 60, days: [1, 2, 3, 4, 5], leave: [] as { from: number; to: number }[], tz: 0 };

function meeting(over: Partial<OrgMeeting>): OrgMeeting {
  return {
    id: "m1",
    title: "Standup",
    agenda: "",
    start: MON,
    minutes: 30,
    recurrence: "none",
    attendees: ["gm", "kerim"],
    teams: [],
    key: newMeetingKey(),
    replies: {},
    consent: {},
    status: "planned",
    transcript: [],
    decisions: [],
    actions: [],
    by: "gm",
    at: MON - HOUR,
    updatedAt: MON - HOUR,
    ...over,
  };
}

describe("the calendar (plan.md 20.8)", () => {
  test("a weekly meeting happens every week, a cancelled one never", () => {
    const m = meeting({ recurrence: "weekly" });
    expect(occurrences(m, MON, MON + 15 * 86_400_000)).toEqual([MON, MON + 7 * 86_400_000, MON + 14 * 86_400_000]);
    expect(occurrences({ ...m, status: "cancelled" }, MON, MON + 15 * 86_400_000)).toEqual([]);
  });

  test("'30 minutes with Kerim': skips the meeting, his time off and the evening", () => {
    const busy = meeting({ start: MON + HOUR, minutes: 60 }); // 10:00-11:00
    const ctx = {
      availability: { gm: work, kerim: { ...work, leave: [{ from: MON + 2 * HOUR, to: MON + 3 * HOUR }] } }, // off 11-12
      meetings: [busy],
    };
    const slots = freeSlots(["gm", "kerim"], 30, ctx, { from: MON, limit: 3 });
    expect(slots.map((s) => new Date(s).getUTCHours() * 60 + new Date(s).getUTCMinutes())).toEqual([
      9 * 60,
      9 * 60 + 30,
      12 * 60,
    ]);
    // Friday 17:45 has no room for 30 minutes before 18:00; the next one is Monday morning.
    const friday = MON + 4 * 86_400_000 + 8.75 * HOUR;
    expect(
      new Date(
        freeSlots(["gm"], 30, { availability: { gm: work }, meetings: [] }, { from: friday, limit: 1 })[0] ?? 0,
      ).getUTCDay(),
    ).toBe(1);
  });

  test(".ics out and back in", () => {
    const m = meeting({ title: "Plan, review; demo", agenda: "1. API\n2. UI", recurrence: "weekly" });
    const text = toIcs([m], (id) => id.toUpperCase());
    expect(text).toContain("RRULE:FREQ=WEEKLY");
    expect(text).toContain(String.raw`SUMMARY:Plan\, review\; demo`);
    expect(fromIcs(text)).toEqual([
      { title: "Plan, review; demo", start: MON, minutes: 30, recurrence: "weekly", agenda: "1. API\n2. UI" },
    ]);
  });

  test("replies and transcript lines from two computers are both kept", () => {
    const a = meeting({ replies: { kerim: "yes" }, transcript: [{ who: "gm", at: 1, text: "hello" }], updatedAt: MON });
    const b = meeting({
      replies: { gm: "yes" },
      transcript: [{ who: "kerim", at: 2, text: "hi" }],
      updatedAt: MON + 1,
    });
    const merged = mergeMeeting(a, b);
    expect(merged.replies).toEqual({ kerim: "yes", gm: "yes" });
    expect(merged.transcript.map((l) => l.text)).toEqual(["hello", "hi"]);
    // A line arriving on its own lands in the meeting once.
    const state = emptyOrg();
    foldOrg(state, "org-meeting", a as never, { author: "gm", at: MON });
    for (let i = 0; i < 2; i++)
      foldOrg(
        state,
        "org-meeting-line",
        { meeting: "m1", who: "kerim", at: 5, text: "ok" },
        { author: "kerim", at: MON },
      );
    expect(state.meetings.m1?.transcript.map((l) => l.text)).toEqual(["hello", "ok"]);
  });

  test("reminders ten minutes before and at the start, not for whoever said no", () => {
    const m = meeting({ replies: { kerim: "no" } });
    expect(meetingNotices([m], "gm", [], MON - 9 * 60_000).map((n) => n.kind)).toEqual(["soon"]);
    expect(meetingNotices([m], "gm", [], MON + 60_000).map((n) => n.kind)).toEqual(["started"]);
    expect(meetingNotices([m], "kerim", [], MON - 9 * 60_000)).toEqual([]);
    expect(meetingNotices([m], "ali", [], MON - 9 * 60_000)).toEqual([]);
  });

  test("a call's room tells the hub nothing about its key", async () => {
    const key = newMeetingKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const room = await roomOfMeeting(key);
    expect(room).toMatch(/^[0-9a-f]{64}$/);
    expect(room).not.toContain(key.slice(0, 8));
  });
});
