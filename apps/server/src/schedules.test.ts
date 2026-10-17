import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, nextRun } from "@godeye/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { type AgentRun, Flows } from "./flows";
import { Personas } from "./personas";
import { Schedules } from "./schedules";
import { Store } from "./store";

function setup(reply: string) {
  const { sqlite } = openDb(":memory:");
  const store = new Store(sqlite);
  const dir = mkdtempSync(join(tmpdir(), "godeye-sched-"));
  const git = (...args: string[]) =>
    Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args]);
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "# x\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  const projectId = store.addProject(dir);
  const bus = new Bus();
  const personas = new Personas(sqlite, store, bus, new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  const agent: AgentRun = async () => "Report: all quiet.";
  const flows = new Flows(
    sqlite,
    store,
    bus,
    new StopRegistry(),
    personas,
    mkdtempSync(join(tmpdir(), "godeye-wts-")),
    agent,
    async () => [],
  );
  const schedules = new Schedules(
    sqlite,
    store,
    bus,
    flows,
    () => DEFAULT_SETTINGS,
    async () => reply,
  );
  return { schedules, flows, projectId };
}

describe("schedule times", () => {
  test("next run for daily, weekday, weekly, monthly and once", () => {
    const fri = new Date(2026, 9, 16, 10, 0).getTime(); // Friday 10:00
    expect(new Date(nextRun({ kind: "repeat", every: "day", time: "09:00" }, fri) as number).getDate()).toBe(17);
    const weekday = new Date(nextRun({ kind: "repeat", every: "weekday", time: "09:00" }, fri) as number);
    expect(weekday.getDay()).toBe(1);
    const weekly = new Date(nextRun({ kind: "repeat", every: "week", time: "09:00", weekday: 5 }, fri) as number);
    expect([weekly.getDate(), weekly.getHours()]).toEqual([23, 9]);
    expect(new Date(nextRun({ kind: "repeat", every: "month", time: "08:00", day: 1 }, fri) as number).getMonth()).toBe(
      10,
    );
    expect(nextRun({ kind: "once", at: fri - 1 }, fri)).toBeUndefined();
  });
});

describe("schedules", () => {
  test("a sentence becomes a proposal; only after your OK does it run on time, in its own copy", async () => {
    const at = new Date(2026, 9, 16, 10, 0).getTime();
    const { schedules, flows, projectId } = setup(
      '{"title":"Haftalık rapor","request":"Write a short report","flow":"report","when":{"kind":"repeat","every":"week","time":"09:00","weekday":5},"summary":"Her cuma 09:00, proje: kısa rapor"}',
    );
    const s = await schedules.propose("her cuma sabahı kısa bir rapor yaz", projectId, at);
    expect(s).toMatchObject({ status: "proposed", flow: "report", summary: "Her cuma 09:00, proje: kısa rapor" });
    expect(schedules.tick(at + 8 * 86_400_000)).toEqual([]);
    expect(schedules.notices(at).some((n) => n.kind === "proposed")).toBe(true);

    const active = schedules.activate(s.id, at);
    const due = active.nextAt as number;
    expect(new Date(due).getDay()).toBe(5);
    expect(schedules.tick(due - 60_000)).toEqual([]);
    const [runId] = schedules.tick(due + 60_000);
    expect(runId).toBeDefined();
    for (let i = 0; i < 100 && flows.get(runId as string)?.status === "running"; i++) await Bun.sleep(10);
    // A report changes nothing: the run is simply done, its copy cleaned up.
    expect(flows.get(runId as string)).toMatchObject({
      status: "done",
      scheduleId: s.id,
      limits: { maxMinutes: 45, maxTurns: 60 },
    });
    expect(schedules.get(s.id)?.nextAt).toBe(due + 7 * 86_400_000);
    expect(schedules.history(s.id)).toHaveLength(1);
  });

  test("a time missed while the computer was off is asked about, not run", () => {
    const at = new Date(2026, 9, 16, 10, 0).getTime();
    const { schedules, projectId } = setup("");
    const s = schedules.create(
      {
        projectId,
        title: "Night check",
        request: "check",
        flow: "check",
        when: { kind: "repeat", every: "day", time: "02:00" },
        status: "active",
      },
      at,
    );
    const due = s.nextAt as number;
    expect(schedules.tick(due + 3 * 60 * 60_000)).toEqual([]);
    const missed = schedules.get(s.id);
    expect(missed?.missedAt).toBe(due);
    expect(missed?.nextAt).toBe(due + 86_400_000);
    expect(schedules.notices(due).some((n) => n.kind === "missed")).toBe(true);
    schedules.skipMissed(s.id);
    expect(schedules.get(s.id)?.missedAt).toBeUndefined();
  });
});
