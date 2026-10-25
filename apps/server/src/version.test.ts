import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { APP_VERSION } from "@igrek/core";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const version = (path: string) => (JSON.parse(readFileSync(join(ROOT, path), "utf8")) as { version: string }).version;

describe("one version number", () => {
  // A release changes them together; 0.1.4 and 0.1.5 left APP_VERSION behind, and the app called
  // itself 0.1.3 while the desktop package was 0.1.5.
  test("the server, the web app and every package say the same", () => {
    for (const file of [
      "package.json",
      "apps/desktop/package.json",
      "apps/server/package.json",
      "apps/hub/package.json",
      "apps/web/package.json",
    ])
      expect([file, version(file)]).toEqual([file, APP_VERSION]);
  });
});
