/** Which computer the desktop app is built for: `--target <rust triple>`, or this one. */

function hostTriple(): string {
  const out = Bun.spawnSync(["rustc", "-vV"]).stdout.toString();
  const host = out.match(/^host: (\S+)/m)?.[1];
  if (!host) throw new Error("rustc not found: install Rust (https://rustup.rs)");
  return host;
}

export function targetTriple(): string {
  const flag = process.argv.indexOf("--target");
  return flag > 0 ? (process.argv[flag + 1] ?? "") : hostTriple();
}

/** The server file sidecar.ts makes for that computer (Tauri wants <name>-<triple>). */
export function serverFile(triple: string): string {
  return `igrek-server-${triple}${triple.includes("windows") ? ".exe" : ""}`;
}
