/**
 * Starts the single-file server the way the desktop app does (src-tauri/src/server.rs) and checks
 * what building a package cannot: that it answers with the web app it carries, and that it stops
 * once its stdin closes, which is how the app stops it (apps/server/src/desktop.ts). Run after
 * sidecar.ts; the desktop workflow runs it on every system, where nobody tries the app by hand.
 *
 *   bun scripts/smoke.ts [--target <rust target triple>]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serverFile, targetTriple } from "./target";

const TAURI = resolve(import.meta.dir, "..", "src-tauri");
const triple = targetTriple();

// A server built for the other Mac processor may not run on this one; it is built, not tried.
const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch as string];
if (!triple.startsWith(arch ?? "?")) {
  console.log(`skipped: ${triple} does not run on this ${process.arch} computer`);
  process.exit(0);
}

const free = Bun.serve({ port: 0, fetch: () => new Response() });
const port = free.port;
free.stop(true);
const home = mkdtempSync(join(tmpdir(), "igrek-smoke-"));
const server = Bun.spawn([join(TAURI, "binaries", serverFile(triple))], {
  env: {
    ...process.env,
    IGREK_HOME: home,
    IGREK_PORT: String(port),
    IGREK_HOST: "127.0.0.1",
    IGREK_RESOURCES: join(TAURI, "resources"),
  },
  stdin: "pipe",
  stdout: "inherit",
  stderr: "inherit",
});

function fail(why: string): never {
  console.error(`x ${why}`);
  server.kill(9);
  process.exit(1);
}

/** The first page, as the app's window asks for it; a slow first start (Windows) gets time. */
async function firstPage(): Promise<string> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (server.exitCode !== null) fail(`the server ended at once (code ${server.exitCode})`);
    const page = await fetch(`http://127.0.0.1:${port}/`)
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    if (page) return page;
    await Bun.sleep(500);
  }
  return fail("the server did not answer within 90 seconds");
}

const page = await firstPage();
if (!page.includes('id="root"')) fail("the server answered without the web app");
console.log(`answers on port ${port} with the web app`);

const started = Date.now();
server.stdin.end();
const code = await Promise.race([server.exited, Bun.sleep(15_000).then(() => "still running")]);
if (code === "still running") fail("the server kept running 15 seconds after its stdin closed");
console.log(`stopped ${((Date.now() - started) / 1000).toFixed(1)} s after its stdin closed (code ${code})`);
rmSync(home, { recursive: true, force: true });
if (code !== 0) process.exit(1);
