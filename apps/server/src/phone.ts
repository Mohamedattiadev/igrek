import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { PhoneCheck, PhoneDevice } from "@igrek/core";
import type { Hono } from "hono";

/**
 * Testing a mobile app on the user's own phone (plan.md 10), for a computer too weak for an
 * emulator: Android Debug Bridge (adb, free) over USB or Wi-Fi. Igrek shows the phone's screen,
 * taps and types on it, installs the project's APK, and checks the screen the way the real-screen
 * check does for the web: touch targets too small for a finger, buttons with no name for a screen
 * reader, and crashes. adb is run without a shell; IGREK_ADB chooses the program (tests seal it off).
 */
type Run = (args: string[]) => Promise<{ code: number; out: Buffer; err: string }>;

const SERIAL = /^[\w.:-]{2,80}$/;
/** Android's recommended smallest touch target (Material Design, and Android's accessibility checks). */
const MIN_DP = 48;

function adbRunner(program = process.env.IGREK_ADB || "adb"): Run {
  return async (args) => {
    const path = program.includes("/") ? program : Bun.which(program);
    if (!path || !existsSync(path)) return { code: 127, out: Buffer.alloc(0), err: "adb is not installed" };
    const proc = Bun.spawn([path, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const timer = setTimeout(() => proc.kill(), 30_000);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return { code, out: Buffer.from(out), err: err.trim() };
  };
}

/** `adb devices -l`: each phone with its state and model. */
export function parseDevices(text: string): PhoneDevice[] {
  return text
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const [serial = "", state = "", ...rest] = line.split(/\s+/);
      if (!SERIAL.test(serial)) return [];
      const info = Object.fromEntries(rest.map((p) => p.split(":")).filter((p) => p.length === 2));
      return [
        {
          serial,
          state: state === "device" ? "ready" : state === "unauthorized" ? "unauthorized" : "offline",
          model: info.model?.replace(/_/g, " "),
          wifi: serial.includes(":"),
        } satisfies PhoneDevice,
      ];
    });
}

const attr = (node: string, name: string) => node.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";

/** The screen's elements (uiautomator's dump) checked: touch targets and names, in dp for this phone. */
export function checkScreen(xml: string, density: number): Omit<PhoneCheck, "crashes" | "at"> {
  const scale = 160 / Math.max(density, 1);
  const small: PhoneCheck["small"] = [];
  const unnamed: PhoneCheck["unnamed"] = [];
  const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
  // A clickable element's name may come from text inside it; the dump nests nodes, so look ahead.
  nodes.forEach((node, i) => {
    if (attr(node, "clickable") !== "true" || attr(node, "visible-to-user") === "false") return;
    const [x1, y1, x2, y2] = (attr(node, "bounds").match(/\d+/g) ?? []).map(Number);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return;
    const width = Math.round((x2 - x1) * scale);
    const height = Math.round((y2 - y1) * scale);
    if (width <= 0 || height <= 0) return;
    const where = { bounds: [x1, y1, x2, y2] as [number, number, number, number], id: attr(node, "resource-id") };
    if (width < MIN_DP || height < MIN_DP) small.push({ ...where, width, height });
    const own = attr(node, "text") || attr(node, "content-desc");
    const inside = nodes.slice(i + 1, i + 6).some((n) => {
      const [a, b, c, d] = (attr(n, "bounds").match(/\d+/g) ?? []).map(Number);
      return (
        (attr(n, "text") || attr(n, "content-desc")) &&
        (a ?? -1) >= x1 &&
        (b ?? -1) >= y1 &&
        (c ?? Number.POSITIVE_INFINITY) <= x2 &&
        (d ?? Number.POSITIVE_INFINITY) <= y2
      );
    });
    if (!own && !inside) unnamed.push({ ...where, kind: attr(node, "class").split(".").pop() ?? "" });
  });
  return { small: small.slice(0, 50), unnamed: unnamed.slice(0, 50) };
}

/** Built APKs in a project (Gradle, Flutter, React Native, Capacitor all put them under a build folder). */
export function findApks(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || out.length >= 20) return;
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".")) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path, depth + 1);
      else if (e.name.endsWith(".apk") && /(^|\/)build(\/|$)|outputs/.test(relative(root, path))) out.push(path);
    }
  };
  walk(root, 0);
  return out.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

