import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@igrek/core";
import { Bus, StopRegistry } from "./bus";
import { openDb } from "./db";
import { PersonaPacks } from "./persona-packs";
import { Personas } from "./personas";
import { Store } from "./store";

function setup() {
  const { sqlite } = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "igrek-packs-"));
  const personas = new Personas(sqlite, new Store(sqlite), new Bus(), new StopRegistry(), () => DEFAULT_SETTINGS, dir);
  const flowDir = join(dir, "flows");
  return { personas, flowDir, packs: new PersonaPacks(personas, flowDir) };
}

const reviewer = {
  id: "release-manager",
  name: "Release manager",
  role: "Checks a release before it goes out",
  tools: "edit",
  web: true,
  profile: { bio: "Has shipped releases for years." },
};
const pack = {
  format: "igrek-pack",
  version: 1,
  name: "Releases",
  author: "someone",
  personas: [reviewer, { id: "architect", profile: { bio: "A replacement for the built-in" } }],
  flows: [
    {
      name: "release-check",
      yaml: "name: release-check\nnodes:\n  - id: read\n    persona: release-manager\n    prompt: Check $REQUEST\n",
    },
    { name: "wipe", yaml: "name: wipe\nnodes:\n  - id: go\n    bash: rm -rf ~\n" },
    { name: "feature", yaml: "name: feature\nnodes:\n  - id: a\n    prompt: hi\n" },
  ],
};

describe("packages of experts and flows", () => {
  test("the preview says what would come in and what is refused, saving nothing", () => {
    const { packs, personas, flowDir } = setup();
    const preview = packs.preview(pack);
    expect(preview.personas.map((p) => [p.id, p.exists, p.asked])).toEqual([
      ["release-manager", false, { tools: "edit", web: true }],
      ["architect", true, { tools: "read", web: false }],
    ]);
    expect(preview.flows.map((f) => [f.name, f.ok, f.reason])).toEqual([
      ["release-check", true, undefined],
      ["wipe", false, "shell"],
      ["feature", false, "builtinName"],
    ]);
    expect(personas.get("release-manager")).toBeUndefined();
    expect(existsSync(flowDir)).toBe(false);
  });

  test("installing keeps the rules: read-only and off the web, built-ins untouched, no shell flows", () => {
    const { packs, personas, flowDir } = setup();
    const before = personas.get("architect")?.profile.bio;
    const saved = packs.install(pack, {
      personas: ["release-manager", "architect"],
      flows: ["release-check", "wipe", "feature"],
    });
    expect(saved).toEqual({ personas: ["release-manager"], flows: ["release-check"] });
    expect(personas.get("release-manager")).toMatchObject({ tools: "read", web: false, builtin: false });
    expect(personas.get("architect")?.profile.bio).toBe(before);
    expect(readFileSync(join(flowDir, "release-check.yaml"), "utf8")).toContain("release-manager");
    expect(existsSync(join(flowDir, "wipe.yaml"))).toBe(false);
    expect(packs.flows()).toEqual(["release-check"]);
  });

  test("your own experts and package flows make a package another Igrek can open", () => {
    const first = setup();
    first.packs.install(pack, { personas: ["release-manager"], flows: ["release-check"] });
    const built = first.packs.build({
      name: "Mine",
      personaIds: ["release-manager"],
      flows: ["release-check"],
    });
    const second = setup();
    expect(second.packs.preview(JSON.parse(JSON.stringify(built))).personas[0]?.id).toBe("release-manager");
  });

  test("something else, or a plain http address, is refused", async () => {
    const { packs } = setup();
    expect(() => packs.preview({ format: "other" })).toThrow("not an Igrek package");
    await expect(packs.fetchPack("http://example.com/p.json")).rejects.toThrow("https");
  });
});
