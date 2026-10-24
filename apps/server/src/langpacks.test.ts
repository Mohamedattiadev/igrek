import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Bus } from "./bus";
import { flatten, LanguagePacks, unflatten } from "./langpacks";

async function settle(packs: LanguagePacks, code: string) {
  for (let i = 0; i < 200 && packs.status(code).state === "generating"; i++) await Bun.sleep(10);
}

/** A fake translator: echoes the keys with a marker, breaks one placeholder, adds Russian plural forms. */
function fakeAsk(prompts: string[]) {
  return async (prompt: string) => {
    prompts.push(prompt);
    const input = JSON.parse(prompt.slice(prompt.indexOf("\n{")));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, string>)) {
      out[k] = k === "projects.changes_other" ? "broken" : `[x] ${v}`;
      if (k.endsWith("_other") && prompt.includes("_few")) out[k.replace(/_other$/, "_few")] = `[few] ${v}`;
    }
    return `Here you go:\n${JSON.stringify(out)}`;
  };
}

describe("language packs", () => {
  test("flatten and unflatten are inverse", () => {
    const nested = { a: { b: "x", c: { d: "y" } }, e: "z" };
    expect(unflatten(flatten(nested))).toEqual(nested);
  });

  test("a new language is translated in parts and works offline afterwards", async () => {
    const prompts: string[] = [];
    const packs = new LanguagePacks(mkdtempSync(join(tmpdir(), "igrek-i18n-")), new Bus(), "/tmp", fakeAsk(prompts));
    expect(packs.status("de").state).toBe("none");
    packs.generate("de");
    await settle(packs, "de");
    const status = packs.status("de");
    // The one with a broken {{count}} stays English; everything else is translated.
    expect(status.total - status.done).toBeLessThanOrEqual(1);
    expect(prompts.length).toBeGreaterThan(3);
    expect(prompts[0]).toContain("German");
    const messages = packs.messages("de") as { projects: Record<string, string> };
    expect(messages.projects.changes_other).toBeUndefined();
    expect(messages.projects.title).toStartWith("[x] ");
    // A second run only asks for what's missing.
    const before = prompts.length;
    packs.generate("de");
    await settle(packs, "de");
    expect(prompts.length - before).toBe(1);
  });

  test("a part that fails is tried again, and the chosen language completes itself", async () => {
    const prompts: string[] = [];
    const echo = fakeAsk(prompts);
    let calls = 0;
    // The second part fails the first time it is asked, as a cut-off reply would.
    const ask = async (prompt: string) => (++calls === 2 ? "{ cut off" : echo(prompt));
    const packs = new LanguagePacks(mkdtempSync(join(tmpdir(), "igrek-i18n-")), new Bus(), "/tmp", ask);
    packs.complete("en");
    packs.complete("xx");
    expect(packs.status("de").state).toBe("none");
    packs.complete("de");
    await settle(packs, "de");
    const status = packs.status("de");
    expect(status.error).toBeUndefined();
    expect(status.total - status.done).toBeLessThanOrEqual(1);
    // Already whole (but for the one broken text): completing again asks only for that.
    const before = calls;
    packs.complete("de");
    await settle(packs, "de");
    expect(calls - before).toBeLessThanOrEqual(1);
  });

  test("a plural form the model left out falls back to the same language, not English", async () => {
    // A translator that writes only _other, as Haiku did for some Arabic texts.
    const ask = async (prompt: string) => {
      const input = JSON.parse(prompt.slice(prompt.indexOf("\n{"))) as Record<string, string>;
      return JSON.stringify(Object.fromEntries(Object.entries(input).map(([k, v]) => [k, `[ar] ${v}`])));
    };
    const packs = new LanguagePacks(mkdtempSync(join(tmpdir(), "igrek-i18n-")), new Bus(), "/tmp", ask);
    packs.generate("ar");
    await settle(packs, "ar");
    const flat = flatten(packs.messages("ar"));
    const other = Object.keys(flat).find((k) => k.endsWith("_other")) as string;
    const base = other.slice(0, -"_other".length);
    for (const form of ["zero", "one", "two", "few", "many"]) expect(flat[`${base}_${form}`]).toStartWith("[ar] ");
  });

  test("languages with more plural forms get them", async () => {
    const prompts: string[] = [];
    const packs = new LanguagePacks(mkdtempSync(join(tmpdir(), "igrek-i18n-")), new Bus(), "/tmp", fakeAsk(prompts));
    packs.generate("ru");
    await settle(packs, "ru");
    expect(prompts[0]).toContain("_few");
    const flat = flatten(packs.messages("ru"));
    expect(Object.keys(flat).some((k) => k.endsWith("_few"))).toBe(true);
  });

  test("corrections win, must keep placeholders, and work for bundled languages too", () => {
    const packs = new LanguagePacks(mkdtempSync(join(tmpdir(), "igrek-i18n-")), new Bus(), "/tmp", async () => "{}");
    packs.setOverride("tr", "projects.title", "Projelerim");
    expect((packs.messages("tr") as { projects: { title: string } }).projects.title).toBe("Projelerim");
    expect(packs.rows("tr").find((r) => r.key === "projects.title")).toMatchObject({
      corrected: true,
      text: "Projelerim",
    });
    expect(() => packs.setOverride("tr", "projects.changes_other", "değişiklik")).toThrow(/\{\{/);
    expect(() => packs.setOverride("tr", "not.a.key", "x")).toThrow();
    packs.setOverride("tr", "projects.title", null);
    expect(packs.rows("tr").find((r) => r.key === "projects.title")?.corrected).toBe(false);
  });
});
