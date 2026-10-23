/**
 * What the desktop app carries besides itself (plan.md Faz 17): Igrek's server as one file for the
 * target computer (`bun build --compile`), and the files that server reads from disk, which a
 * single file cannot hold as files. Run after `bun run build` (the web app), before `tauri build`.
 *
 *   bun scripts/sidecar.ts [--target <rust target triple>]
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { serverFile, targetTriple } from "./target";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const TAURI = resolve(import.meta.dir, "..", "src-tauri");

/** Rust's name for each computer the app is built for, and Bun's. */
const BUN_TARGETS: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
};

const triple = targetTriple();
const bunTarget = BUN_TARGETS[triple];
if (!bunTarget) throw new Error(`No Bun build for ${triple}`);

const web = join(ROOT, "apps/web/dist");
if (!existsSync(join(web, "index.html"))) throw new Error("Build the web app first: bun run build");

// Tauri looks for <name>-<target triple> and puts it beside the app as <name>.
mkdirSync(join(TAURI, "binaries"), { recursive: true });
const outfile = join(TAURI, "binaries", serverFile(triple));
const server = join(ROOT, "apps/server/src");
const build = Bun.spawnSync(
  [
    process.execPath,
    "build",
    "--compile",
    `--target=${bunTarget}`,
    "--minify-syntax",
    join(server, "desktop.ts"),
    // A worker is its own entry point inside the file.
    join(server, "insight/worker.ts"),
    // Native add-ons that cannot travel inside the file. The search model needs ONNX Runtime, so
    // the desktop app searches the library by words; the browser automation part is not used.
    "--external=onnxruntime-node",
    "--external=chromium-bidi/*",
    `--outfile=${outfile}`,
  ],
  { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
);
if (build.exitCode !== 0) process.exit(build.exitCode ?? 1);

// The server's files on disk, where packaged.ts looks for them.
const resources = join(TAURI, "resources");
rmSync(resources, { recursive: true, force: true });
const copy = (from: string, to: string) => cpSync(join(ROOT, from), join(resources, to), { recursive: true });
copy("apps/web/dist", "web");
copy("packages/learn/content", "learn");
copy("apps/server/src/preview/agent.js", "preview/agent.js");
copy("apps/server/src/preview/vite-source-plugin.mjs", "preview/vite-source-plugin.mjs");
cpSync(Bun.resolveSync("axe-core/axe.min.js", server), join(resources, "axe.min.js"));
console.log(`Server for ${triple}: ${outfile}`);
