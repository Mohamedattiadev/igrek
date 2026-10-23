import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The desktop app stops its server only by closing the server's stdin. This runs it from source;
// the single-file build once missed that end where the source did not (a for-await over
// Bun.stdin.stream()), so after changing desktop.ts try the built file by hand too (docs/desktop.md).
test("the desktop server stops when its stdin closes", async () => {
  const home = mkdtempSync(join(tmpdir(), "igrek-desktop-"));
  const free = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = String(free.port);
  free.stop(true);
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "desktop.ts")], {
    env: {
      ...process.env,
      IGREK_HOME: home,
      IGREK_PORT: port,
      IGREK_HOST: "127.0.0.1",
      IGREK_WEB_DIST: join(home, "none"),
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  try {
    const reader = proc.stdout.getReader();
    let out = "";
    while (!out.includes(`:${port}`)) {
      const { value, done } = await reader.read();
      if (done) break;
      out += new TextDecoder().decode(value);
    }
    expect(out).toContain(`:${port}`);
    proc.stdin.end();
    const code = await Promise.race([proc.exited, Bun.sleep(15_000).then(() => "still running")]);
    expect(code).toBe(0);
  } finally {
    proc.kill(9);
    rmSync(home, { recursive: true, force: true });
  }
}, 30_000);
