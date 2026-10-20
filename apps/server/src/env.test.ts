import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findBrowser, shellCommand } from "./env";

describe("running outside Docker on Linux, macOS and Windows", () => {
  const only = (path: string) => (candidate: string) => candidate === path;

  test("the browser is found where each system puts it", () => {
    expect(findBrowser({}, "linux", only("/usr/bin/google-chrome-stable"))).toBe("/usr/bin/google-chrome-stable");
    const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    expect(findBrowser({}, "darwin", only(mac))).toBe(mac);
    const edge = join("C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe");
    expect(findBrowser({ "PROGRAMFILES(X86)": "C:\\Program Files (x86)" }, "win32", only(edge))).toBe(edge);
  });

  test("IGREK_BROWSER wins, and a missing browser says what to do", () => {
    expect(findBrowser({ IGREK_BROWSER: "/opt/chrome" }, "linux", only("/opt/chrome"))).toBe("/opt/chrome");
    expect(() => findBrowser({ IGREK_BROWSER: "/nope" }, "linux", () => false)).toThrow("IGREK_BROWSER");
    expect(() => findBrowser({}, "darwin", () => false)).toThrow("set IGREK_BROWSER");
  });

  test("shell steps run in sh, or in Git's bash on Windows, never in cmd.exe", () => {
    expect(shellCommand("echo hi", "darwin")).toEqual(["sh", "-c", "echo hi"]);
    expect(shellCommand("echo hi", "win32", () => "C:\\Git\\bin\\bash.exe")).toEqual([
      "C:\\Git\\bin\\bash.exe",
      "-c",
      "echo hi",
    ]);
    expect(() => shellCommand("echo hi", "win32", () => null)).toThrow("Git for Windows");
  });
});
