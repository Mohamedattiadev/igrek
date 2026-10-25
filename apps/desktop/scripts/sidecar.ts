/**
 * What the desktop app carries besides itself (plan.md Faz 17): Igrek's server as one JavaScript
 * file (and its scan worker), and the files that server reads from disk. Bun itself is not packed:
 * the app fetches it once on the first start (src-tauri/src/runtime.rs), which keeps the packages
 * near 15 MB instead of 60. Run after `bun run build` (the web app), before `tauri build`.
 *
 *   bun scripts/sidecar.ts [--target <rust target triple>]   (the target is accepted, not needed)
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const TAURI = resolve(import.meta.dir, "..", "src-tauri");

const web = join(ROOT, "apps/web/dist");
if (!existsSync(join(web, "index.html"))) throw new Error("Build the web app first: bun run build");

// The server's files on disk, where packaged.ts looks for them.
const resources = join(TAURI, "resources");
rmSync(resources, { recursive: true, force: true });
// The old single-file server, if an earlier build left it.
rmSync(join(TAURI, "binaries"), { recursive: true, force: true });
const copy = (from: string, to: string) => cpSync(join(ROOT, from), join(resources, to), { recursive: true });
copy("apps/web/dist", "web");
copy("packages/learn/content", "learn");
copy("apps/server/src/preview/agent.js", "preview/agent.js");
copy("apps/server/src/preview/vite-source-plugin.mjs", "preview/vite-source-plugin.mjs");

const server = join(ROOT, "apps/server/src");
cpSync(Bun.resolveSync("axe-core/axe.min.js", server), join(resources, "axe.min.js"));
const build = Bun.spawnSync(
  [
    process.execPath,
    "build",
    "--target=bun",
    "--minify-syntax",
    // packaged.ts: this bundle is the desktop app's server (its files are in the resources).
    `--define=process.env.IGREK_BUNDLE="1"`,
    join(server, "desktop.ts"),
    // Its own file beside the bundle: insight/worker.js (found by insight/index.ts).
    join(server, "insight/worker.ts"),
    `--root=${server}`,
    // Native add-ons that do not travel in a bundle. The search model needs ONNX Runtime, so the
    // desktop app searches the library by words; the browser automation part is not used.
    "--external=onnxruntime-node",
    "--external=chromium-bidi/*",
    `--outdir=${join(resources, "server")}`,
  ],
  { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
);
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);
console.log(`Server bundle: ${join(resources, "server/desktop.js")}`);
