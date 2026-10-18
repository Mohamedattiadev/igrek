/**
 * Interface texts nobody shows (plan.md 15.1 dead code): every key in packages/i18n/locales/en.json
 * must be used by the code, either written out ("files.title") or built from a fixed prefix
 * (`insight.check.${id}.title`, `servers.tag_${tag}`). knip does not see JSON keys, so this does.
 *
 *   bun scripts/dead-keys.ts          list unused keys, exit 1 when there are any
 *   bun scripts/dead-keys.ts --fix    remove them from every locale file
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const LOCALES = join(ROOT, "packages/i18n/locales");
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Tree = { [key: string]: string | Tree };

export function keysOf(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keysOf(v, `${prefix}${k}.`),
  );
}

function sourceText(): string {
  const parts: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === "node_modules" || name === "locales" || name === "dist") continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) parts.push(readFileSync(path, "utf8"));
    }
  };
  for (const dir of ["apps", "packages"]) walk(join(ROOT, dir));
  return parts.join("\n");
}

function usedAs(key: string, src: string): boolean {
  if (src.includes(`"${key}"`) || src.includes(`'${key}'`) || src.includes(`\`${key}\``)) return true;
  const parts = key.split(".");
  // Built from a prefix: `insight.check.${id}` or "learn." + id.
  for (let i = 1; i < parts.length; i++) {
    const prefix = `${parts.slice(0, i).join(".")}.`;
    if (src.includes(`\`${prefix}\${`) || src.includes(`"${prefix}" +`)) return true;
  }
  // Built inside the last part: `servers.tag_${tag}`, `status-${s}`.
  const last = parts.at(-1) ?? "";
  for (let i = 0; i < last.length; i++)
    if ((last[i] === "_" || last[i] === "-") && src.includes(`${last.slice(0, i + 1)}\${`)) return true;
  return false;
}

/** Keys of the English file the code never uses (plural forms count as their base key). */
export function unusedKeys(tree: Tree, src: string): string[] {
  return keysOf(tree).filter((k) => !usedAs(k, src) && !usedAs(k.replace(PLURAL, ""), src));
}

/** Removes a key, and any group it leaves empty. */
function remove(tree: Tree, key: string): void {
  const [head, ...rest] = key.split(".");
  if (!head) return;
  const child = tree[head];
  if (!rest.length) delete tree[head];
  else if (typeof child === "object") {
    remove(child, rest.join("."));
    if (!Object.keys(child).length) delete tree[head];
  }
}

if (import.meta.main) {
  const en = JSON.parse(readFileSync(join(LOCALES, "en.json"), "utf8")) as Tree;
  const unused = unusedKeys(en, sourceText());
  if (process.argv.includes("--fix")) {
    for (const file of readdirSync(LOCALES).filter((f) => f.endsWith(".json"))) {
      const tree = JSON.parse(readFileSync(join(LOCALES, file), "utf8")) as Tree;
      for (const key of unused) remove(tree, key);
      writeFileSync(join(LOCALES, file), `${JSON.stringify(tree, null, 2)}\n`);
    }
    console.log(`removed ${unused.length} unused keys`);
    process.exit(0);
  }
  for (const key of unused) console.log(`x unused text: ${key}`);
  console.log(unused.length ? `${unused.length} unused interface texts` : "no unused interface texts");
  process.exit(unused.length ? 1 : 0);
}