/** Characters `adb shell input text` needs written another way (it runs on the phone's shell). */
function inputText(text: string): string {
  return text.replace(/[\\'"`$&|;<>()*~#?[\]{}!]/g, "\\$&").replace(/ /g, "%s");
}

export class Phone {
  constructor(private readonly run: Run = adbRunner()) {}

  private async adb(serial: string | undefined, args: string[]): Promise<Buffer> {
    if (serial !== undefined && !SERIAL.test(serial)) throw new Error("Unknown phone");
    const res = await this.run([...(serial ? ["-s", serial] : []), ...args]);
    if (res.code === 127) throw new Error("adb is not installed");
    if (res.code !== 0) throw new Error(res.err.split("\n").pop() || `adb failed (${res.code})`);
    return res.out;
  }

  async devices(): Promise<{ adb: boolean; devices: PhoneDevice[] }> {
    try {
      return { adb: true, devices: parseDevices((await this.adb(undefined, ["devices", "-l"])).toString()) };
    } catch (err) {
      if ((err as Error).message === "adb is not installed") return { adb: false, devices: [] };
      throw err;
    }
  }

  /** Android 11+ wireless debugging: the pairing address and code the phone shows, then the connect address. */
  async pair(address: string, code: string): Promise<string> {
    if (!/^[\w.-]+:\d{2,5}$/.test(address) || !/^\d{6}$/.test(code))
      throw new Error("Give the address and 6-digit code");
    return (await this.adb(undefined, ["pair", address, code])).toString().trim();
  }

  async connect(address: string): Promise<string> {
    if (!/^[\w.-]+:\d{2,5}$/.test(address)) throw new Error("Give the address shown under Wireless debugging");
    const out = (await this.adb(undefined, ["connect", address])).toString().trim();
    if (/failed|unable|cannot/i.test(out)) throw new Error(out);
    return out;
  }

  screenshot(serial: string): Promise<Buffer> {
    return this.adb(serial, ["exec-out", "screencap", "-p"]);
  }

  async tap(serial: string, x: number, y: number): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new Error("Tap inside the screen");
    await this.adb(serial, ["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
  }

  async key(serial: string, key: "back" | "home" | "apps"): Promise<void> {
    await this.adb(serial, ["shell", "input", "keyevent", { back: "4", home: "3", apps: "187" }[key]]);
  }

  async type(serial: string, text: string): Promise<void> {
    if (!text || text.length > 500) throw new Error("Type up to 500 characters");
    await this.adb(serial, ["shell", "input", "text", inputText(text)]);
  }

  async install(serial: string, apk: string): Promise<string> {
    return (await this.adb(serial, ["install", "-r", apk])).toString().trim().split("\n").pop() ?? "";
  }

  /** The screen as it is now, checked, plus the crashes the phone logged lately. */
  async check(serial: string, now = Date.now()): Promise<PhoneCheck> {
    const xml = (await this.adb(serial, ["exec-out", "uiautomator", "dump", "/dev/tty"])).toString();
    const density = Number(
      (await this.adb(serial, ["shell", "wm", "density"])).toString().match(/(\d+)\s*$/m)?.[1] ?? "420",
    );
    const crashes = (await this.adb(serial, ["logcat", "-d", "-b", "crash", "-t", "200"]).catch(() => Buffer.alloc(0)))
      .toString()
      .split("\n")
      .filter((l) => /FATAL EXCEPTION|AndroidRuntime|Process:/.test(l))
      .slice(-20);
    return { at: now, ...checkScreen(xml.slice(xml.indexOf("<?xml")), density), crashes };
  }
}

/** The Phone tab: devices and pairing, the screen and touches, a project's APK, and the screen check. */
export function registerPhoneRoutes(
  app: Hono,
  phone: Phone,
  projectRoot: (projectId: string) => string | undefined,
): void {
  const fail = (err: unknown) => Response.json({ error: (err as Error).message }, { status: 400 });
  const body = async (c: { req: { json: () => Promise<unknown> } }) =>
    ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const act = (run: () => Promise<unknown>) =>
    run()
      .then((r) => Response.json(r ?? { ok: true }))
      .catch(fail);

  app.get("/api/phone", () => act(() => phone.devices()));
  app.post("/api/phone/pair", async (c) => {
    const b = await body(c);
    return act(async () => ({ message: await phone.pair(str(b.address), str(b.code)) }));
  });
  app.post("/api/phone/connect", async (c) => {
    const b = await body(c);
    return act(async () => ({ message: await phone.connect(str(b.address)) }));
  });
  app.get("/api/phone/:serial/screen", async (c) => {
    try {
      const png = await phone.screenshot(c.req.param("serial"));
      return new Response(new Uint8Array(png), {
        headers: { "content-type": "image/png", "cache-control": "no-store" },
      });
    } catch (err) {
      return fail(err);
    }
  });
  app.post("/api/phone/:serial/tap", async (c) => {
    const b = await body(c);
    return act(() => phone.tap(c.req.param("serial"), Number(b.x), Number(b.y)));
  });
  app.post("/api/phone/:serial/key", async (c) => {
    const key = str((await body(c)).key);
    if (key !== "back" && key !== "home" && key !== "apps") return fail(new Error("Unknown key"));
    return act(() => phone.key(c.req.param("serial"), key));
  });
  app.post("/api/phone/:serial/text", async (c) => {
    const text = str((await body(c)).text);
    return act(() => phone.type(c.req.param("serial"), text));
  });
  app.post("/api/phone/:serial/check", (c) => act(() => phone.check(c.req.param("serial"))));
  app.get("/api/projects/:id/apks", (c) => {
    const root = projectRoot(c.req.param("id"));
    return c.json(root ? findApks(root).map((p) => relative(root, p)) : []);
  });
  app.post("/api/phone/:serial/install", async (c) => {
    const b = await body(c);
    const root = projectRoot(str(b.projectId));
    // Only an APK the project's own build made: one of the files findApks lists.
    const apk = root ? findApks(root).find((p) => relative(root, p) === str(b.path)) : undefined;
    if (!apk) return fail(new Error("Build the app first; no APK was found in this project"));
    return act(async () => ({ message: await phone.install(c.req.param("serial"), apk) }));
  });
}
