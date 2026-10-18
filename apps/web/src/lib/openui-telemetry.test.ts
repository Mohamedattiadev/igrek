import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLibrary, defineComponent } from "@openuidev/lang-core";
import { z } from "zod";

/**
 * God Eye sends nothing anywhere (plan.md 16.2). OpenUI's lang-core has an install script that
 * reports to PostHog, and opt-in runtime telemetry. These tests show that neither reaches out:
 * Bun does not run the script, the flags turn it off, and the runtime stays quiet.
 */
const root = join(import.meta.dir, "../../../..");
const postinstall = join(dirname(require.resolve("@openuidev/lang-core/package.json")), "dist/postinstall.cjs");

/** Runs the install script with telemetry pointed at a local server; returns what reached it. */
async function runPostinstall(env: Record<string, string>): Promise<string[]> {
  const hits: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      hits.push(new URL(req.url).pathname);
      return new Response("ok");
    },
  });
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "OPENUI_TELEMETRY_DISABLED" && k !== "DO_NOT_TRACK"),
  ) as Record<string, string>;
  const proc = Bun.spawn([process.execPath, postinstall], {
    env: { ...clean, OPENUI_POSTHOG_HOST: `http://127.0.0.1:${server.port}`, ...env },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
  await Bun.sleep(200);
  server.stop(true);
  return hits;
}

describe("OpenUI sends nothing", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("Bun never runs lang-core's install script: it is not a trusted dependency", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { trustedDependencies?: string[] };
    expect((pkg.trustedDependencies ?? []).filter((d) => d.startsWith("@openuidev/"))).toEqual([]);
  });

  test("CI and the Docker build set the off switches", () => {
    const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    const docker = readFileSync(join(root, "docker/Dockerfile"), "utf8");
    for (const text of [ci, docker]) {
      expect(text).toMatch(/OPENUI_TELEMETRY_DISABLED[=:] ?"?1/);
      expect(text).toMatch(/DO_NOT_TRACK[=:] ?"?1/);
    }
  });

  test("the install script sends nothing with the flags set (and does send without them)", async () => {
    expect(await runPostinstall({ OPENUI_TELEMETRY_DISABLED: "1" })).toEqual([]);
    expect(await runPostinstall({ DO_NOT_TRACK: "1" })).toEqual([]);
    // The control: without the flags the script does call out, so the check above means something.
    expect(await runPostinstall({})).toEqual(["/capture/"]);
  });

  test("building a library and its prompt makes no request", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const Note = defineComponent({
      name: "Note",
      description: "A note",
      props: z.object({ text: z.string() }),
      component: null,
    });
    const library = createLibrary({ components: [Note], root: "Note" });
    for (let i = 0; i < 50; i++) library.prompt({ inlineMode: true });
    await Bun.sleep(100);
    expect(calls).toBe(0);
  });
});
