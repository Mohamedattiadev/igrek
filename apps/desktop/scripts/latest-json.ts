/**
 * latest.json, what the desktop app reads to learn of a new version (Tauri's updater): for each
 * computer, where its package is on the release and the package's signature, made with Igrek's
 * own update key while packaging. Run by .github/workflows/desktop.yml on a v* tag.
 *
 *   bun scripts/latest-json.ts <folder with the packages and .sig files> <tag>
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RELEASES = "https://github.com/Mohamedattiadev/igrek/releases/download";

const [dir, tag] = process.argv.slice(2);
if (!dir || !tag) throw new Error("usage: latest-json.ts <folder> <tag>");
const files = readdirSync(dir);

/** The package each computer updates from; Tauri's names for the computers. */
const PLATFORMS: [string, RegExp][] = [
  ["linux-x86_64", /\.AppImage$/],
  ["windows-x86_64", /\.msi$/],
  ["darwin-aarch64", /_aarch64\.app\.tar\.gz$/],
  ["darwin-x86_64", /_x86_64\.app\.tar\.gz$/],
];

const platforms: Record<string, { signature: string; url: string }> = {};
for (const [platform, pattern] of PLATFORMS) {
  const file = files.find((f) => pattern.test(f));
  if (!file || !files.includes(`${file}.sig`)) {
    console.error(`No signed package for ${platform}; that computer will not be offered this version.`);
    continue;
  }
  platforms[platform] = {
    signature: readFileSync(join(dir, `${file}.sig`), "utf8").trim(),
    url: `${RELEASES}/${tag}/${encodeURIComponent(file)}`,
  };
}
if (Object.keys(platforms).length === 0) throw new Error("No signed packages: is TAURI_SIGNING_PRIVATE_KEY set?");

const manifest = {
  version: tag.replace(/^v/, ""),
  notes: `https://github.com/Mohamedattiadev/igrek/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};
console.log(JSON.stringify(manifest, null, 2));
